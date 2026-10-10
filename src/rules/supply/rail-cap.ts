import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { GameAction, GameState, RailArrival, RailState, RuleEvent, RuleViolation } from '../kernel/model.js';
import {
  adjacentHexIds,
  definitionOf,
  hexDistanceBetween,
  hexOf,
  isCombatUnit,
  isExtender,
  isOnMapCombatUnit,
  isTransportPoint,
  mobilityOf,
  movementAllowanceTicks,
  opponentOf,
  pieceById,
  piecesAt,
  reTicksOf,
  stepOf,
  transportPointsOf,
  usageOf,
  withUsage,
} from '../pieces.js';
import type { RuleQueryResult } from '../query/model.js';
import { mapIndexOf } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { exertsZoc, hasEnemyCombatUnit, inEnemyZoc } from '../zoc/zoc.js';
import { detrainableCandidate, hexControllerOf, isMultiTrackHexside, isRailHex, isRailStation, railNetworkOf } from './rail.js';
import { friendlySupplySources } from './supply.js';
import { mergeSupplyAt } from './transport.js';

/**
 * Rail Cap transport (13.3a-e, 4.7, 12.2a, 13.6b, 14.8c) and the front-line clause of railroad control (13.3h).
 * Rail Cap is counted in quarter points: one point moves 1 SP (four Tokens) or 1 RE (four quarter-RE ticks), so a
 * Token or a quarter RE costs one quarter. Halving (4.7b, multi-track) rounds up to the next quarter.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type RailMove = Extract<GameAction, { readonly kind: 'RAIL_MOVE' }>;

/** 4.7b: a Leg unit with a Move Mode MA of 1 to 6 counts half its size. */
const HALVED_MA_TICKS = 6 * 4;
const EMPTY_RAIL: RailState = { spent: [], arrivals: [] };

const railOf = (state: GameState): RailState => state.rail ?? EMPTY_RAIL;

/** Rail Cap points the player gets each friendly Movement Phase (13.3b), or null when the game has none. */
export const railCapacityPoints = (state: GameState, playerId: PlayerId): number | null =>
  state.configuration.railroads ? state.configuration.railCapacity?.find((entry) => entry.playerId === playerId)?.points ?? null : null;

/** Quarters of Rail Cap the player spent in the current Movement Phase. */
export const railCapSpentQuarters = (state: GameState, playerId: PlayerId): number =>
  railOf(state).spent.find((entry) => entry.playerId === playerId && entry.gameTurn === state.sequence.gameTurn
    && entry.playerTurnIndex === state.sequence.playerTurnIndex)?.quarters ?? 0;

/** Quarters of Rail Cap left to the player in the current Movement Phase. */
export const railCapRemainingQuarters = (state: GameState, playerId: PlayerId): number =>
  Math.max(0, (railCapacityPoints(state, playerId) ?? 0) * 4 - railCapSpentQuarters(state, playerId));

/** "2 1/4" for nine quarters. */
export const quartersText = (quarters: number): string => {
  const whole = Math.floor(quarters / 4);
  const part = ['', '1/4', '1/2', '3/4'][quarters % 4]!;
  return whole === 0 ? (part || '0') : part ? `${whole} ${part}` : String(whole);
};

// ─── Cargo (4.7) ─────────────────────────────────────────────────────────────────────────────

/** 4.7a-c: what one unit costs to move by rail, in quarters. A Transport Point counts its points, loaded or not. */
export const unitRailQuarters = (state: GameState, unit: PieceState): number => {
  if (isTransportPoint(state, unit)) return transportPointsOf(state, unit) * 4;
  const ticks = reTicksOf(state, unit);
  const ma = Number(stepOf(state, unit)?.movementPointTicks ?? 0);
  return mobilityOf(state, unit) === 'leg' && ma > 0 && ma <= HALVED_MA_TICKS ? Math.ceil(ticks / 2) : ticks;
};

