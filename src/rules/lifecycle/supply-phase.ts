import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import type { GameState, MobilityType, RuleEvent, RuleViolation } from '../kernel/model.js';
import { rollDie, rollTwoDice } from '../kernel/rng.js';
import {
  OUT_OF_TRACE_SINCE_STATUS,
  RETURN_TURN_STATUS,
  TRANSPORT_POINTS_STATUS,
  adjacentHexIds,
  definitionOf,
  nextOrderAt,
  faceMode,
  hexDistanceBetween,
  hexOf,
  isCombatUnit,
  isHq,
  isOutOfSupply,
  isTransportPoint,
  outOfTraceSince,
  pieceById,
  stepOf,
  usageOf,
  withOutOfSupply,
  withStatus,
  withUsage,
} from '../pieces.js';
import { pieceHasTrace, traceSupplyAvailableAt } from '../supply/supply.js';
import {
  ATTRITION_LARGE_STACK_DRM,
  ATTRITION_LARGE_STACK_STEPS,
  BREAKOUT_MAXIMUM_DISTANCE,
  BREAKOUT_SUCCESS_MINIMUM,
  attritionResult,
  attritionSteps,
} from '../tables/ocs-4.3.js';
import { movementCostModel } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { enemyCombatUnitsAt } from '../pieces.js';
import { queryZoc } from '../zoc/zoc.js';

/**
 * 12.6, 12.8: the end of the friendly Supply Phase. Every combat unit either makes its trace, was
 * fed this phase (12.6c), or is marked Out of Supply; each stack with Out of Supply units then rolls
 * on the Attrition Table and its owner chooses the losses.
 */
export const determineSupply = (state: GameState, playerId: PlayerId, events: RuleEvent[]): GameState => {
  let pieceState = state.pieceState;
  const turn = state.sequence.gameTurn;
  for (const piece of state.pieceState.pieces) {
    if (piece.ownerId !== playerId || piece.location.kind !== 'ON_MAP') continue;
    const combat = isCombatUnit(state, piece);
    if (!combat && !isTransportPoint(state, piece)) continue;
    // 12.6h, 14.10b: a unit that made its planned Air Drop this turn needs no trace supply.
    const trace = state.air.droppedIds.includes(piece.id) || (combat ? pieceHasTrace(state, piece) : traceSupplyAvailableAt(state, playerId, piece.location.hexId));
    // 12.8e: remember when a unit was first found out of trace (eating off the map does not reset it).
    let updated = trace ? withStatus(piece, OUT_OF_TRACE_SINCE_STATUS, null)
      : outOfTraceSince(piece) === null ? withStatus(piece, OUT_OF_TRACE_SINCE_STATUS, { kind: 'INTEGER', value: turn }) : piece;
    if (combat) {
      const inSupply = trace || usageOf(state, piece).supplyPaid;
      if (isOutOfSupply(piece) === inSupply) events.push({ kind: 'SUPPLY_STATUS_CHANGED', sequence: events.length, pieceId: piece.id, inSupply });
      updated = withOutOfSupply(updated, !inSupply);
    }
    pieceState = upsertPieceState(pieceState, updated);
  }
  let next: GameState = { ...state, pieceState, formationTraces: [] };
  // 12.8b: roll for every Hex with Out of Supply units.
  const hexes = [...new Set(next.pieceState.pieces
    .filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isCombatUnit(next, piece) && isOutOfSupply(piece))
    .map((piece) => hexOf(piece)!))].sort();
  for (const hexId of hexes) {
    const units = next.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hexOf(piece) === hexId && isCombatUnit(next, piece) && isOutOfSupply(piece));
    const steps = units.reduce((total, piece) => total + (piece.remainingSteps ?? 0), 0);
    // 12.8c: DG does not lower the rating; Strat Mode does (and HQs rate 0, 13.1c).
    const rating = Math.max(0, ...units.map((piece) => isHq(next, piece) || piece.mode === 'STRAT' ? 0 : stepOf(next, piece)?.actionRating ?? 0));
    const roll = rollTwoDice(next.rng);
    next = { ...next, rng: roll.rng };
    const total = roll.roll.total + (steps >= ATTRITION_LARGE_STACK_STEPS ? ATTRITION_LARGE_STACK_DRM : 0);
    const lost = attritionSteps(attritionResult(rating, total), steps);
    events.push({ kind: 'ATTRITION_ROLLED', sequence: events.length, hexId, total, steps: lost });
    if (lost > 0) next = { ...next, interrupts: [...next.interrupts, { kind: 'ATTRITION', ownerId: playerId, hexId, steps: lost, pieceIds: units.map(({ id }) => id) }] };
  }
  return next;
};

