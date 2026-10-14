import { setHexControl } from '../../domain/map/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import { previewRetreatChoice, settleDeclaredAttackerSupply } from '../combat/combat.js';
import { applyModeChange } from '../mode/mode.js';
import { internalStocksOf, isCombatUnit, isHq, isTransportPoint, mobilityOf, pieceById, reTicksOf, stepOf, withInternalStocks } from '../pieces.js';
import { capturePort } from '../port/port.js';
import type { GameAction, GameState } from '../kernel/model.js';
import type { RuleFact } from '../query/model.js';
import { dumpsReaching, eatOffMapCost, pieceHasTrace, spendReservations } from './supply.js';
import { advanceRationsPreserved } from './ration-budget.js';

/** One unit's next ration, capped at its cost. CHECK_SUPPLY pays from a single source.
 * This is individual access, not an allocation of shared stock among competing consumers. */
export const availableRationTokens = (state: GameState, piece: PieceState): number => {
  if (piece.location.kind !== 'ON_MAP') return 0;
  const cost = eatOffMapCost(reTicksOf(state, piece));
  if (pieceHasTrace(state, piece)) return cost;
  if (piece.mode === 'STRAT') return 0;
  return Math.min(cost, Math.max(0, ...dumpsReaching(state, piece.ownerId, piece.location.hexId, piece).map(dump => dump.availableQuantity)));
};

/**
 * Friendly trace and individual SP ration access after a proposed relocation, with other pieces held fixed.
 * Includes deterministic hex/port control, but no random captures or enemy response. Consumes no dice.
 * Trace continuity and SP access are separate facts. A different HQ, direct route or dump may keep a unit supplied.
 */