const cargoQuarters = (state: GameState, unitIds: readonly PieceId[], tokens: number): number =>
  unitIds.reduce((total, id) => { const unit = pieceById(state, id); return total + (unit ? unitRailQuarters(state, unit) : 0); }, 0) + tokens;

const groundDumpsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  piecesAt(state, hexId).filter((piece) => piece.ownerId === playerId && definitionOf(state, piece)?.family === 'RESOURCE' && (piece.resourceQuantity ?? 0) > 0);

/** Tokens of a dump that may entrain: SP unloaded in this phase cannot be loaded again (12.2a). */
export const railLoadableTokens = (state: GameState, dump: PieceState): number =>
  Math.max(0, (dump.resourceQuantity ?? 0) - usageOf(state, dump).unloadedTokens);

/** Why `unit` cannot entrain now, or null (13.3a, 13.3e, 4.7d, 5.5a-5.10d). */
export const railUnitProblem = (state: GameState, unit: PieceState, ownerId: PlayerId): string | null => {
  if (unit.ownerId !== ownerId || unit.location.kind !== 'ON_MAP') return 'only your units on the map can entrain';
  const truck = isTransportPoint(state, unit);
  if (!truck && !isCombatUnit(state, unit)) return 'only combat units, Transport Points and SP travel by rail (13.3a)';
  if (truck && isExtender(state, unit)) return 'an Extender cannot move (12.7)';
  if (!truck && unit.mode !== 'MOVE') return 'it must be in Move Mode (13.3e)';
  const usage = usageOf(state, unit);
  if (usage.railCarried) return 'it already moved by rail this phase';
  if (usage.airCarried) return 'it already moved by air this phase (4.7d)';
  if (usage.seaCarried) return 'it was shipped this phase (4.7d)';
  if (usage.moved && state.currentMoverId !== unit.id) return 'it already finished moving this phase (6.1g)';
  if (usage.movementSpentTicks > movementAllowanceTicks(state, unit) / 2) return 'it has spent more than half its MA (4.7d)';
  return null;
};

// ─── Rail paths (13.3c, 13.3e, 13.3h) ────────────────────────────────────────────────────────

/** Hexes that hold enemy units of any kind: rail cargo may pass them but not detrain there (4.8 D). */
const holdsEnemy = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  piecesAt(state, hexId).some((piece) => piece.ownerId !== playerId);

/**
 * 13.3e: a cargo rail path enters no enemy combat unit and no enemy ZOC (13.3c: never negated to move cargo), and only
 * stations the player controls (13.3h); other rail Hexes have no control of their own.
 */
export const railCargoPassable = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  !hasEnemyCombatUnit(state, playerId, hexId) && !inEnemyZoc(state, playerId, hexId)
  && (!isRailStation(state, hexId) || hexControllerOf(state, hexId) === playerId);

/** 13.3c for cargo: the map-edge and port rail Supply Sources the player's rail paths start from (Extenders never count). */
const cargoSeeds = (state: GameState, playerId: PlayerId): readonly HexId[] =>
  friendlySupplySources(state, playerId).filter(({ kind, hexId }) => (kind === 'MAP_EDGE' || kind === 'PORT') && isRailHex(state, hexId) && railCargoPassable(state, playerId, hexId))
    .map(({ hexId }) => hexId);

const cargoNetworkCache = new WeakMap<GameState, Map<string, ReadonlySet<HexId>>>();

