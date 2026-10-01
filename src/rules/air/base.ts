import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { rollTwoDice } from '../kernel/rng.js';
import { definitionOf, hexDistanceBetween, hexOf, isCombatUnit, pieceById, reTicksOf, usageOf, withUsage } from '../pieces.js';
import { dumpsReaching, spendReservations } from '../supply/supply.js';
import { AIR_BASE_CAPTURE } from '../tables/ocs-4.3.js';
import { violation } from '../validation/violation.js';
import {
  activeAircraftAt,
  activeAircraftLimit,
  airBaseAt,
  airBaseLevel,
  aircraftAt,
  aircraftName,
  aircraftRange,
  aircraftDesignation,
  aircraftTypes,
  airCombatRating,
  aircraftBarrageStrength,
  friendlyAirBases,
  hasParenthesizedRating,
  isActiveAircraft,
  isAirBase,
  isAircraft,
  isAirStrip,
  refitBlockedByZoc,
  refitCapacity,
  withAircraftActive,
  withAirBaseLevel,
} from './aircraft.js';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };

/** One Token (1T) pays for a refit at one base (15.1B). */
export const REFIT_TOKENS = 1;

const tokenUnit = (state: GameState, dump: PieceState) => definitionOf(state, dump)!.resource!.unitDefinitionId;

/** Dumps that can pay the 1T refit cost by direct draw or HQ throw to the base hex (12.9c). */
export const refitSources = (state: GameState, base: PieceState) =>
  hexOf(base) === null ? [] : dumpsReaching(state, base.ownerId, hexOf(base)!).filter(({ availableQuantity }) => availableQuantity >= REFIT_TOKENS);

export const validateRefit = (state: GameState, action: Extract<GameAction, { readonly kind: 'REFIT_AIRCRAFT' }>): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'AIRCRAFT_REFIT' || action.actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_REFIT_PHASE', ['sequence'], 'Aircraft refit in their owner\'s Aircraft Refit Phase.', '15.1'));
  }
  const base = pieceById(state, action.baseId);
  if (!base || !isAirBase(state, base) || base.ownerId !== action.actorId || hexOf(base) === null) {
    return [...issues, violation('UNKNOWN_AIR_BASE', ['baseId'], 'Refit happens at a friendly Air Base.', '15.1')];
  }
  if (state.air.refittedBaseIds.includes(base.id)) issues.push(violation('BASE_ALREADY_REFIT', ['baseId'], 'An Air Base refits once per Aircraft Refit Phase.', '15.1A'));
  if (refitBlockedByZoc(state, base)) issues.push(violation('REFIT_IN_ENEMY_ZOC', ['baseId'], 'An Air Base in an un-negated enemy ZOC cannot refit.', '15.1C'));
  if (action.aircraftIds.length === 0 || new Set(action.aircraftIds).size !== action.aircraftIds.length) {
    issues.push(violation('INVALID_REFIT_AIRCRAFT', ['aircraftIds'], 'Choose one or more distinct Inactive aircraft.', '15.1B'));
  }
  const capacity = refitCapacity(state, base);
  if (action.aircraftIds.length > capacity) issues.push(violation('REFIT_CAPACITY', ['aircraftIds'], `A Level ${airBaseLevel(state, base)} base refits up to ${capacity} aircraft.`, isAirStrip(state, base) ? '15.2B' : '15.1B'));
  for (const [index, id] of action.aircraftIds.entries()) {
    const piece = pieceById(state, id);
    if (!piece || !isAircraft(state, piece) || piece.ownerId !== action.actorId || hexOf(piece) !== hexOf(base)) {
      issues.push(violation('AIRCRAFT_NOT_AT_BASE', ['aircraftIds', index], 'Only aircraft at this base can refit here.', '15.1B'));
    } else if (isActiveAircraft(piece)) {
      issues.push(violation('AIRCRAFT_ALREADY_ACTIVE', ['aircraftIds', index], `${aircraftName(state, piece)} is already Active.`, '14.1d'));
    }
  }
  if (activeAircraftAt(state, action.actorId, hexOf(base)!).length + action.aircraftIds.length > activeAircraftLimit(state, base)) {
    issues.push(violation('BASE_ACTIVE_LIMIT', ['aircraftIds'], `This base can hold ${activeAircraftLimit(state, base)} Active aircraft.`, '14.2a'));
  }
  if (!refitSources(state, base).some(({ pieceId }) => pieceId === action.sourcePieceId)) {
    issues.push(violation('REFIT_SUPPLY_UNAVAILABLE', ['sourcePieceId'], 'Refit costs 1T drawn or thrown to the base from a dump.', '12.9c'));
  }
  return issues;
};

