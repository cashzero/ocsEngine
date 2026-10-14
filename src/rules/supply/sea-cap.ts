import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { isAircraft } from '../air/aircraft.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { arrivingReinforcements } from '../lifecycle/lifecycle.js';
import {
  RETURN_TURN_STATUS,
  definitionOf,
  isCombatUnit,
  isExtender,
  isTransportPoint,
  movementAllowanceTicks,
  pieceById,
  piecesAt,
  usageOf,
  withStatus,
  withUsage,
} from '../pieces.js';
import { allPorts, portAt, portCapacityTokens, portHexOf, portRemainingTokens, portShutForShipping, portUseThisPhase, seaOf, usePortCapacity } from '../port/state.js';
import type { RuleQueryResult } from '../query/model.js';
import { isReplacement, mergeReplacementsAt, replacementsIn } from '../replacement/replacement.js';
import { violation } from '../validation/violation.js';
import { quartersText, railLoadableTokens, unitRailQuarters } from './rail-cap.js';
import { mergeSupplyAt } from './transport.js';

/**
 * Shipping (19.0f): each side's Sea Cap (Shipping Allowance) moves ground units, Transport Points and SP from port to port in
 * its Movement Phase, and, for a side whose reinforcements come only by sea, from its reinforcement Box to a friendly port.
 * Sea Cap and port capacity are both counted in quarter points: one point (or one Token of capacity) is 1T of SP or a quarter
 * RE (4.7a); a unit costs what it costs by rail (4.7b-c), a Repl a quarter RE. Every Token loaded counts against the loading
 * port and every Token unloaded against the unloading one (19.0a); a port in an enemy ZOC is shut (19.0f F).
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type SeaMove = Extract<GameAction, { readonly kind: 'SEA_MOVE' }>;

/** Sea Cap points the player gets each friendly Movement Phase (19.0f), or null when the game gives none. */
export const seaCapacityPoints = (state: GameState, playerId: PlayerId): number | null =>
  state.configuration.seaCapacity?.find((entry) => entry.playerId === playerId)?.points ?? null;

/** True when the player's arrivals reach the map only by ship (no inland entry Hexes). */
export const arrivesBySea = (state: GameState, playerId: PlayerId): boolean => state.configuration.seaArrivals?.includes(playerId) ?? false;

export const seaCapSpentQuarters = (state: GameState, playerId: PlayerId): number =>
  seaOf(state).spent.find((entry) => entry.playerId === playerId && entry.gameTurn === state.sequence.gameTurn
    && entry.playerTurnIndex === state.sequence.playerTurnIndex)?.quarters ?? 0;

export const seaCapRemainingQuarters = (state: GameState, playerId: PlayerId): number =>
  Math.max(0, (seaCapacityPoints(state, playerId) ?? 0) * 4 - seaCapSpentQuarters(state, playerId));

/** What one unit or Repl counter costs to ship, in quarters (4.7; a Repl is a quarter RE). */
export const unitSeaQuarters = (state: GameState, unit: PieceState): number =>
  isReplacement(state, unit) ? replacementsIn(unit) : unitRailQuarters(state, unit);

/** Pieces the player may ship from the reinforcement Box now: everything due to arrive except aircraft, which fly in. */
export const seaBoxCargo = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  arrivesBySea(state, playerId) ? arrivingReinforcements(state, playerId).filter((piece) => !isAircraft(state, piece)) : [];

const isSupply = (state: GameState, piece: PieceState): boolean => definitionOf(state, piece)?.family === 'RESOURCE';