export const relocationSupplyFacts = (state: GameState, action: GameAction): readonly RuleFact[] => {
  const own = () => state.pieceState.pieces.filter(piece => piece.ownerId === action.actorId
    && piece.location.kind === 'ON_MAP' && isCombatUnit(state, piece));
  const fact = (key: string, value: string | number | boolean): RuleFact => ({ key, value, visibility: 'OWNER_ONLY', ownerId: action.actorId });
  if (action.kind === 'DECLARE_COMBAT' && action.combatKind === 'OVERRUN') {
    // Conditional on clearing the target with all attackers surviving. Pay the real declared
    // attack cost; remove target enemies without crediting random captures or predicting retreats.
    const declared = settleDeclaredAttackerSupply(state, action.actorId, action.attackerIds, action.attackerSupply);
    if (declared.violations.length) return [];
    const spent = spendReservations(state, declared.payments);
    const paid = { ...state, pieceState: { ...spent, pieces: spent.pieces.map(p => declared.internalIds.includes(p.id)
      ? withInternalStocks(p, internalStocksOf(p) === 'FULL' ? 'LOW' : 'EXHAUSTED') : p) } };
    const movers = action.attackerIds.filter(id => { const p = pieceById(state, id)!;
      return mobilityOf(state, p) !== null && Number(stepOf(state, p)?.movementPointTicks ?? 0) > 0; });
    let after: GameState = { ...paid, mapState: setHexControl(paid.mapState, action.targetHexId, action.actorId),
      pieceState: { ...paid.pieceState, pieces: paid.pieceState.pieces
        .filter(p => !(p.ownerId !== action.actorId && p.location.kind === 'ON_MAP' && p.location.hexId === action.targetHexId))
        .map(p => movers.includes(p.id) ? { ...p, location: { kind: 'ON_MAP' as const, hexId: action.targetHexId } } : p) } };
    after = capturePort(after, action.actorId, action.targetHexId, []);
    return [fact('supply.overrunAdvanceFunded', advanceRationsPreserved(state, after, action.actorId, movers)),
      fact('supply.overrunOtherTraceLost', own().filter(p => !movers.includes(p.id) && pieceHasTrace(state, p)
        && !pieceHasTrace(after, pieceById(after, p.id)!)).length)];
  }
  if (action.kind === 'RESPOND_DECISION') {
    // Use only existing friendly stock: random enemy resource captures may improve this bound.
    if (state.pendingDecision?.kind === 'ADVANCE_HEX' && action.choiceId.startsWith('advance:')
      && !['advance:all', 'advance:done'].includes(action.choiceId)) {
      const target = state.activeTransaction?.targetHexId;
      const unit = state.pieceState.pieces.find(piece => piece.id === action.choiceId.slice('advance:'.length));
      if (!target || !unit || unit.ownerId !== action.actorId || unit.location.kind !== 'ON_MAP'
        || !isCombatUnit(state, unit)) return [];
      const relocated = { ...unit, location: { kind: 'ON_MAP' as const, hexId: target } };
      let after: GameState = { ...state, mapState: setHexControl(state.mapState, target, action.actorId), pieceState: { ...state.pieceState,
        pieces: state.pieceState.pieces.filter(p => !(p.ownerId !== action.actorId && p.location.kind === 'ON_MAP' && p.location.hexId === target))
          .map(piece => piece.id === unit.id ? relocated : piece) } };
      after = capturePort(after, action.actorId, target, []);
      const units = own();
      return [
        fact('supply.advanceTraceLost', units.filter(piece => pieceHasTrace(state, piece)
          && !pieceHasTrace(after, pieceById(after, piece.id)!)).length),
        fact('supply.advanceFeedLost', units.filter(piece => !pieceHasTrace(state, piece)
          && availableRationTokens(after, pieceById(after, piece.id)!) < availableRationTokens(state, piece)).length),
        fact('supply.advanceMoverHasTrace', pieceHasTrace(after, relocated)),
        fact('supply.advanceFunded', advanceRationsPreserved(state, after, action.actorId, [unit.id])),
      ];
    }
    const preview = previewRetreatChoice(state, action.choiceId);
    if (!preview) return [];
    const after = preview.state;
    const units = own();
    return [
      fact('supply.retreatTraceLost', units.filter(piece => pieceHasTrace(state, piece) && !pieceHasTrace(after, pieceById(after, piece.id)!)).length),
      fact('supply.retreatUnfed', units.filter(piece => {
        const next = pieceById(after, piece.id)!;
        return availableRationTokens(after, next) < eatOffMapCost(reTicksOf(after, next));
      }).length),
      fact('supply.retreatForcedLosses', preview.additionalLosses),
    ];
  }
  if (action.kind !== 'CHANGE_MODE' && action.kind !== 'MOVE_PIECE') return [];
  const unit = pieceById(state, action.pieceId);
  if (!unit || unit.ownerId !== action.actorId || unit.location.kind !== 'ON_MAP'
    || !(isCombatUnit(state, unit) || isTransportPoint(state, unit))) return [];
  const hq = isHq(state, unit);
  const destination = action.kind === 'MOVE_PIECE' ? action.path.at(-1) : null;
  if (action.kind === 'MOVE_PIECE' && !destination) return [];
  const relocated = action.kind === 'CHANGE_MODE' ? applyModeChange(unit, action.mode)
    : { ...unit, location: { kind: 'ON_MAP' as const, hexId: destination! } };
  // 6.1f: a stack's other units arrive with it.
  const moved = new Map<string, PieceState>([[String(unit.id), relocated]]);
  if (action.kind === 'MOVE_PIECE') {
    for (const id of action.companionIds ?? []) {
      const companion = pieceById(state, id);
      if (companion) moved.set(String(id), { ...companion, location: { kind: 'ON_MAP', hexId: destination! } });
    }
  }
  const at = (piece: PieceState): PieceState => moved.get(String(piece.id)) ?? piece;
  const mapState = action.kind === 'MOVE_PIECE' && [...moved.values()].some((piece) => isCombatUnit(state, piece))
    ? action.path.slice(1).reduce((map, hexId) => setHexControl(map, hexId, action.actorId), state.mapState)
    : state.mapState;
  let after: GameState = { ...state, mapState, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map(at) } };
  if (action.kind === 'MOVE_PIECE') {
    for (const hexId of action.path.slice(1)) after = capturePort(after, action.actorId, hexId, []);
  }
  const units = own();
  const traced = units.filter(piece => pieceHasTrace(state, piece));
  const lost = traced.filter(piece => !pieceHasTrace(after, at(piece)));
  const feedLost = units.filter(piece => !pieceHasTrace(state, piece)
    && availableRationTokens(after, at(piece)) < availableRationTokens(state, piece));
  const others = lost.filter(piece => !moved.has(String(piece.id)));
  return [
    fact('supply.relocationFeedLost', feedLost.length),
    fact('supply.relocationFeedLostIds', feedLost.map(piece => piece.id).join(',')),
    fact('supply.relocationTraceLost', lost.length),
    fact('supply.relocationTraceLostIds', lost.map(piece => piece.id).join(',')),
    fact('supply.relocationOtherTraceLost', others.length),
    fact('supply.relocationOtherTraceLostIds', others.map(piece => piece.id).join(',')),
    fact('supply.relocationMoverHasTrace', pieceHasTrace(after, relocated)),
    // Preserve these facts for the frozen v13 baseline and consumers of the original HQ preview.
    ...(hq ? [fact('supply.hqRelocationTraceLost', lost.length), fact('supply.hqRelocationTraceLostIds', lost.map(piece => piece.id).join(','))] : []),
  ];
};