export const applyRefit = (state: GameState, action: Extract<GameAction, { readonly kind: 'REFIT_AIRCRAFT' }>): Transition => {
  const dump = pieceById(state, action.sourcePieceId)!;
  let next: GameState = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: dump.id, quantity: REFIT_TOKENS, unitDefinitionId: tokenUnit(state, dump) }]) };
  const events: RuleEvent[] = [{ kind: 'SUPPLY_SPENT', sequence: 0, resourcePieceId: dump.id, quantity: REFIT_TOKENS }];
  for (const id of action.aircraftIds) {
    const piece = pieceById(next, id)!;
    next = { ...next, pieceState: upsertPieceState(next.pieceState, withAircraftActive(piece, true)) };
    events.push({ kind: 'AIRCRAFT_STATUS_CHANGED', sequence: events.length, pieceId: id, active: true, hexId: hexOf(piece) });
  }
  next = { ...next, air: { ...next.air, refittedBaseIds: [...next.air.refittedBaseIds, action.baseId] } };
  return { state: next, events };
};

/** Bases with Inactive aircraft that could refit now, for candidate generation. */
export const refitCandidates = (state: GameState, playerId: PlayerId): readonly { readonly base: PieceState; readonly aircraftIds: readonly PieceId[]; readonly sourceIds: readonly PieceId[] }[] =>
  friendlyAirBases(state, playerId).flatMap((base) => {
    if (state.air.refittedBaseIds.includes(base.id) || refitBlockedByZoc(state, base)) return [];
    const inactive = aircraftAt(state, hexOf(base)!).filter((piece) => piece.ownerId === playerId && !isActiveAircraft(piece));
    const room = Math.min(refitCapacity(state, base), activeAircraftLimit(state, base) - activeAircraftAt(state, playerId, hexOf(base)!).length);
    const sources = refitSources(state, base).map(({ pieceId }) => pieceId);
    if (inactive.length === 0 || room <= 0 || sources.length === 0) return [];
    // Prefer full-strength aircraft first; the player may pick a different set.
    const ordered = stableSort(inactive, (left, right) => (right.remainingSteps ?? 0) - (left.remainingSteps ?? 0) || String(left.id).localeCompare(String(right.id)));
    return [{ base, aircraftIds: ordered.slice(0, room).map(({ id }) => id), sourceIds: sources }];
  });

// ─── 15.4 Reduction ─────────────────────────────────────────────────────────────────────────────

export const validateReduceAirBase = (state: GameState, action: Extract<GameAction, { readonly kind: 'REDUCE_AIR_BASE' }>): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const { phase, segment } = state.sequence;
  if (phase !== 'MOVEMENT' || segment !== 'MOVEMENT' || action.actorId !== state.sequence.phasingPlayerId) {
    issues.push(violation('INVALID_REDUCTION_PHASE', ['sequence'], 'Air Bases are reduced only in the Movement Phase.', '15.4'));
  }
  const base = pieceById(state, action.baseId);
  if (!base || !isAirBase(state, base) || base.ownerId !== action.actorId || hexOf(base) === null) {
    return [...issues, violation('UNKNOWN_AIR_BASE', ['baseId'], 'Only a friendly Air Base can be reduced.', '15.4')];
  }
  if (isAirStrip(state, base)) issues.push(violation('AIR_STRIP_NOT_REDUCED', ['baseId'], 'Air Strips are never reduced.', '15.2E'));
  else if (airBaseLevel(state, base) <= 1) issues.push(violation('AIR_BASE_MINIMUM_LEVEL', ['baseId'], 'An Air Base is never reduced below Level 1.', '15.4'));
  if (state.air.reducedBaseIds.includes(base.id)) issues.push(violation('BASE_ALREADY_REDUCED', ['baseId'], 'A friendly Air Base is reduced only once per phase.', '15.4'));
  let ticks = 0;
  for (const [index, id] of action.pieceIds.entries()) {
    const piece = pieceById(state, id);
    const usage = piece ? usageOf(state, piece) : null;
    if (!piece || piece.ownerId !== action.actorId || !isCombatUnit(state, piece) || hexOf(piece) !== hexOf(base)) {
      issues.push(violation('REDUCER_NOT_IN_HEX', ['pieceIds', index], 'The reducing units must be friendly combat units in the base hex.', '15.4'));
      continue;
    }
    if (piece.mode !== 'COMBAT') issues.push(violation('REDUCER_NOT_COMBAT_MODE', ['pieceIds', index], 'Reducing units must be in Combat Mode.', '15.4'));
    if (usage!.moved || usage!.movementSpentTicks > 0) issues.push(violation('REDUCER_MOVED', ['pieceIds', index], 'Units that moved this phase cannot reduce the base.', '15.4'));
    ticks += reTicksOf(state, piece);
  }
  if (ticks < 4) issues.push(violation('REDUCTION_NEEDS_ONE_RE', ['pieceIds'], 'One RE of units is needed to reduce an Air Base.', '15.4'));
  return issues;
};