/** Why `unit` cannot be shipped from `fromHexId` now (19.0f A, C; 4.7d), or null. */
export const seaUnitProblem = (state: GameState, unit: PieceState, ownerId: PlayerId, fromHexId: HexId | null): string | null => {
  if (unit.ownerId !== ownerId) return 'only your units can be shipped';
  if (fromHexId === null) {
    return seaBoxCargo(state, ownerId).some(({ id }) => id === unit.id) && !isSupply(state, unit) ? null : 'it is not waiting in your reinforcement Box';
  }
  if (unit.location.kind !== 'ON_MAP' || unit.location.hexId !== fromHexId) return 'it is not in the loading port';
  const truck = isTransportPoint(state, unit);
  if (!truck && !isCombatUnit(state, unit) && !isReplacement(state, unit)) return 'only combat units, Transport Points, Repls and SP are shipped (19.0f D)';
  if (truck && isExtender(state, unit)) return 'an Extender cannot move (12.7)';
  if (isCombatUnit(state, unit) && unit.mode !== 'MOVE') return 'it must be in Move Mode (19.0f A)';
  const usage = usageOf(state, unit);
  if (usage.seaCarried) return 'it was already shipped this phase';
  if (usage.railCarried || usage.airCarried) return 'it already used another transport this phase (4.7d)';
  if (usage.moved || usage.movementSpentTicks > 0 || state.currentMoverId === unit.id) return 'it already moved this phase: no movement is allowed before shipping (19.0f C)';
  return null;
};

/** Why the player cannot ship through the port in `hexId` now, or null. */
export const seaPortProblem = (state: GameState, playerId: PlayerId, hexId: HexId): string | null => {
  const port = portAt(state, hexId);
  if (!port) return 'there is no port there';
  if (port.controllerId !== playerId) return 'the port is not yours';
  if (portShutForShipping(state, playerId, hexId)) return 'the port is shut down by an enemy unit or ZOC (19.0a, 19.0f F)';
  if (portCapacityTokens(port) <= 0) return 'the port is fully damaged (19.0b)';
  if (portRemainingTokens(state, playerId, hexId) <= 0) return 'the port has used its capacity this phase (19.0a)';
  return null;
};

const seaPhase = (state: GameState, actorId: PlayerId): RuleViolation | null =>
  state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT' && actorId === state.sequence.phasingPlayerId
    ? null
    : violation('INVALID_SEA_PHASE', ['sequence'], 'Sea Cap can only be used in your Movement Phase (19.0f B).', '19.0f');

const cargoQuarters = (state: GameState, unitIds: readonly PieceId[], tokens: number): number =>
  unitIds.reduce((total, id) => { const unit = pieceById(state, id); return total + (unit ? unitSeaQuarters(state, unit) : 0); }, 0) + tokens;

/**
 * 19.0a: does a port take `tokens` more this phase? It may, once, use its whole capacity for a single combat unit larger than
 * what it has, when nothing else used it this phase.
 */
const portTakes = (state: GameState, playerId: PlayerId, hexId: HexId, tokens: number, singleUnit: boolean): { readonly ok: boolean; readonly oversized: boolean } => {
  const remaining = portRemainingTokens(state, playerId, hexId);
  if (tokens <= remaining) return { ok: true, oversized: false };
  const unused = portUseThisPhase(state, hexId).tokens === 0;
  return singleUnit && unused && remaining > 0 ? { ok: true, oversized: true } : { ok: false, oversized: false };
};

const supplySources = (state: GameState, playerId: PlayerId, fromHexId: HexId | null): readonly PieceState[] => fromHexId === null
  ? seaBoxCargo(state, playerId).filter((piece) => isSupply(state, piece) && (piece.resourceQuantity ?? 0) > 0)
  : piecesAt(state, fromHexId).filter((piece) => piece.ownerId === playerId && isSupply(state, piece) && (piece.resourceQuantity ?? 0) > 0);

/** Tokens of a dump that may be loaded: SP unloaded in this phase cannot be loaded again (12.2a). Box SP all may. */
const loadableTokens = (state: GameState, dump: PieceState, fromHexId: HexId | null): number =>
  fromHexId === null ? dump.resourceQuantity ?? 0 : railLoadableTokens(state, dump);