/** Mobility a unit uses in Move Mode (12.8eA). */
const moveModeMobility = (state: GameState, piece: PieceState): MobilityType | null => {
  const face = definitionOf(state, piece)?.faces.find(({ id }) => id === 'move') ?? definitionOf(state, piece)?.faces.find(({ id }) => id === piece.currentFaceId);
  const id = String(face?.mobilityClassDefinitionId ?? '');
  return id === 'mobility:leg' ? 'leg' : id === 'mobility:truck' ? 'truck' : id === 'mobility:tracked' ? 'tracked' : null;
};

const printedMaTicks = (state: GameState, piece: PieceState): number =>
  Math.max(0, ...(definitionOf(state, piece)?.faces.map((face) => Number(face.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)?.movementPointTicks
    ?? face.steps[0]?.movementPointTicks ?? 0)) ?? [0]));

export interface BreakoutStatus {
  readonly eligible: boolean;
  readonly firstTurn: boolean;
  readonly reason: string;
}

/** 12.8e Breakout eligibility for a unit now, in its owner's Breakout Segment. */
export const breakoutStatus = (state: GameState, piece: PieceState): BreakoutStatus => {
  const hexId = hexOf(piece);
  const combat = isCombatUnit(state, piece);
  // A unit is first out of trace when it was in trace at its last Supply Phase (eating does not count).
  const firstTurn = outOfTraceSince(piece) === null;
  const no = (reason: string): BreakoutStatus => ({ eligible: false, firstTurn, reason });
  if (hexId === null) return no('Not on the map.');
  if (!combat && !(isTransportPoint(state, piece) && firstTurn)) return no('Only combat units (and Transport Points on their first turn out of trace) can break out.');
  if (usageOf(state, piece).breakoutAttempted) return no('Breakout was already attempted this segment.');
  if (printedMaTicks(state, piece) < 4) return no('Breakout needs a printed MA of at least 1.');
  const traced = combat ? pieceHasTrace(state, piece) : traceSupplyAvailableAt(state, piece.ownerId, hexId);
  if (traced) return no('The unit makes its trace.');
  if (firstTurn) return { eligible: true, firstTurn, reason: 'First turn out of trace: conditions waived, +1 to the roll.' };
  const anchors = state.pieceState.pieces.filter((other) => other.ownerId === piece.ownerId && other.id !== piece.id
    && other.location.kind === 'ON_MAP' && isCombatUnit(state, other) && pieceHasTrace(state, other));
  // B) within 15 Hexes of a friendly combat unit in trace supply.
  if (!anchors.some((other) => hexDistanceBetween(hexId, hexOf(other)!) <= BREAKOUT_MAXIMUM_DISTANCE)) {
    return no(`No friendly combat unit in trace supply within ${BREAKOUT_MAXIMUM_DISTANCE} hexes.`);
  }
  // A) a path free of enemy combat units and prohibited terrain (and un-negated enemy ZOC for Truck MP).
  const mobility = moveModeMobility(state, piece);
  if (mobility === null) return no('The unit cannot move in Move Mode.');
  const model = movementCostModel(state, mobility);
  const targets = new Set(anchors.map((other) => hexOf(other)!));
  const seen = new Set<HexId>([hexId]);
  const queue: HexId[] = [hexId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (targets.has(current)) return { eligible: true, firstTurn, reason: 'A path leads to friendly units in trace supply.' };
    for (const next of adjacentHexIds(current)) {
      if (seen.has(next) || enemyCombatUnitsAt(state, piece.ownerId, next).length > 0) continue;
      if (model.evaluate(current, next).kind !== 'COST') continue;
      if (mobility === 'truck' && !queryZoc(state, piece.ownerId, next, 'SUPPLY_PATH').allowed) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return no('No path free of enemy units and prohibited terrain leads to friendly units in trace supply.');
};

export const validateBreakout = (state: GameState, actorId: PlayerId, pieceId: PieceId): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'MOVEMENT' || state.sequence.segment !== 'BREAKOUT' || actorId !== state.sequence.phasingPlayerId) {
    issues.push(violation('INVALID_BREAKOUT_SEGMENT', ['sequence'], 'Breakout happens in the friendly Breakout Segment.', '12.8e'));
  }
  const piece = pieceById(state, pieceId);
  if (!piece || piece.ownerId !== actorId) {
    issues.push(violation('INVALID_BREAKOUT_UNIT', ['pieceId'], 'Choose one of your units.', '12.8e'));
    return issues;
  }
  const status = breakoutStatus(state, piece);
  if (!status.eligible) issues.push(violation('BREAKOUT_NOT_ELIGIBLE', ['pieceId'], status.reason, '12.8e'));
  return issues;
};