export const applyReduceAirBase = (state: GameState, action: Extract<GameAction, { readonly kind: 'REDUCE_AIR_BASE' }>): Transition => {
  const base = pieceById(state, action.baseId)!;
  const level = airBaseLevel(state, base) - 1;
  let next: GameState = {
    ...state,
    pieceState: upsertPieceState(state.pieceState, withAirBaseLevel(base, level)),
    air: { ...state.air, reducedBaseIds: [...state.air.reducedBaseIds, base.id] },
  };
  // 15.4: the units "do not move" this phase.
  for (const id of action.pieceIds) next = { ...next, usage: withUsage(next, { ...usageOf(next, pieceById(next, id)!), moved: true }) };
  return { state: next, events: [{ kind: 'AIR_BASE_LEVEL_CHANGED', sequence: 0, pieceId: base.id, level }] };
};

// ─── 13.9-4 Combining reduced aircraft ──────────────────────────────────────────────────────────

const sameValues = (state: GameState, left: PieceState, right: PieceState): boolean =>
  aircraftTypes(state, left).join('/') === aircraftTypes(state, right).join('/')
  && aircraftDesignation(state, left) === aircraftDesignation(state, right)
  && airCombatRating(state, left) === airCombatRating(state, right)
  && hasParenthesizedRating(state, left) === hasParenthesizedRating(state, right)
  && aircraftBarrageStrength(state, left) === aircraftBarrageStrength(state, right)
  && aircraftRange(state, left) === aircraftRange(state, right);

export const validateCombineAircraft = (state: GameState, action: Extract<GameAction, { readonly kind: 'COMBINE_AIRCRAFT' }>): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Combine aircraft while you are acting.', '13.9'));
  const pieces = action.aircraftIds.map((id) => pieceById(state, id));
  if (pieces.length !== 2 || new Set(action.aircraftIds).size !== 2 || pieces.some((piece) => !piece)) {
    return [...issues, violation('COMBINE_NEEDS_TWO', ['aircraftIds'], 'Exactly two reduced aircraft combine.', '13.9-4')];
  }
  const [left, right] = pieces as PieceState[];
  if ([left!, right!].some((piece) => !isAircraft(state, piece) || piece.ownerId !== action.actorId || piece.remainingSteps !== 1)) {
    issues.push(violation('COMBINE_NEEDS_REDUCED_AIRCRAFT', ['aircraftIds'], 'Both must be your reduced aircraft.', '13.9-4'));
  }
  if (hexOf(left!) === null || hexOf(left!) !== hexOf(right!)) issues.push(violation('COMBINE_SAME_HEX', ['aircraftIds'], 'The aircraft must be in the same hex.', '13.9-4'));
  if (!sameValues(state, left!, right!) || isActiveAircraft(left!) !== isActiveAircraft(right!)) {
    issues.push(violation('COMBINE_SAME_TYPE', ['aircraftIds'], 'They must have the same type, values and Active status.', '13.9-4'));
  }
  return issues;
};

export const applyCombineAircraft = (state: GameState, action: Extract<GameAction, { readonly kind: 'COMBINE_AIRCRAFT' }>): Transition => {
  const [keepId, removeId] = action.aircraftIds as [PieceId, PieceId];
  const keep = pieceById(state, keepId)!;
  const remove = pieceById(state, removeId)!;
  let pieceState = upsertPieceState(state.pieceState, { ...keep, remainingSteps: 2 });
  pieceState = upsertPieceState(pieceState, { ...remove, location: { kind: 'ELIMINATED' } });
  return { state: { ...state, pieceState }, events: [{ kind: 'STEP_LOST', sequence: 0, pieceId: removeId, remainingSteps: null }] };
};

