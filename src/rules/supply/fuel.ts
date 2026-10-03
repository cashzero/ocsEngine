import type { HexId, PieceId, PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { FuelMethod, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import {
  formationOf,
  hexOf,
  isHq,
  isEligibleMover,
  isIndependent,
  isMultiUnitFormation,
  mobilityOf,
  needsFuel,
  pieceById,
  throwRangeTicks,
  usageOf,
  withUsage,
} from '../pieces.js';
import { FUEL_COSTS } from '../tables/ocs-4.3.js';
import { violation } from '../validation/violation.js';
import { dumpsReaching, formationMembers, routesFromDump, spendReservations, supplyPathCosts, type DumpAccess } from './supply.js';
import { adjacentHexIds } from '../pieces.js';

/**
 * 12.5 Fuel. Combat units with a Truck or Track MA cannot spend MP until fuel is paid, by the
 * Formation Method (1 SP, until Clean Up), the HQ Method (1 SP fuels the HQ and every independent
 * unit in its throw range, until Clean Up), or the Single-Unit Method (1T, this phase only).
 */

const throwReachesFrom = (state: GameState, hq: PieceState, fromHexId: HexId, hexId: HexId): boolean => {
  const costs = supplyPathCosts(state, hq.ownerId, fromHexId, mobilityOf(state, hq) ?? 'truck', throwRangeTicks(state, hq));
  return costs.has(hexId) || adjacentHexIds(hexId).some((adjacent) => costs.has(adjacent));
};

/**
 * 12.5e: a fueled HQ throws fuel from one location per phase, its starting or its ending Hex. Returns
 * the fueled HQ and the Hex it would throw from for `piece`, or null.
 */
const hqFuelFor = (state: GameState, piece: PieceState): { readonly hq: PieceState; readonly fromHexId: HexId } | null => {
  const hexId = hexOf(piece);
  if (hexId === null || !isIndependent(state, piece)) return null;
  for (const hqId of state.fuel.hqIds) {
    const hq = pieceById(state, hqId);
    if (!hq || hq.ownerId !== piece.ownerId || hexOf(hq) === null || hq.mode === 'STRAT') continue;
    const usage = usageOf(state, hq);
    const locations = usage.fuelThrowHexId !== null ? [usage.fuelThrowHexId]
      : [...new Set([usage.phaseStartHexId ?? hexOf(hq)!, hexOf(hq)!])];
    const fromHexId = locations.find((location) => throwReachesFrom(state, hq, location, hexId));
    if (fromHexId) return { hq, fromHexId };
  }
  return null;
};

export type FuelCoverage = 'NOT_NEEDED' | 'SINGLE_UNIT' | 'FORMATION' | 'HQ' | null;

/** How `piece` is fueled for the MP it is about to spend, or null if it is not. */
export const fuelCoverage = (state: GameState, piece: PieceState): FuelCoverage => {
  if (!needsFuel(state, piece)) return 'NOT_NEEDED';
  if (usageOf(state, piece).fueled) return 'SINGLE_UNIT';
  if (state.fuel.formations.some((entry) => entry.playerId === piece.ownerId && entry.coveredPieceIds.includes(piece.id))) return 'FORMATION';
  if (state.fuel.hqIds.includes(piece.id)) return 'HQ';
  return hqFuelFor(state, piece) ? 'HQ' : null;
};

export const isFueled = (state: GameState, piece: PieceState): boolean => fuelCoverage(state, piece) !== null;

/**
 * Record that `piece` begins to move under its fuel: independent units lock the throwing HQ's
 * location for the phase (12.5e) and keep their fuel for the rest of the phase.
 */
export const commitFuelForMove = (state: GameState, piece: PieceState): GameState => {
  const coverage = fuelCoverage(state, piece);
  if (coverage !== 'HQ' || state.fuel.hqIds.includes(piece.id)) return state;
  const source = hqFuelFor(state, piece);
  if (!source) return state;
  let next = state;
  const hqUsage = usageOf(next, source.hq);
  if (hqUsage.fuelThrowHexId === null) next = { ...next, usage: withUsage(next, { ...hqUsage, fuelThrowHexId: source.fromHexId }) };
  return { ...next, usage: withUsage(next, { ...usageOf(next, piece), fueled: true }) };
};

const fuelPhase = (state: GameState): boolean =>
  state.sequence.segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase);

export interface FuelOption {
  readonly method: FuelMethod;
  readonly pieceId: PieceId;
  readonly tokens: number;
  readonly sources: readonly DumpAccess[];
  /** Units the payment fuels. */
  readonly coveredPieceIds: readonly PieceId[];
}

/** Formation Method coverage from one dump: the common route that reaches the most members (12.5c A). */
const formationCoverage = (state: GameState, playerId: PlayerId, formationId: NonNullable<ReturnType<typeof formationOf>>, dumpId: PieceId): readonly PieceId[] => {
  const members = formationMembers(state, playerId, formationId).filter((piece) => needsFuel(state, piece));
  const byRoute = new Map<string, PieceId[]>();
  const dump = pieceById(state, dumpId);
  if (!dump) return [];
  for (const piece of members) {
    for (const route of routesFromDump(state, dump, piece)) {
      const key = route.method === 'DRAW' ? 'DRAW' : `HQ:${route.hqId}`;
      byRoute.set(key, [...(byRoute.get(key) ?? []), piece.id]);
    }
  }
  return [...byRoute.values()].sort((left, right) => right.length - left.length)[0] ?? [];
};

/** Every way to fuel `piece` now, with the dumps that could pay. */
export const fuelOptions = (state: GameState, piece: PieceState): readonly FuelOption[] => {
  const hexId = hexOf(piece);
  if (hexId === null || !fuelPhase(state) || piece.ownerId !== state.sequence.actingPlayerId) return [];
  const options: FuelOption[] = [];
  const dumps = dumpsReaching(state, piece.ownerId, hexId, piece);
  // Fuel is paid when a unit is about to spend MP (12.5c): only for units that may move this phase.
  if (needsFuel(state, piece) && fuelCoverage(state, piece) === null && isEligibleMover(state, piece)) {
    const single = dumps.filter(({ availableQuantity }) => availableQuantity >= FUEL_COSTS.singleUnit);
    if (single.length > 0) options.push({ method: 'SINGLE_UNIT', pieceId: piece.id, tokens: FUEL_COSTS.singleUnit, sources: single, coveredPieceIds: [piece.id] });
    const formationId = formationOf(state, piece);
    if (isMultiUnitFormation(state, formationId) && !state.fuel.formations.some((entry) => entry.playerId === piece.ownerId && entry.formationId === formationId)) {
      const sources = dumps.filter(({ pieceId, availableQuantity }) => availableQuantity >= FUEL_COSTS.formation
        && formationCoverage(state, piece.ownerId, formationId!, pieceId).includes(piece.id));
      if (sources.length > 0) {
        options.push({
          method: 'FORMATION', pieceId: piece.id, tokens: FUEL_COSTS.formation, sources,
          coveredPieceIds: formationCoverage(state, piece.ownerId, formationId!, sources[0]!.pieceId),
        });
      }
    }
  }
  if (isHq(state, piece) && !state.fuel.hqIds.includes(piece.id) && piece.mode !== 'STRAT') {
    const sources = dumps.filter(({ availableQuantity }) => availableQuantity >= FUEL_COSTS.hq);
    if (sources.length > 0) {
      const covered = state.pieceState.pieces.filter((other) => other.ownerId === piece.ownerId && hexOf(other) !== null
        && needsFuel(state, other) && isIndependent(state, other) && throwReachesFrom(state, piece, hexId, hexOf(other)!)).map(({ id }) => id);
      // The 1 SP must buy something: an eligible mover among the HQ and its independents that is not already fueled
      // (e.g. an HQ the Formation Method already fueled does not need to pay again for itself).
      const movers = [piece.id, ...covered].some((id) => {
        const unit = pieceById(state, id);
        return unit !== undefined && needsFuel(state, unit) && fuelCoverage(state, unit) === null && isEligibleMover(state, unit);
      });
      if (movers) options.push({ method: 'HQ', pieceId: piece.id, tokens: FUEL_COSTS.hq, sources, coveredPieceIds: [...new Set([piece.id, ...covered])] });
    }
  }
  return options;
};

export const validateFuelPayment = (
  state: GameState,
  actorId: PlayerId,
  method: FuelMethod,
  pieceId: PieceId,
  sourcePieceId: PieceId,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const piece = pieceById(state, pieceId);
  if (!fuelPhase(state) || actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_FUEL_PHASE', ['sequence'], 'Fuel is paid by the moving player in a Movement Segment.', '12.5c'));
  }
  if (!piece || piece.ownerId !== actorId) {
    issues.push(violation('INVALID_FUEL_TARGET', ['pieceId'], 'Fuel your own units.', '12.5'));
    return issues;
  }
  const option = fuelOptions(state, piece).find((candidate) => candidate.method === method);
  if (!option) {
    issues.push(violation('FUEL_NOT_APPLICABLE', ['method'], method === 'HQ'
      ? 'Only an unfueled HQ that is not in Strat Mode can be fueled this way.'
      : 'This unit does not need fuel, is already fueled, or no dump can pay.', '12.5c'));
  } else if (!option.sources.some(({ pieceId: id }) => id === sourcePieceId)) {
    issues.push(violation('INVALID_FUEL_SOURCE', ['sourcePieceId'], `That dump cannot supply ${option.tokens}T here.`, '12.5c'));
  }
  return issues;
};

export const payFuel = (
  state: GameState,
  method: FuelMethod,
  pieceId: PieceId,
  sourcePieceId: PieceId,
): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const piece = pieceById(state, pieceId)!;
  const option = fuelOptions(state, piece).find((candidate) => candidate.method === method)!;
  const dump = pieceById(state, sourcePieceId)!;
  const unitDefinitionId = state.scenario.pieceCatalog.definitions.find(({ id }) => id === dump.definitionId)!.resource!.unitDefinitionId;
  let next: GameState = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: sourcePieceId, quantity: option.tokens, unitDefinitionId }]) };
  if (method === 'SINGLE_UNIT') {
    next = { ...next, usage: withUsage(next, { ...usageOf(next, piece), fueled: true }) };
  } else if (method === 'FORMATION') {
    next = {
      ...next,
      fuel: {
        ...next.fuel,
        formations: [...next.fuel.formations, {
          playerId: piece.ownerId, formationId: formationOf(state, piece)!,
          coveredPieceIds: formationCoverage(state, piece.ownerId, formationOf(state, piece)!, sourcePieceId),
        }],
      },
    };
  } else {
    next = { ...next, fuel: { ...next.fuel, hqIds: [...next.fuel.hqIds, piece.id] } };
  }
  return {
    state: next,
    events: [{ kind: 'FUEL_PAID', sequence: 0, method, pieceId, resourcePieceId: sourcePieceId, tokens: option.tokens }],
  };
};

/** 12.5d: the phasing player's Formation and HQ fuel ends in his Clean Up Phase. */
export const clearFuel = (state: GameState, playerId: PlayerId): GameState => ({
  ...state,
  fuel: {
    formations: state.fuel.formations.filter((entry) => entry.playerId !== playerId),
    hqIds: state.fuel.hqIds.filter((id) => pieceById(state, id)?.ownerId !== playerId),
  },
});