/**
 * 12.8e: roll one die (+1 on the first turn out of trace). 1-4: the unit goes to the Dead Pile.
 * 5-6: it leaves the map and returns as a reinforcement a second die of turns later, keeping its
 * step losses but losing its other markers.
 */
export const applyBreakout = (state: GameState, pieceId: PieceId): { readonly state: GameState; readonly events: readonly RuleEvent[] } => {
  const piece = pieceById(state, pieceId)!;
  const status = breakoutStatus(state, piece);
  const die = rollDie(state.rng);
  let rng = die.rng;
  const roll = die.value + (status.firstTurn ? 1 : 0);
  const succeeded = roll >= BREAKOUT_SUCCESS_MINIMUM;
  let returnTurn: number | null = null;
  let updated: PieceState;
  if (succeeded) {
    const delay = rollDie(rng);
    rng = delay.rng;
    returnTurn = state.sequence.gameTurn + delay.value;
    const boxId = state.configuration.reinforcementBoxes.find(({ playerId }) => playerId === piece.ownerId)?.boxId;
    if (!boxId) throw new Error('Breakout needs a reinforcement Box for the player.');
    updated = withStatus({
      // Step losses stay; every other marker (Low, DG, Out of Supply...) is lost.
      ...piece, mode: piece.mode === null ? null : faceMode(piece),
      statuses: piece.statuses.filter(({ statusDefinitionId }) => statusDefinitionId === TRANSPORT_POINTS_STATUS),
      location: { kind: 'OFF_MAP_BOX', boxId }, stackOrder: nextOrderAt(state.pieceState.pieces, { kind: 'OFF_MAP_BOX', boxId }, piece.id),
    }, RETURN_TURN_STATUS, { kind: 'INTEGER', value: returnTurn });
  } else {
    updated = { ...piece, location: { kind: 'ELIMINATED' } };
  }
  let pieceState = upsertPieceState(state.pieceState, updated);
  // Breakout removes units, not supply: SP loaded on a Transport Point that leaves are lost.
  for (const relation of state.pieceState.relations) {
    if (relation.kind !== 'CARGO' || relation.containerId !== pieceId) continue;
    const cargo = pieceState.pieces.find(({ id }) => id === relation.cargoId);
    if (cargo) pieceState = upsertPieceState(pieceState, { ...cargo, resourceQuantity: 0, location: { kind: 'ELIMINATED' } });
  }
  pieceState = { ...pieceState, relations: pieceState.relations.filter((relation) => !(relation.kind === 'CARGO' && relation.containerId === pieceId)) };
  let next: GameState = { ...state, rng, pieceState };
  next = { ...next, usage: withUsage(next, { ...usageOf(next, updated), breakoutAttempted: true }) };
  return { state: next, events: [{ kind: 'BREAKOUT_ROLLED', sequence: 0, pieceId, roll, succeeded, returnTurn }] };
};

/** Units that could attempt Breakout now, for candidates and the UI. */
export const breakoutCandidates = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'BREAKOUT' && playerId === state.sequence.phasingPlayerId
    ? stableSort(state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
      && breakoutStatus(state, piece).eligible), (left, right) => String(left.id).localeCompare(String(right.id)))
    : [];