/** Rail Hexes a cargo rail path reaches from the player's map-edge rail sources. */
export const railCargoNetwork = (state: GameState, playerId: PlayerId): ReadonlySet<HexId> => {
  let cache = cargoNetworkCache.get(state);
  if (!cache) { cache = new Map(); cargoNetworkCache.set(state, cache); }
  const cached = cache.get(String(playerId));
  if (cached) return cached;
  const { neighbors } = railNetworkOf(state);
  const seen = new Set<HexId>(cargoSeeds(state, playerId));
  const queue = [...seen];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighbors.get(queue[head]!) ?? []) {
      if (seen.has(next) || !railCargoPassable(state, playerId, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  cache.set(String(playerId), seen);
  return seen;
};

/** 13.3c: a detrainable Hex for cargo, which is also where cargo may entrain (13.3e 1) and detrain (13.3e 3). */
export const isCargoDetrainable = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  detrainableCandidate(state, playerId, hexId) && railCargoNetwork(state, playerId).has(hexId)
  && !holdsEnemy(state, playerId, hexId);

/** Arrivals the player may still entrain "off-map" in `hexId` this turn (13.6b). */
export const railArrivalAt = (state: GameState, playerId: PlayerId, hexId: HexId): RailArrival | null =>
  railOf(state).arrivals.find((entry) => entry.playerId === playerId && entry.hexId === hexId && entry.gameTurn === state.sequence.gameTurn) ?? null;

export interface RailRoute {
  readonly path: readonly HexId[];
  /** Cost multiplier in halves: 1 = halved (all multi-track), 2 = normal, 4 = doubled (a Trainbusting Zone). */
  readonly halves: 1 | 2 | 4;
}

/** 14.8b: the Hex is in an enemy Trainbusting Zone (the marker Hex and the six around it). */
const inTrainbustingZone = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  state.air.trainbusting.some((marker) => marker.ownerId !== playerId && hexDistanceBetween(marker.hexId, hexId) <= 1);

const searchPath = (
  state: GameState, playerId: PlayerId, fromHexId: HexId, toHexId: HexId, multiTrackOnly: boolean, avoidZones: boolean,
): readonly HexId[] | null => {
  const { neighbors } = railNetworkOf(state);
  const network = railCargoNetwork(state, playerId);
  if (avoidZones && (inTrainbustingZone(state, playerId, fromHexId) || inTrainbustingZone(state, playerId, toHexId))) return null;
  const parent = new Map<HexId, HexId | null>([[fromHexId, null]]);
  const queue = [fromHexId];
  for (let head = 0; head < queue.length; head += 1) {
    const hexId = queue[head]!;
    if (hexId === toHexId) {
      const path: HexId[] = [];
      for (let at: HexId | null = hexId; at !== null; at = parent.get(at) ?? null) path.unshift(at);
      return path;
    }
    for (const next of stableSort(neighbors.get(hexId) ?? [], (left, right) => String(left).localeCompare(String(right)))) {
      if (parent.has(next) || !network.has(next)) continue;
      if (multiTrackOnly && !isMultiTrackHexside(state, hexId, next)) continue;
      if (avoidZones && inTrainbustingZone(state, playerId, next)) continue;
      parent.set(next, hexId);
      queue.push(next);
    }
  }
  return null;
};

/** The cheapest legal rail path between two Hexes (13.3a), or null. Both ends must already be legal for cargo. */
export const railRoute = (state: GameState, playerId: PlayerId, fromHexId: HexId, toHexId: HexId): RailRoute | null => {
  if (fromHexId === toHexId) return null;
  const halved = searchPath(state, playerId, fromHexId, toHexId, true, true);
  if (halved) return { path: halved, halves: 1 };
  const normal = searchPath(state, playerId, fromHexId, toHexId, false, true) ?? searchPath(state, playerId, fromHexId, toHexId, true, false);
  if (normal) return { path: normal, halves: 2 };
  const doubled = searchPath(state, playerId, fromHexId, toHexId, false, false);
  return doubled ? { path: doubled, halves: 4 } : null;
};

export const routeQuarters = (baseQuarters: number, halves: RailRoute['halves']): number => Math.ceil(baseQuarters * halves / 2);

/**
 * Where cargo can entrain in `fromHexId` (13.3e 1): a detrainable Hex outside enemy ZOC, or a rail entry Hex where this turn's
 * reinforcements and SP arrived (13.6b ignores the entraining requirements). Returns the reason it cannot, or null.
 */
const entrainProblem = (state: GameState, playerId: PlayerId, fromHexId: HexId): string | null => {
  if (!isRailHex(state, fromHexId)) return 'the cargo is not on a railroad';
  if (railArrivalAt(state, playerId, fromHexId)) return null;
  if (!isCargoDetrainable(state, playerId, fromHexId)) return 'the Hex is not detrainable for you: it needs a village or city (or an Engineer-Capable HQ), your control, and a rail path free of enemy units and ZOC to a map-edge source (13.3c)';
  return null;
};

// ─── Validation and application ───────────────────────────────────────────────────────────────

const railPhase = (state: GameState, actorId: PlayerId): RuleViolation | null =>
  state.sequence.phase === 'MOVEMENT' && state.sequence.segment === 'MOVEMENT' && actorId === state.sequence.phasingPlayerId
    ? null
    : violation('INVALID_RAIL_PHASE', ['sequence'], 'Rail Cap can only be used in your Movement Phase (13.3b).', '13.3b');

export const validateRailMove = (state: GameState, action: RailMove): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const phase = railPhase(state, action.actorId);
  if (phase) return [phase];
  const capacity = railCapacityPoints(state, action.actorId);
  if (capacity === null) return [violation('NO_RAIL_CAPACITY', ['kind'], 'This game gives you no Rail Cap (13.3b).', '13.3b')];
  if (action.unitIds.length === 0 && action.supply.length === 0) issues.push(violation('EMPTY_RAIL_CARGO', ['unitIds'], 'Choose units or SP to move by rail.', '13.3a'));
  if (new Set(action.unitIds).size !== action.unitIds.length) issues.push(violation('DUPLICATE_RAIL_CARGO', ['unitIds'], 'A unit is listed twice.', '13.3a'));
  const entrain = entrainProblem(state, action.actorId, action.fromHexId);
  if (entrain) issues.push(violation('NOT_ENTRAINABLE', ['fromHexId'], `Cannot entrain here: ${entrain}.`, '13.3c'));
  const arrival = railArrivalAt(state, action.actorId, action.fromHexId);
  // 13.6b only lifts the entraining requirements for this turn's arrivals; anything else needs a detrainable Hex.
  const offMap = arrival !== null && !isCargoDetrainable(state, action.actorId, action.fromHexId);
  if (!isCargoDetrainable(state, action.actorId, action.toHexId)) {
    issues.push(violation('NOT_DETRAINABLE', ['toHexId'], 'Cargo detrains only in a detrainable Hex you control, with no enemy unit, reached by a rail path free of enemy units and ZOC (13.3c, 13.3e).', '13.3c'));
  }
  if (inEnemyZoc(state, action.actorId, action.toHexId)) issues.push(violation('DETRAIN_IN_ENEMY_ZOC', ['toHexId'], 'Cargo cannot detrain in an enemy ZOC (13.3e).', '13.3e'));
  if (!offMap && inEnemyZoc(state, action.actorId, action.fromHexId)) issues.push(violation('ENTRAIN_IN_ENEMY_ZOC', ['fromHexId'], 'Cargo cannot entrain in an enemy ZOC (13.3e).', '13.3e'));
  for (const [index, id] of action.unitIds.entries()) {
    const unit = pieceById(state, id);
    if (!unit) { issues.push(violation('UNKNOWN_PIECE', ['unitIds', index], 'Unknown unit.', '13.3a')); continue; }
    const problem = railUnitProblem(state, unit, action.actorId);
    if (problem) issues.push(violation('UNIT_CANNOT_ENTRAIN', ['unitIds', index], `${definitionOf(state, unit)?.name ?? 'Unit'}: ${problem}.`, '13.3e'));
    else if (hexOf(unit) !== action.fromHexId) issues.push(violation('UNIT_NOT_AT_ENTRAINING_HEX', ['unitIds', index], 'Every unit must be in the entraining Hex.', '13.3e'));
    else if (offMap && !arrival!.pieceIds.includes(unit.id)) issues.push(violation('NOT_AN_ARRIVAL', ['unitIds', index], 'Only units that arrived here this turn can entrain off-map (13.6b).', '13.6b'));
  }
  let tokens = 0;
  const taken = new Map<PieceId, number>();
  for (const [index, { sourcePieceId, tokens: quantity }] of action.supply.entries()) {
    const dump = pieceById(state, sourcePieceId);
    if (!dump || dump.ownerId !== action.actorId || !groundDumpsAt(state, action.actorId, action.fromHexId).some(({ id }) => id === sourcePieceId)) {
      issues.push(violation('DUMP_NOT_IN_HEX', ['supply', index], 'SP entrain from your dumps in the entraining Hex.', '13.3e'));
      continue;
    }
    const total = (taken.get(sourcePieceId) ?? 0) + quantity;
    taken.set(sourcePieceId, total);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || total > railLoadableTokens(state, dump)) {
      issues.push(violation('INVALID_RAIL_SUPPLY', ['supply', index], total > (dump.resourceQuantity ?? 0) || quantity <= 0
        ? 'Entrain a positive number of the Tokens the dump holds.' : 'SP unloaded this phase cannot be loaded again this phase (12.2a).', '12.2a'));
    }
    tokens += Math.max(0, quantity);
  }
  if (offMap && tokens > arrival!.tokens) issues.push(violation('NOT_AN_ARRIVAL', ['supply'], `Only the ${arrival!.tokens}T that arrived here this turn can entrain off-map (13.6b).`, '13.6b'));
  if (issues.length > 0) return issues;
  const route = railRoute(state, action.actorId, action.fromHexId, action.toHexId);
  if (!route) return [violation('NO_RAIL_PATH', ['toHexId'], 'No rail path joins the two Hexes without entering enemy units, enemy ZOC or a station you do not control (13.3e, 13.3h).', '13.3e')];
  const cost = routeQuarters(cargoQuarters(state, action.unitIds, tokens), route.halves);
  const left = railCapRemainingQuarters(state, action.actorId);
  if (cost > left) issues.push(violation('RAIL_CAP_EXCEEDED', ['unitIds'], `The move costs ${quartersText(cost)} Rail Cap; ${quartersText(left)} is left this phase (13.3a).`, '13.3a'));
  return issues;
};