export const validateSeaMove = (state: GameState, action: SeaMove): readonly RuleViolation[] => {
  const phase = seaPhase(state, action.actorId);
  if (phase) return [phase];
  if (seaCapacityPoints(state, action.actorId) === null) return [violation('NO_SEA_CAPACITY', ['kind'], 'This game gives you no Sea Cap (19.0f).', '19.0f')];
  const issues: RuleViolation[] = [];
  if (action.unitIds.length === 0 && action.supply.length === 0) issues.push(violation('EMPTY_SEA_CARGO', ['unitIds'], 'Choose units or SP to ship.', '19.0f'));
  if (new Set(action.unitIds).size !== action.unitIds.length) issues.push(violation('DUPLICATE_SEA_CARGO', ['unitIds'], 'A unit is listed twice.', '19.0f'));
  if (action.fromHexId === null && !arrivesBySea(state, action.actorId)) {
    issues.push(violation('NO_SEA_ARRIVALS', ['fromHexId'], 'Only a side whose reinforcements come by sea ships from its reinforcement Box.', '19.0f'));
  }
  if (action.fromHexId !== null) {
    const from = seaPortProblem(state, action.actorId, action.fromHexId);
    if (from) issues.push(violation('PORT_UNAVAILABLE', ['fromHexId'], `Cannot load there: ${from}.`, '19.0a'));
    if (action.fromHexId === action.toHexId) issues.push(violation('SAME_PORT', ['toHexId'], 'Ship to another port.', '19.0f'));
  }
  const to = seaPortProblem(state, action.actorId, action.toHexId);
  if (to) issues.push(violation('PORT_UNAVAILABLE', ['toHexId'], `Cannot unload there: ${to}.`, '19.0a'));
  for (const [index, id] of action.unitIds.entries()) {
    const unit = pieceById(state, id);
    if (!unit) { issues.push(violation('UNKNOWN_PIECE', ['unitIds', index], 'Unknown unit.', '19.0f')); continue; }
    if (isSupply(state, unit)) { issues.push(violation('SUPPLY_AS_UNIT', ['unitIds', index], 'Ship SP as supply, not as a unit.', '19.0f')); continue; }
    const problem = seaUnitProblem(state, unit, action.actorId, action.fromHexId);
    if (problem) issues.push(violation('UNIT_CANNOT_SHIP', ['unitIds', index], `${definitionOf(state, unit)?.name ?? 'Unit'}: ${problem}.`, '19.0f'));
  }
  let tokens = 0;
  const taken = new Map<PieceId, number>();
  const sources = supplySources(state, action.actorId, action.fromHexId);
  for (const [index, { sourcePieceId, tokens: quantity }] of action.supply.entries()) {
    const dump = sources.find(({ id }) => id === sourcePieceId);
    if (!dump) { issues.push(violation('DUMP_NOT_AT_PORT', ['supply', index], 'SP are loaded from your dumps in the loading port (or your SP waiting in the Box).', '19.0f')); continue; }
    const total = (taken.get(sourcePieceId) ?? 0) + quantity;
    taken.set(sourcePieceId, total);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || total > loadableTokens(state, dump, action.fromHexId)) {
      issues.push(violation('INVALID_SEA_SUPPLY', ['supply', index], 'Load a positive number of the Tokens the dump may load this phase (12.2a).', '12.2a'));
    }
    tokens += Math.max(0, quantity);
  }
  if (issues.length > 0) return issues;
  const cost = cargoQuarters(state, action.unitIds, tokens);
  const left = seaCapRemainingQuarters(state, action.actorId);
  if (cost > left) issues.push(violation('SEA_CAP_EXCEEDED', ['unitIds'], `The shipment costs ${quartersText(cost)} Sea Cap; ${quartersText(left)} is left this phase (19.0f E).`, '19.0f'));
  const single = action.unitIds.length === 1 && tokens === 0 && isCombatUnit(state, pieceById(state, action.unitIds[0]!)!);
  for (const [end, hexId] of [['fromHexId', action.fromHexId], ['toHexId', action.toHexId]] as const) {
    if (hexId === null) continue;
    if (!portTakes(state, action.actorId, hexId, cost, single).ok) {
      issues.push(violation('PORT_CAPACITY_EXCEEDED', [end], `The shipment is ${quartersText(cost)} SP; the port ${end === 'fromHexId' ? 'loading' : 'unloading'} it has ${quartersText(portRemainingTokens(state, action.actorId, hexId))} SP of capacity left this phase (19.0a).`, '19.0a'));
    }
  }
  return issues;
};

