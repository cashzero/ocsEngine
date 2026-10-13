import { setHexControl } from '../../domain/map/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import { previewRetreatChoice } from '../combat/combat.js';
import { applyModeChange } from '../mode/mode.js';
import { isCombatUnit, isHq, isTransportPoint, pieceById, reTicksOf } from '../pieces.js';
import { capturePort } from '../port/port.js';
import type { GameAction, GameState } from '../kernel/model.js';
import type { RuleFact } from '../query/model.js';
import { dumpsReaching, eatOffMapCost, pieceHasTrace } from './supply.js';

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
  if (action.kind === 'RESPOND_DECISION') {
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
  const mapState = action.kind === 'MOVE_PIECE' && isCombatUnit(state, unit)
    ? action.path.slice(1).reduce((map, hexId) => setHexControl(map, hexId, action.actorId), state.mapState)
    : state.mapState;
  let after: GameState = { ...state, mapState, pieceState: { ...state.pieceState,
    pieces: state.pieceState.pieces.map(piece => piece.id === unit.id ? relocated : piece) } };
  if (action.kind === 'MOVE_PIECE') {
    for (const hexId of action.path.slice(1)) after = capturePort(after, action.actorId, hexId, []);
  }
  const units = own();
  const traced = units.filter(piece => pieceHasTrace(state, piece));
  const lost = traced.filter(piece => !pieceHasTrace(after, piece.id === unit.id ? relocated : piece));
  const feedLost = units.filter(piece => !pieceHasTrace(state, piece)
    && availableRationTokens(after, piece.id === unit.id ? relocated : piece) < availableRationTokens(state, piece));
  const others = lost.filter(piece => piece.id !== unit.id);
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