/** Rail Cap a move costs, for previews; null when the two Hexes are not joined. */
export const railMoveQuarters = (state: GameState, playerId: PlayerId, fromHexId: HexId, toHexId: HexId, unitIds: readonly PieceId[], tokens: number): number | null => {
  const route = railRoute(state, playerId, fromHexId, toHexId);
  return route ? routeQuarters(cargoQuarters(state, unitIds, tokens), route.halves) : null;
};

export const applyRailMove = (state: GameState, action: RailMove): Transition => {
  const route = railRoute(state, action.actorId, action.fromHexId, action.toHexId)!;
  const tokens = action.supply.reduce((total, { tokens: quantity }) => total + quantity, 0);
  const quarters = routeQuarters(cargoQuarters(state, action.unitIds, tokens), route.halves);
  const offMap = railArrivalAt(state, action.actorId, action.fromHexId) !== null && !isCargoDetrainable(state, action.actorId, action.fromHexId);
  // Entraining is how these units act: the unit moving before them has finished (6.1g).
  let next: GameState = state;
  const previous = state.currentMoverId !== null && !action.unitIds.includes(state.currentMoverId) ? pieceById(state, state.currentMoverId) : undefined;
  if (previous) next = { ...next, usage: withUsage(next, { ...usageOf(next, previous), moved: true }) };
  next = { ...next, currentMoverId: null };
  for (const id of action.unitIds) {
    const unit = pieceById(next, id)!;
    const usage = usageOf(next, unit);
    next = {
      ...next,
      pieceState: upsertPieceState(next.pieceState, { ...unit, location: { kind: 'ON_MAP', hexId: action.toHexId }, stackOrder: nextStackOrder(next.pieceState.pieces, action.toHexId, unit.id) }),
    };
    // 4.7d, 13.3e: no further movement after detraining, and no other transport this phase.
    next = { ...next, usage: withUsage(next, { ...usage, moved: true, railCarried: true, phaseStartHexId: usage.phaseStartHexId ?? action.fromHexId, movementSpentTicks: Math.max(usage.movementSpentTicks, movementAllowanceTicks(next, unit)) }) };
  }
  // SP leave their dumps and detrain as a dump that cannot be loaded again this phase (12.2a).
  let landed: PieceState | null = null;
  for (const { sourcePieceId, tokens: quantity } of action.supply) {
    const dump = pieceById(next, sourcePieceId)!;
    const remaining = (dump.resourceQuantity ?? 0) - quantity;
    next = { ...next, pieceState: upsertPieceState(next.pieceState, remaining > 0 ? { ...dump, resourceQuantity: remaining } : { ...dump, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }) };
    const id = `rail-supply:${state.revision}:${action.toHexId}:${sourcePieceId}` as PieceId;
    landed = { ...dump, id, statuses: [], resourceQuantity: quantity, location: { kind: 'ON_MAP', hexId: action.toHexId }, stackOrder: nextStackOrder(next.pieceState.pieces, action.toHexId, id) };
    next = mergeSupplyAt({ ...next, pieceState: upsertPieceState(next.pieceState, landed) }, action.toHexId, action.actorId);
  }
  if (landed) {
    const kept = groundDumpsAt(next, action.actorId, action.toHexId).find((dump) => definitionOf(next, dump)?.resource?.resourceDefinitionId === definitionOf(next, landed!)?.resource?.resourceDefinitionId);
    if (kept) next = { ...next, usage: withUsage(next, { ...usageOf(next, kept), unloadedTokens: usageOf(next, kept).unloadedTokens + tokens }) };
  }
  const rail = railOf(next);
  const spent = railCapSpentQuarters(next, action.actorId) + quarters;
  const arrivals = offMap ? rail.arrivals.map((entry) => entry.playerId === action.actorId && entry.hexId === action.fromHexId && entry.gameTurn === state.sequence.gameTurn
    ? { ...entry, tokens: entry.tokens - tokens, pieceIds: entry.pieceIds.filter((id) => !action.unitIds.includes(id)) } : entry) : rail.arrivals;
  next = {
    ...next,
    rail: {
      spent: [...rail.spent.filter((entry) => entry.playerId !== action.actorId),
        { playerId: action.actorId, gameTurn: state.sequence.gameTurn, playerTurnIndex: state.sequence.playerTurnIndex, quarters: spent }],
      arrivals,
    },
  };
  return { state: next, events: [{ kind: 'RAIL_MOVED', sequence: 0, playerId: action.actorId, path: route.path, unitIds: action.unitIds, tokens, quarters }] };
};