/** Sea Cap a shipment costs, for previews. */
export const seaMoveQuarters = (state: GameState, unitIds: readonly PieceId[], tokens: number): number => cargoQuarters(state, unitIds, tokens);

export const applySeaMove = (state: GameState, action: SeaMove): Transition => {
  const tokens = action.supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
  const quarters = cargoQuarters(state, action.unitIds, tokens);
  const single = action.unitIds.length === 1 && tokens === 0 && isCombatUnit(state, pieceById(state, action.unitIds[0]!)!);
  // Shipping is how these units act: the unit moving before them has finished (6.1g).
  let next: GameState = state;
  const previous = state.currentMoverId !== null && !action.unitIds.includes(state.currentMoverId) ? pieceById(state, state.currentMoverId) : undefined;
  if (previous) next = { ...next, usage: withUsage(next, { ...usageOf(next, previous), moved: true }) };
  next = { ...next, currentMoverId: null };
  for (const end of [action.fromHexId, action.toHexId]) {
    if (end !== null) next = usePortCapacity(next, end, quarters, portTakes(state, action.actorId, end, quarters, single).oversized);
  }
  for (const id of action.unitIds) {
    const unit = pieceById(next, id)!;
    const usage = usageOf(next, unit);
    const landed: PieceState = { ...withStatus(unit, RETURN_TURN_STATUS, null), location: { kind: 'ON_MAP', hexId: action.toHexId }, stackOrder: nextStackOrder(next.pieceState.pieces, action.toHexId, unit.id) };
    next = { ...next, pieceState: upsertPieceState(next.pieceState, landed) };
    // 19.0f C, 4.7d: no movement after shipping and no other transport this phase.
    next = { ...next, usage: withUsage(next, { ...usage, moved: true, seaCarried: true, phaseStartHexId: usage.phaseStartHexId ?? action.fromHexId ?? action.toHexId, movementSpentTicks: Math.max(usage.movementSpentTicks, movementAllowanceTicks(next, landed)) }) };
    // 13.3h: a combat unit entering a Hex holds it.
    if (isCombatUnit(next, landed)) next = { ...next, mapState: setHexControl(next.mapState, action.toHexId, action.actorId) };
  }
  // SP leave their dumps and unload as a dump that cannot be loaded again this phase (12.2a).
  for (const { sourcePieceId, tokens: quantity } of action.supply) {
    const dump = pieceById(next, sourcePieceId)!;
    const remaining = (dump.resourceQuantity ?? 0) - quantity;
    next = { ...next, pieceState: upsertPieceState(next.pieceState, remaining > 0 ? { ...dump, resourceQuantity: remaining } : { ...dump, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }) };
    const id = `sea-supply:${state.revision}:${action.toHexId}:${sourcePieceId}` as PieceId;
    const landed: PieceState = { ...dump, id, statuses: [], resourceQuantity: quantity, location: { kind: 'ON_MAP', hexId: action.toHexId }, stackOrder: nextStackOrder(next.pieceState.pieces, action.toHexId, id) };
    next = mergeSupplyAt({ ...next, pieceState: upsertPieceState(next.pieceState, landed) }, action.toHexId, action.actorId);
  }
  if (tokens > 0) {
    const kept = piecesAt(next, action.toHexId).find((piece) => piece.ownerId === action.actorId && isSupply(next, piece) && (piece.resourceQuantity ?? 0) > 0);
    if (kept) next = { ...next, usage: withUsage(next, { ...usageOf(next, kept), unloadedTokens: usageOf(next, kept).unloadedTokens + tokens }) };
  }
  next = mergeReplacementsAt(next, action.toHexId, action.actorId);
  const sea = seaOf(next);
  const spent = seaCapSpentQuarters(next, action.actorId) + quarters;
  next = {
    ...next,
    sea: {
      ...sea,
      spent: [...sea.spent.filter((entry) => entry.playerId !== action.actorId),
        { playerId: action.actorId, gameTurn: state.sequence.gameTurn, playerTurnIndex: state.sequence.playerTurnIndex, quarters: spent }],
    },
  };
  return { state: next, events: [{ kind: 'SEA_MOVED', sequence: 0, playerId: action.actorId, fromHexId: action.fromHexId, toHexId: action.toHexId, unitIds: action.unitIds, tokens, quarters }] };
};