export const combineCandidates = (state: GameState, playerId: PlayerId): readonly (readonly [PieceId, PieceId])[] => {
  const reduced = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isAircraft(state, piece) && piece.remainingSteps === 1);
  const pairs: (readonly [PieceId, PieceId])[] = [];
  for (const [index, left] of reduced.entries()) {
    const right = reduced.slice(index + 1).find((candidate) => hexOf(candidate) === hexOf(left) && sameValues(state, left, candidate) && isActiveAircraft(candidate) === isActiveAircraft(left));
    if (right && !pairs.some(([a, b]) => [a, b].includes(left.id) || [a, b].includes(right.id))) pairs.push([left.id, right.id]);
  }
  return pairs;
};

// ─── 9.14f Air Base capture ─────────────────────────────────────────────────────────────────────

/**
 * 9.14f: an Attack-Capable unit entering an enemy Air Base captures it. Each aircraft there rolls on
 * the Air Base Capture Table; survivors must displace to a friendly base within twice their range.
 */
export const captureAirBase = (state: GameState, capturerId: PlayerId, hexId: HexId, byAdvance: boolean, events: RuleEvent[]): GameState => {
  const base = airBaseAt(state, hexId);
  const planes = aircraftAt(state, hexId).filter((piece) => piece.ownerId !== capturerId);
  if ((!base || base.ownerId === capturerId) && planes.length === 0) return state;
  let next = state;
  if (base && base.ownerId !== capturerId) next = { ...next, pieceState: upsertPieceState(next.pieceState, { ...base, ownerId: capturerId }) };
  const survivors: PieceId[] = [];
  for (const plane of stableSort(planes, (left, right) => String(left.id).localeCompare(String(right.id)))) {
    const roll = rollTwoDice(next.rng);
    next = { ...next, rng: roll.rng };
    const total = roll.roll.total + (isActiveAircraft(plane) ? AIR_BASE_CAPTURE.activeModifier : 0) + (byAdvance ? AIR_BASE_CAPTURE.advanceModifier : 0);
    let current = pieceById(next, plane.id)!;
    if (total <= AIR_BASE_CAPTURE.stepLossMaximum) {
      const remaining = (current.remainingSteps ?? 1) - 1;
      current = remaining > 0 ? { ...current, remainingSteps: remaining } : { ...current, location: { kind: 'ELIMINATED' } };
      events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId: plane.id, remainingSteps: remaining > 0 ? remaining : null });
    }
    // Survivors become Inactive regardless of their status before the roll.
    next = { ...next, pieceState: upsertPieceState(next.pieceState, withAircraftActive(current, false)) };
    if (current.location.kind === 'ON_MAP') survivors.push(plane.id);
  }
  const owner = planes[0]?.ownerId;
  return survivors.length > 0 && owner
    ? { ...next, interrupts: [...next.interrupts, { kind: 'AIR_DISPLACEMENT', ownerId: owner, fromHexId: hexId, pieceIds: survivors }] }
    : next;
};

/** Friendly Air Bases within twice the aircraft's range of the captured base (9.14f). */
export const airDisplacementHexes = (state: GameState, piece: PieceState, fromHexId: HexId): readonly HexId[] =>
  friendlyAirBases(state, piece.ownerId).map((base) => hexOf(base)!)
    .filter((hexId) => hexId !== fromHexId && hexDistanceBetween(fromHexId, hexId) <= 2 * aircraftRange(state, piece))
    .sort((left, right) => hexDistanceBetween(fromHexId, left) - hexDistanceBetween(fromHexId, right) || String(left).localeCompare(String(right)));

/** Move a displaced aircraft to a base (Inactive), or destroy it when none is in reach. */
export const applyAirDisplacement = (state: GameState, pieceId: PieceId, hexId: HexId | null): GameState => {
  const piece = pieceById(state, pieceId)!;
  if (hexId === null) return { ...state, pieceState: upsertPieceState(state.pieceState, { ...piece, location: { kind: 'ELIMINATED' } }) };
  return {
    ...state,
    pieceState: upsertPieceState(state.pieceState, withAircraftActive({ ...piece, location: { kind: 'ON_MAP', hexId }, stackOrder: nextStackOrder(state.pieceState.pieces, hexId, pieceId) }, false)),
  };
};