/** 13.6b: remember reinforcements and SP placed at a rail entry Hex this turn, which may entrain there off-map. */
export const recordRailArrival = (state: GameState, piece: PieceState, hexId: HexId): GameState => {
  if (railCapacityPoints(state, piece.ownerId) === null || !isRailHex(state, hexId)) return state;
  const isSupply = definitionOf(state, piece)?.family === 'RESOURCE';
  if (!isSupply && !isCombatUnit(state, piece) && !isTransportPoint(state, piece)) return state;
  const rail = railOf(state);
  const current = rail.arrivals.filter((entry) => entry.gameTurn === state.sequence.gameTurn);
  const existing = current.find((entry) => entry.playerId === piece.ownerId && entry.hexId === hexId);
  const updated: RailArrival = {
    playerId: piece.ownerId, gameTurn: state.sequence.gameTurn, hexId,
    tokens: (existing?.tokens ?? 0) + (isSupply ? piece.resourceQuantity ?? 0 : 0),
    pieceIds: [...(existing?.pieceIds ?? []), ...(isSupply ? [] : [piece.id])],
  };
  return {
    ...state,
    rail: {
      spent: rail.spent,
      arrivals: [...current.filter((entry) => entry !== existing), updated]
        .sort((left, right) => `${left.playerId}|${left.hexId}`.localeCompare(`${right.playerId}|${right.hexId}`)),
    },
  };
};