// ─── Queries for the UI and the bot ──────────────────────────────────────────────────────────

export interface SeaPortSummary {
  readonly hexId: HexId;
  readonly controllerId: PlayerId | null;
  readonly printedTokens: number;
  readonly hits: number;
  readonly capacityTokens: number;
  /** Capacity left to the viewer this phase; 0 for a port that is not his or is shut down. */
  readonly remainingTokens: number;
  readonly shut: boolean;
}

/** Every port as `viewerId` sees it: who holds it, capacity, hits and what is left this phase. Ports are printed, so public. */
export const seaPortSummaries = (state: GameState, viewerId: PlayerId): readonly SeaPortSummary[] => stableSort(allPorts(state).map((port) => {
  const hexId = portHexOf(port);
  return {
    hexId, controllerId: port.controllerId, printedTokens: port.level, hits: port.damage, capacityTokens: portCapacityTokens(port),
    remainingTokens: portRemainingTokens(state, viewerId, hexId),
    shut: port.controllerId !== null && portShutForShipping(state, port.controllerId, hexId),
  };
}), (left, right) => String(left.hexId).localeCompare(String(right.hexId)));

export interface SeaMoveOptions {
  readonly capacityPoints: number | null;
  readonly remainingQuarters: number;
  /** Why nothing can be shipped from here now, or null. */
  readonly problem: string | null;
  readonly units: readonly { readonly pieceId: PieceId; readonly quarters: number; readonly problem: string | null }[];
  readonly dumps: readonly { readonly pieceId: PieceId; readonly loadableTokens: number }[];
  /** Friendly ports the cargo could be unloaded in, with their capacity left this phase. */
  readonly destinations: readonly { readonly hexId: HexId; readonly remainingTokens: number }[];
}

/** What a shipment from `fromHexId` (null: the reinforcement Box) could carry and where it could go (19.0f). */
export const querySeaMoveOptions = (state: GameState, actorId: PlayerId, fromHexId: HexId | null): RuleQueryResult<SeaMoveOptions> => {
  const capacityPoints = seaCapacityPoints(state, actorId);
  const phase = seaPhase(state, actorId);
  const problem = capacityPoints === null ? 'this game gives you no Sea Cap'
    : phase ? phase.message
      : fromHexId === null ? (arrivesBySea(state, actorId) ? null : 'your reinforcements do not come by sea')
        : seaPortProblem(state, actorId, fromHexId);
  const candidates = fromHexId === null ? seaBoxCargo(state, actorId) : piecesAt(state, fromHexId).filter((piece) => piece.ownerId === actorId);
  const units = candidates.filter((piece) => !isSupply(state, piece) && (isCombatUnit(state, piece) || isTransportPoint(state, piece) || isReplacement(state, piece)))
    .map((piece) => ({ pieceId: piece.id, quarters: unitSeaQuarters(state, piece), problem: seaUnitProblem(state, piece, actorId, fromHexId) }));
  const dumps = supplySources(state, actorId, fromHexId).map((dump) => ({ pieceId: dump.id, loadableTokens: loadableTokens(state, dump, fromHexId) }));
  const destinations = problem !== null ? [] : allPorts(state).map(portHexOf)
    .filter((hexId) => hexId !== fromHexId && seaPortProblem(state, actorId, hexId) === null)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .map((hexId) => ({ hexId, remainingTokens: portRemainingTokens(state, actorId, hexId) }));
  return {
    allowed: problem === null && destinations.length > 0,
    value: { capacityPoints, remainingQuarters: seaCapRemainingQuarters(state, actorId), problem, units, dumps, destinations },
    reasons: [{ code: problem === null ? 'SEA_MOVE_OPTIONS' : 'SEA_MOVE_UNAVAILABLE', allowed: problem === null, message: problem ?? `${destinations.length} port(s).`, rule: '19.0f' }],
    facts: [],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `sea:${fromHexId ?? 'box'}` }],
  };
};