// ─── Queries for the UI and the bot ──────────────────────────────────────────────────────────

export interface RailDestination {
  readonly hexId: HexId;
  readonly path: readonly HexId[];
  readonly halves: RailRoute['halves'];
}

export interface RailMoveOptions {
  /** Points per Movement Phase; null when the game has no Rail Cap. */
  readonly capacityPoints: number | null;
  readonly remainingQuarters: number;
  /** Why nothing can entrain in the Hex now, or null. */
  readonly entrainProblem: string | null;
  /** 13.6b: arrivals that may entrain off-map here, or null. */
  readonly arrival: RailArrival | null;
  readonly units: readonly { readonly pieceId: PieceId; readonly quarters: number; readonly problem: string | null }[];
  readonly dumps: readonly { readonly pieceId: PieceId; readonly loadableTokens: number }[];
  readonly destinations: readonly RailDestination[];
}

/** Everything a rail move from `fromHexId` could carry and where it could go (13.3). */
export const queryRailMoveOptions = (state: GameState, actorId: PlayerId, fromHexId: HexId): RuleQueryResult<RailMoveOptions> => {
  const capacityPoints = railCapacityPoints(state, actorId);
  const phase = railPhase(state, actorId);
  const problem = capacityPoints === null ? 'this game gives you no Rail Cap' : phase ? phase.message : entrainProblem(state, actorId, fromHexId)
    ?? (inEnemyZoc(state, actorId, fromHexId) && !railArrivalAt(state, actorId, fromHexId) ? 'the Hex is in an enemy ZOC (13.3e)' : null);
  const arrival = railArrivalAt(state, actorId, fromHexId);
  const offMap = arrival !== null && !isCargoDetrainable(state, actorId, fromHexId);
  const units = piecesAt(state, fromHexId).filter((piece) => piece.ownerId === actorId && (isCombatUnit(state, piece) || isTransportPoint(state, piece)))
    .map((piece) => ({
      pieceId: piece.id, quarters: unitRailQuarters(state, piece),
      problem: railUnitProblem(state, piece, actorId) ?? (offMap && !arrival!.pieceIds.includes(piece.id) ? 'only this turn\'s arrivals entrain off-map here (13.6b)' : null),
    }));
  const dumps = groundDumpsAt(state, actorId, fromHexId).map((dump) => ({ pieceId: dump.id, loadableTokens: offMap ? Math.min(arrival!.tokens, railLoadableTokens(state, dump)) : railLoadableTokens(state, dump) }));
  const destinations = problem !== null ? [] : stableSort([...railCargoNetwork(state, actorId)], (left, right) => String(left).localeCompare(String(right)))
    .filter((hexId) => hexId !== fromHexId && isCargoDetrainable(state, actorId, hexId) && !inEnemyZoc(state, actorId, hexId))
    .flatMap((hexId) => { const route = railRoute(state, actorId, fromHexId, hexId); return route ? [{ hexId, path: route.path, halves: route.halves }] : []; });
  return {
    allowed: problem === null && destinations.length > 0,
    value: { capacityPoints, remainingQuarters: railCapRemainingQuarters(state, actorId), entrainProblem: problem, arrival, units, dumps, destinations },
    reasons: [{ code: problem === null ? 'RAIL_MOVE_OPTIONS' : 'RAIL_MOVE_UNAVAILABLE', allowed: problem === null, message: problem ?? `${destinations.length} destination(s).`, rule: '13.3' }],
    facts: [],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `rail:${fromHexId}` }],
  };
};

/** Hexes the player can entrain cargo in right now: detrainable Hexes outside enemy ZOC, and this turn's rail arrival Hexes. */
export const railEntrainHexes = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  if (railCapacityPoints(state, playerId) === null) return [];
  const hexes = new Set<HexId>([...railCargoNetwork(state, playerId)].filter((hexId) => isCargoDetrainable(state, playerId, hexId) && !inEnemyZoc(state, playerId, hexId)));
  for (const entry of railOf(state).arrivals) if (entry.playerId === playerId && entry.gameTurn === state.sequence.gameTurn) hexes.add(entry.hexId);
  return stableSort([...hexes], (left, right) => String(left).localeCompare(String(right)));
};

// ─── 13.3h: control of stations clearly behind a front ───────────────────────────────────────

/**
 * Hexes a player can reach from his map-edge sources and his combat units on the map without entering an enemy combat
 * unit, stopping at enemy ZOC that no friendly combat unit negates.
 */
const reachableGround = (state: GameState, playerId: PlayerId): ReadonlySet<HexId> => {
  const index = mapIndexOf(state);
  const enemy = opponentOf(state, playerId);
  const zoc = new Set<HexId>();
  const blocked = new Set<HexId>();
  const friendly = new Set<HexId>();
  for (const piece of state.pieceState.pieces) {
    if (piece.location.kind !== 'ON_MAP' || !isOnMapCombatUnit(state, piece)) continue;
    if (piece.ownerId === enemy) {
      blocked.add(piece.location.hexId);
      if (exertsZoc(state, piece)) for (const hexId of adjacentHexIds(piece.location.hexId)) zoc.add(hexId);
    } else if (piece.ownerId === playerId) friendly.add(piece.location.hexId);
  }
  const seeds = [
    ...friendly,
    ...state.scenario.sources.filter(({ sideDefinitionId }) => sideDefinitionId === null || sideDefinitionId === sideIdOf(state, playerId)).map(({ hexId }) => hexId),
  ];
  const seen = new Set<HexId>();
  const queue: HexId[] = [];
  for (const hexId of seeds) if (!blocked.has(hexId) && !seen.has(hexId) && index.getHex(hexId)) { seen.add(hexId); queue.push(hexId); }
  for (let head = 0; head < queue.length; head += 1) {
    const hexId = queue[head]!;
    if (zoc.has(hexId) && !friendly.has(hexId)) continue;
    for (const next of adjacentHexIds(hexId)) {
      if (seen.has(next) || blocked.has(next) || !index.getHex(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
};

const sideIdOf = (state: GameState, playerId: PlayerId) => state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;

/**
 * 13.3h: a station changes control when it is clearly on one side of the front line: only one player's ground reaches it
 * (see `reachableGround`). When both or neither reach it, there is doubt and control stays. Objectives keep their own
 * control (only a combat unit entering changes it), and games without Rail Cap keep the rule they were made with.
 */
export const applyFrontControl = (state: GameState, events: RuleEvent[]): GameState => {
  if (!state.configuration.railCapacity || railNetworkOf(state).neighbors.size === 0) return state;
  const [first, second] = state.scenario.players.map(({ id }) => id);
  if (!first || !second) return state;
  const reach = new Map([[first, reachableGround(state, first)], [second, reachableGround(state, second)]]);
  const objectives = new Set(state.configuration.objectives.map(({ hexId }) => hexId));
  let next = state;
  for (const hexId of stableSort([...railNetworkOf(state).neighbors.keys()], (left, right) => String(left).localeCompare(String(right)))) {
    if (objectives.has(hexId) || !isRailStation(state, hexId)) continue;
    const firstReaches = reach.get(first)!.has(hexId);
    const secondReaches = reach.get(second)!.has(hexId);
    if (firstReaches === secondReaches) continue;
    const controllerId = firstReaches ? first : second;
    if (hexControllerOf(next, hexId) === controllerId) continue;
    next = { ...next, mapState: setHexControl(next.mapState, hexId, controllerId) };
    events.push({ kind: 'RAIL_CONTROL_CHANGED', sequence: events.length, hexId, controllerId });
  }
  return next;
};
