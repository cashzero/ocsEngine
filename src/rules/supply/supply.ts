import { stableSort, type DefinitionId, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState, InternalStocksLevel, MobilityType, ResourceReservation, RuleViolation } from '../kernel/model.js';
import type { RuleQueryResult } from '../query/model.js';
import {
  adjacentHexIds,
  definitionOf,
  formationOf,
  hexOf,
  hqMaySupply,
  internalStocksOf,
  isCombatUnit,
  isExtender,
  isHq,
  isMultiUnitFormation,
  locatedHexOf,
  mobilityOf,
  pieceById,
  printedSteps,
  reTicksOf,
  stepOf,
  throwRangeTicks,
  usageOf,
} from '../pieces.js';
import { INTERNAL_RECOVERY_TOKENS_PER_LEVEL } from '../tables/ocs-4.3.js';
import { supplyPathCostModel } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { hasEnemyCombatUnit, queryZoc } from '../zoc/zoc.js';

/**
 * Supply paths (12.3): draw, throw and trace are counted like the movement of a non-combat unit,
 * never through enemy combat units, and a Truck path cannot pass in or out of an un-negated enemy
 * ZOC (12.3d). Weather that raises costs is ignored (17.0c). "Adjacent is close enough" (12.3c).
 */

type CostMap = ReadonlyMap<HexId, number>;

const pathCaches = new WeakMap<GameState, Map<string, CostMap>>();

export const supplyPathCosts = (
  state: GameState,
  playerId: PlayerId,
  originHexId: HexId,
  mobility: MobilityType,
  maximumTicks: number,
): CostMap => {
  let cache = pathCaches.get(state);
  if (!cache) { cache = new Map(); pathCaches.set(state, cache); }
  const key = `${playerId}|${originHexId}|${mobility}|${maximumTicks}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const costs = supplyPathCostModel(state, mobility);
  const blocked = new Map<HexId, boolean>();
  const zocBlocks = (hexId: HexId): boolean => {
    if (mobility !== 'truck') return false;
    if (!blocked.has(hexId)) blocked.set(hexId, !queryZoc(state, playerId, hexId, 'SUPPLY_PATH').allowed);
    return blocked.get(hexId)!;
  };
  const best = new Map<HexId, number>([[originHexId, 0]]);
  const frontier: Array<[HexId, number]> = [[originHexId, 0]];
  const done = new Set<HexId>();
  while (frontier.length > 0) {
    frontier.sort((left, right) => left[1] - right[1] || String(left[0]).localeCompare(String(right[0])));
    const [hexId, cost] = frontier.shift()!;
    if (done.has(hexId)) continue;
    done.add(hexId);
    if (zocBlocks(hexId)) continue;
    for (const next of adjacentHexIds(hexId)) {
      if (done.has(next) || hasEnemyCombatUnit(state, playerId, next) || zocBlocks(next)) continue;
      const step = costs.evaluate(hexId, next);
      if (step.kind !== 'COST' || step.all) continue;
      const total = cost + step.cost.totalTicks;
      if (total > maximumTicks + 1e-9 || total >= (best.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next, total);
      frontier.push([next, total]);
    }
  }
  cache.set(key, best);
  return best;
};

/** 12.3c: supply reaching the Hex or any Hex adjacent to it is good enough. */
const reaches = (costs: CostMap, hexId: HexId): boolean =>
  costs.has(hexId) || adjacentHexIds(hexId).some((adjacent) => costs.has(adjacent));

export const isFriendlyDump = (state: GameState, playerId: PlayerId, piece: PieceState): boolean =>
  piece.ownerId === playerId && definitionOf(state, piece)?.family === 'RESOURCE'
  && locatedHexOf(state, piece) !== null && (piece.resourceQuantity ?? 0) > 0;

/** HQs that can throw supply now (12.3b; not in Strat Mode, 12.6e). */
const throwingHqs = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && isHq(state, piece) && piece.mode !== 'STRAT' && throwRangeTicks(state, piece) > 0);

/** 12.3a exception: an HQ with a Leg or Track throw range counts its path with that mobility. */
const hqMobility = (state: GameState, hq: PieceState): MobilityType => mobilityOf(state, hq) ?? 'truck';

export const hqThrowReaches = (state: GameState, hq: PieceState, hexId: HexId): boolean =>
  reaches(supplyPathCosts(state, hq.ownerId, hexOf(hq)!, hqMobility(state, hq), throwRangeTicks(state, hq)), hexId);

export interface SupplyRoute {
  readonly method: 'DRAW' | 'HQ';
  readonly hqId: PieceId | null;
}

/**
 * Every way supply located at `originHexId` reaches `hexId` for `consumer`: direct draw (12.3a) or
 * an HQ that can draw it and throw it on (12.3b), subject to the divisional HQ limit (13.1d).
 */
const routesFrom = (
  state: GameState,
  playerId: PlayerId,
  originHexId: HexId,
  hexId: HexId,
  consumer: PieceState | null,
): readonly SupplyRoute[] => {
  const routes: SupplyRoute[] = [];
  const draw = supplyPathCosts(state, playerId, originHexId, 'truck', state.configuration.supplyDrawRangeTicks);
  if (reaches(draw, hexId)) routes.push({ method: 'DRAW', hqId: null });
  for (const hq of throwingHqs(state, playerId)) {
    if (!hqMaySupply(state, hq, consumer)) continue;
    const hqDraw = supplyPathCosts(state, playerId, originHexId, hqMobility(state, hq), state.configuration.supplyDrawRangeTicks);
    // An HQ supplying itself stands at `hexId`: it draws there and has nothing to throw, wherever it stands now.
    const supplied = consumer?.id === hq.id ? reaches(hqDraw, hexId) : reaches(hqDraw, hexOf(hq)!) && hqThrowReaches(state, hq, hexId);
    if (supplied) routes.push({ method: 'HQ', hqId: hq.id });
  }
  return routes;
};

/** Every route from a dump to `consumer` (direct draw and each HQ able to throw it on). */
export const routesFromDump = (state: GameState, dump: PieceState, consumer: PieceState): readonly SupplyRoute[] => {
  const origin = locatedHexOf(state, dump);
  const hexId = locatedHexOf(state, consumer);
  return origin === null || hexId === null ? [] : routesFrom(state, consumer.ownerId, origin, hexId, consumer);
};

export interface DumpAccess {
  readonly pieceId: PieceId;
  readonly hexId: HexId;
  readonly availableQuantity: number;
  readonly route: SupplyRoute;
}

const reservedFrom = (state: GameState, pieceId: PieceId): number => state.activeTransaction === null ? 0
  : [...state.activeTransaction.attackerPayments, ...state.activeTransaction.defenderPayments]
    .filter(({ resourcePieceId }) => resourcePieceId === pieceId)
    .reduce((total, { quantity }) => total + quantity, 0);

/** Tokens in a dump not already reserved by the combat being paid for. */
export const availableTokens = (state: GameState, dump: PieceState): number =>
  Math.max(0, (dump.resourceQuantity ?? 0) - reservedFrom(state, dump.id));

/** Friendly dumps whose SP can be drawn or thrown to `hexId` for `consumer` (12.3a/b). */
export const dumpsReaching = (
  state: GameState,
  playerId: PlayerId,
  hexId: HexId,
  consumer: PieceState | null = null,
): readonly DumpAccess[] =>
  stableSort(state.pieceState.pieces.flatMap((piece) => {
    if (!isFriendlyDump(state, playerId, piece)) return [];
    const available = availableTokens(state, piece);
    if (available <= 0) return [];
    const origin = locatedHexOf(state, piece)!;
    const route = routesFrom(state, playerId, origin, hexId, consumer)[0];
    return route ? [{ pieceId: piece.id, hexId: origin, availableQuantity: available, route }] : [];
  }), (left, right) => right.availableQuantity - left.availableQuantity || String(left.pieceId).localeCompare(String(right.pieceId)));

/** Dumps that reach every consumer (a multi-unit payment draws from sources common to all). */
export const dumpsReachingAll = (state: GameState, playerId: PlayerId, consumers: readonly PieceState[]): readonly DumpAccess[] => {
  const [first, ...rest] = consumers;
  if (!first || locatedHexOf(state, first) === null) return [];
  const others = rest.map((piece) => new Set(dumpsReaching(state, playerId, locatedHexOf(state, piece)!, piece).map(({ pieceId }) => pieceId)));
  return dumpsReaching(state, playerId, locatedHexOf(state, first)!, first).filter((dump) => others.every((set) => set.has(dump.pieceId)));
};

// ─── Trace supply (12.6) ───────────────────────────────────────────────────────────────────────

const sideOf = (state: GameState, playerId: PlayerId) => state.scenario.players.find(({ id }) => id === playerId)?.sideDefinitionId ?? null;

/** 12.6b: an un-negated enemy ZOC or an enemy combat unit in a Source Hex prevents trace. */
const sourceUsable = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  queryZoc(state, playerId, hexId, 'SUPPLY_PATH').allowed && !hasEnemyCombatUnit(state, playerId, hexId);

/** Printed Extender range (12.7b) in quarter-MP ticks, and its mobility. */
export const extenderRange = (state: GameState, extender: PieceState): { readonly ticks: number; readonly mobility: MobilityType } => ({
  ticks: (stepOf(state, extender)?.range ?? 0) * 4,
  mobility: mobilityOf(state, extender) ?? 'truck',
});

const extenderLinks = (state: GameState, playerId: PlayerId, extender: PieceState, sources: ReadonlySet<HexId>): boolean => {
  const hexId = hexOf(extender);
  if (!hexId) return false;
  const range = extenderRange(state, extender);
  const costs = supplyPathCosts(state, playerId, hexId, range.mobility, range.ticks);
  // 12.7g: adjacent is good enough.
  return [...sources].some((source) => reaches(costs, source));
};

const sourceCache = new WeakMap<GameState, Map<string, readonly HexId[]>>();

/**
 * 12.6a Supply Sources: the side's map-edge sources plus Extenders linked to one, directly or in a
 * daisy chain (12.7a, 12.7c).
 */
export const friendlySourceHexes = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  let cache = sourceCache.get(state);
  if (!cache) { cache = new Map(); sourceCache.set(state, cache); }
  const cached = cache.get(String(playerId));
  if (cached) return cached;
  const side = sideOf(state, playerId);
  const sources = new Set<HexId>(state.scenario.sources
    .filter(({ sideDefinitionId }) => sideDefinitionId === null || sideDefinitionId === side)
    .map(({ hexId }) => hexId)
    .filter((hexId) => sourceUsable(state, playerId, hexId)));
  const extenders = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hexOf(piece) !== null && isExtender(state, piece));
  let added = true;
  while (added) {
    added = false;
    for (const extender of extenders) {
      const hexId = hexOf(extender)!;
      if (sources.has(hexId) || !sourceUsable(state, playerId, hexId) || !extenderLinks(state, playerId, extender, sources)) continue;
      sources.add(hexId);
      added = true;
    }
  }
  const result = [...sources].sort();
  cache.set(String(playerId), result);
  return result;
};

/**
 * A trace route key: `DRAW` (direct draw from any of the side's Supply Sources, which count as one common
 * source for 12.6f) or `HQ:<hq id>`.
 */
export type TraceRouteKey = string;

const routeKey = (route: SupplyRoute): TraceRouteKey => route.method === 'DRAW' ? 'DRAW' : `HQ:${route.hqId}`;

/** Every trace route open to `piece` from any Supply Source. */
export const traceRoutesFor = (state: GameState, piece: PieceState, hexId: HexId | null = locatedHexOf(state, piece)): readonly TraceRouteKey[] => {
  if (hexId === null) return [];
  const keys = new Set<TraceRouteKey>();
  for (const source of friendlySourceHexes(state, piece.ownerId)) {
    for (const route of routesFrom(state, piece.ownerId, source, hexId, piece)) keys.add(routeKey(route));
  }
  return [...keys].sort();
};

/** Trace routes reachable at a Hex by any friendly unit, ignoring formation and divisional limits. */
export const traceSupplyAvailableAt = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  friendlySourceHexes(state, playerId).some((source) => routesFrom(state, playerId, source, hexId, null).length > 0);

/** Members of a multi-unit formation that are combat units on the map (13.7a). */
export const formationMembers = (state: GameState, playerId: PlayerId, formationId: DefinitionId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && isCombatUnit(state, piece) && formationOf(state, piece) === formationId);

/** Candidate common routes of a formation with the members each would supply (12.6f). */
export const formationRouteOptions = (
  state: GameState,
  playerId: PlayerId,
  formationId: DefinitionId,
): readonly { readonly routeKey: TraceRouteKey; readonly pieceIds: readonly PieceId[] }[] => {
  const byKey = new Map<TraceRouteKey, PieceId[]>();
  for (const piece of formationMembers(state, playerId, formationId)) {
    for (const key of traceRoutesFor(state, piece)) byKey.set(key, [...(byKey.get(key) ?? []), piece.id]);
  }
  return stableSort([...byKey.entries()].map(([key, pieceIds]) => ({ routeKey: key, pieceIds })),
    (left, right) => right.pieceIds.length - left.pieceIds.length || left.routeKey.localeCompare(right.routeKey));
};

/** The formation's common route: the player's choice this Supply Phase, else the one covering most units. */
export const formationRoute = (state: GameState, playerId: PlayerId, formationId: DefinitionId): TraceRouteKey | null => {
  const options = formationRouteOptions(state, playerId, formationId);
  const chosen = state.formationTraces.find((choice) => choice.formationId === formationId)?.routeKey;
  return options.find(({ routeKey: key }) => key === chosen)?.routeKey ?? options[0]?.routeKey ?? null;
};

/**
 * 12.6, 12.6f: does `piece` make its trace "for free"? A member of a multi-unit formation must use
 * the formation's common route; any other unit may use any route.
 */
export const pieceHasTrace = (state: GameState, piece: PieceState): boolean => {
  const routes = traceRoutesFor(state, piece);
  if (routes.length === 0) return false;
  const formationId = formationOf(state, piece);
  if (!isMultiUnitFormation(state, formationId)) return true;
  const common = formationRoute(state, piece.ownerId, formationId!);
  return common !== null && routes.includes(common);
};

export const validateFormationTraceChoice = (
  state: GameState,
  actorId: PlayerId,
  formationId: DefinitionId,
  key: TraceRouteKey,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'SUPPLY' || actorId !== state.sequence.phasingPlayerId) {
    issues.push(violation('INVALID_SUPPLY_PHASE_OR_ACTOR', ['sequence'], 'Trace routes are chosen in the friendly Supply Phase.', '12.6'));
  }
  if (!isMultiUnitFormation(state, formationId)) issues.push(violation('NOT_A_MULTI_UNIT_FORMATION', ['formationId'], 'Only multi-unit formations share a common trace.', '12.6f'));
  if (!formationRouteOptions(state, actorId, formationId).some(({ routeKey: option }) => option === key)) {
    issues.push(violation('UNKNOWN_TRACE_ROUTE', ['routeKey'], 'No unit of the formation can trace by that route.', '12.6f'));
  }
  return issues;
};

/**
 * Where the owner's trace supply reaches, for the map overlay: every Hex where `piece` would make its trace
 * (its divisional HQ limit, 13.1d, and its formation's common route, 12.6f, apply), or where any friendly
 * unit would when `piece` is null. Draw is always counted in Truck MP, so a unit's own MA does not matter.
 * Other HQs throw from where they stand; a selected HQ only draws for itself, so it never shows its own throw.
 * `directHexIds` are the covered hexes that trace straight to a Supply Source (12.3a), not through another HQ's
 * throw. For a selected HQ they are where it can stand and still throw (12.3b): a throw it merely receives keeps
 * the HQ itself in supply but gives it nothing to pass on.
 */
export interface TraceCoverage {
  readonly hexIds: readonly string[];
  readonly directHexIds: readonly string[];
}

export const queryTraceCoverage = (state: GameState, actorId: PlayerId, pieceId: PieceId | null): RuleQueryResult<TraceCoverage> => {
  const piece = pieceId === null ? null : pieceById(state, pieceId);
  if (pieceId !== null && (!piece || piece.ownerId !== actorId)) {
    return {
      allowed: false, value: { hexIds: [], directHexIds: [] },
      reasons: [{ code: 'SUPPLY_CONSUMER_UNAVAILABLE', allowed: false, message: 'Choose one of your own units.', rule: '12.6' }],
      facts: [], dependencies: [],
    };
  }
  const formationId = piece ? formationOf(state, piece) : null;
  // A formation with no member in trace has no common route yet: whichever route this unit finds would become it.
  const common = piece && isMultiUnitFormation(state, formationId) ? formationRoute(state, actorId, formationId!) : null;
  // A selected HQ's own route is its draw from the source, so it counts as direct.
  const direct = new Set<TraceRouteKey>(['DRAW', ...(piece ? [`HQ:${piece.id}`] : [])]);
  const hexIds: HexId[] = [];
  const directHexIds: HexId[] = [];
  for (const { id: hexId } of state.scenario.mapDefinition.hexes) {
    const routes = piece ? traceRoutesFor(state, piece, hexId)
      : [...new Set(friendlySourceHexes(state, actorId).flatMap((source) => routesFrom(state, actorId, source, hexId, null).map(routeKey)))];
    const usable = common === null ? routes : routes.filter((key) => key === common);
    if (usable.length === 0) continue;
    hexIds.push(hexId);
    if (usable.some((key) => direct.has(key))) directHexIds.push(hexId);
  }
  return {
    allowed: true,
    value: { hexIds, directHexIds },
    reasons: [{ code: 'TRACE_COVERAGE', allowed: true, message: 'Hexes where trace supply reaches.', rule: '12.6' }],
    facts: [],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:coverage:${pieceId ?? 'any'}` }],
  };
};

/** 12.6c: 1T feeds up to 2 RE; fractions round up. */
export const eatOffMapCost = (reTicks: number): number => Math.max(1, Math.ceil(reTicks / 8));

export interface SupplyValue {
  readonly method: 'SOURCE' | 'HQ' | 'DUMP' | 'NONE';
  readonly hqId: PieceId | null;
  readonly resourceSources: readonly DumpAccess[];
  readonly requiresPayment: boolean;
}

export type SupplyPurpose = 'TRACE' | 'COMBAT' | 'BARRAGE';

export const querySupply = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  purpose: SupplyPurpose = 'TRACE',
): RuleQueryResult<SupplyValue> => {
  const piece = pieceById(state, pieceId);
  const hexId = piece ? locatedHexOf(state, piece) : null;
  if (!piece || piece.ownerId !== actorId || hexId === null) {
    return {
      allowed: false,
      value: { method: 'NONE', hqId: null, resourceSources: [], requiresPayment: false },
      reasons: [{ code: 'SUPPLY_CONSUMER_UNAVAILABLE', allowed: false, message: 'Consumer is absent, not owned, or off the map.', rule: '12.3' }],
      facts: [], dependencies: [],
    };
  }
  const dumps = dumpsReaching(state, actorId, hexId, piece);
  const trace = purpose === 'TRACE' && pieceHasTrace(state, piece) ? traceRoutesFor(state, piece)[0] ?? null : null;
  const value: SupplyValue = trace
    ? { method: trace === 'DRAW' ? 'SOURCE' : 'HQ', hqId: trace.startsWith('HQ:') ? trace.slice(3) as PieceId : null, resourceSources: dumps, requiresPayment: false }
    : { method: dumps.length > 0 ? 'DUMP' : 'NONE', hqId: null, resourceSources: dumps, requiresPayment: dumps.length > 0 };
  const allowed = trace !== null || dumps.length > 0;
  return {
    allowed,
    value,
    reasons: [{
      code: trace ? 'TRACE_SUPPLY' : dumps.length > 0 ? 'ON_MAP_SUPPLY_AVAILABLE' : 'NO_SUPPLY',
      allowed,
      message: trace ? (trace === 'DRAW' ? 'Traces directly to a Supply Source.' : 'Traces through an HQ throw.')
        : dumps.length > 0 ? 'No trace; on-map supply can be drawn or thrown.' : 'No trace supply and no reachable dump.',
      rule: trace ? '12.6' : dumps.length > 0 ? '12.6c' : '12.6d',
    }],
    facts: [{ key: 'supply.dumpChoices', value: dumps.length, visibility: 'OWNER_ONLY', ownerId: actorId }],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:${purpose}:${pieceId}` }],
  };
};

const reservationFor = (state: GameState, dumpId: PieceId, quantity: number): ResourceReservation => {
  const piece = pieceById(state, dumpId)!;
  return { resourcePieceId: dumpId, quantity, unitDefinitionId: definitionOf(state, piece)!.resource!.unitDefinitionId };
};

/**
 * Pay `tokens` for `consumers`, drawing from dumps that reach all of them in the given preference
 * order (12.3a "one or more dumps"). Returns null when the full amount is unavailable.
 */
export const allocateSupply = (
  state: GameState,
  playerId: PlayerId,
  consumers: readonly PieceState[],
  tokens: number,
  preferred: readonly PieceId[] = [],
): readonly ResourceReservation[] | null => {
  if (tokens <= 0) return [];
  const common = dumpsReachingAll(state, playerId, consumers);
  const ordered = [
    ...preferred.flatMap((id) => common.filter(({ pieceId }) => pieceId === id)),
    ...common.filter(({ pieceId }) => !preferred.includes(pieceId)),
  ];
  const reservations: ResourceReservation[] = [];
  let remaining = tokens;
  for (const dump of ordered) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, dump.availableQuantity);
    reservations.push(reservationFor(state, dump.pieceId, quantity));
    remaining -= quantity;
  }
  return remaining > 0 ? null : reservations;
};

/** Total Tokens the consumers can reach from common dumps. */
export const reachableTokens = (state: GameState, playerId: PlayerId, consumers: readonly PieceState[]): number =>
  dumpsReachingAll(state, playerId, consumers).reduce((total, dump) => total + dump.availableQuantity, 0);

/** Spend reservations from their dumps; an emptied dump leaves the map (12.1c). */
export const spendReservations = (state: GameState, reservations: readonly ResourceReservation[]): GameState['pieceState'] => {
  let pieceState = state.pieceState;
  for (const reservation of reservations) {
    const dump = pieceState.pieces.find(({ id }) => id === reservation.resourcePieceId)!;
    const remaining = (dump.resourceQuantity ?? 0) - reservation.quantity;
    pieceState = {
      ...pieceState,
      pieces: pieceState.pieces.map((piece) => piece.id !== dump.id ? piece : remaining > 0
        ? { ...piece, resourceQuantity: remaining }
        : { ...piece, resourceQuantity: 0, location: { kind: 'ELIMINATED' } }),
      // A dump carried by a truck keeps its cargo load in step; once emptied it is no longer cargo.
      relations: pieceState.relations.flatMap((relation) => relation.kind !== 'CARGO' || relation.cargoId !== dump.id ? [relation]
        : remaining > 0 ? [{ ...relation, loadQuantity: remaining }] : []),
    };
  }
  return pieceState;
};

// ─── Supply Phase: eating off the map and internal stocks ─────────────────────────────────────

/** Combat units of `playerId` that fail trace supply and have not been fed this phase. */
export const unitsNeedingSupply = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && isCombatUnit(state, piece) && !usageOf(state, piece).supplyPaid && !pieceHasTrace(state, piece));

/** 12.10e: 2T per level for a unit, or per RE of a multi-step unit. */
export const recoveryTokensPerLevel = (state: GameState, piece: PieceState): number =>
  INTERNAL_RECOVERY_TOKENS_PER_LEVEL * (printedSteps(state, piece) > 1 ? Math.max(1, Math.ceil(reTicksOf(state, piece) / 4)) : 1);

/** Units that must recover internal stocks now (12.10eA): marked, not yet recovered, and a dump reaches them. */
export const unitsNeedingRecovery = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP'
    && isCombatUnit(state, piece) && internalStocksOf(piece) !== 'FULL' && !usageOf(state, piece).recovered
    && dumpsReaching(state, playerId, piece.location.hexId, piece).length > 0);

/** Recovery outcome for the Tokens available (12.10eC): what is spent and the new level. */
export const recoveryPlan = (
  state: GameState,
  piece: PieceState,
  availableTokensTotal: number,
): { readonly tokens: number; readonly level: InternalStocksLevel } => {
  const current = internalStocksOf(piece);
  const perLevel = recoveryTokensPerLevel(state, piece);
  const levels = current === 'EXHAUSTED' ? 2 : current === 'LOW' ? 1 : 0;
  const full = perLevel * levels;
  const tokens = Math.min(full, availableTokensTotal);
  const recoveredLevels = Math.floor(tokens / perLevel);
  const remaining = levels - recoveredLevels;
  return { tokens, level: remaining === 2 ? 'EXHAUSTED' : remaining === 1 ? 'LOW' : 'FULL' };
};

export const validateRecovery = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  sourcePieceIds: readonly PieceId[],
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'SUPPLY' || actorId !== state.sequence.phasingPlayerId) {
    issues.push(violation('INVALID_SUPPLY_PHASE_OR_ACTOR', ['sequence'], 'Internal stocks recover in the friendly Supply Phase.', '12.10e'));
  }
  const piece = pieceById(state, pieceId);
  if (!piece || !unitsNeedingRecovery(state, actorId).some(({ id }) => id === pieceId)) {
    issues.push(violation('NO_RECOVERY_NEEDED', ['pieceId'], 'This unit has no internal stocks to recover or no dump reaches it.', '12.10e'));
    return issues;
  }
  const reaching = new Set(dumpsReaching(state, actorId, hexOf(piece)!, piece).map(({ pieceId: id }) => id));
  if (sourcePieceIds.length === 0 || sourcePieceIds.some((id) => !reaching.has(id)) || new Set(sourcePieceIds).size !== sourcePieceIds.length) {
    issues.push(violation('INVALID_RECOVERY_SOURCE', ['sourcePieceIds'], 'Recovery draws from dumps that reach the unit.', '12.10e'));
  }
  return issues;
};

export const validateSupplyCheck = (
  state: GameState,
  actorId: PlayerId,
  pieceIds: readonly PieceId[],
  sourcePieceId: PieceId | null,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (state.sequence.phase !== 'SUPPLY' || actorId !== state.sequence.phasingPlayerId || actorId !== state.sequence.actingPlayerId) {
    issues.push(violation('INVALID_SUPPLY_PHASE_OR_ACTOR', ['sequence'], 'Supply is paid in the friendly Supply Phase.', '12.6'));
  }
  if (unitsNeedingRecovery(state, actorId).length > 0) {
    issues.push(violation('RECOVER_INTERNALS_FIRST', ['kind'], 'Recovering internal stocks takes priority over eating off the map.', '12.10eA'));
  }
  if (pieceIds.length === 0 || new Set(pieceIds).size !== pieceIds.length) {
    issues.push(violation('INVALID_SUPPLY_CONSUMERS', ['pieceIds'], 'Supply consumers must be a non-empty unique list.', '12.6'));
  }
  const pieces = pieceIds.map((id) => pieceById(state, id));
  for (const [index, piece] of pieces.entries()) {
    if (!piece || piece.ownerId !== actorId || !isCombatUnit(state, piece) || hexOf(piece) === null) {
      issues.push(violation('INVALID_SUPPLY_CONSUMER', ['pieceIds', index], 'Consumers must be friendly combat units on the map.', '12.0'));
      continue;
    }
    if (piece.mode === 'STRAT') issues.push(violation('STRAT_CANNOT_EAT_OFF_MAP', ['pieceIds', index], 'Strat Mode units cannot eat off the map.', '12.6e'));
    if (usageOf(state, piece).supplyPaid) issues.push(violation('SUPPLY_ALREADY_PAID', ['pieceIds', index], 'This unit was already fed this phase.', '12.6c'));
    if (pieceHasTrace(state, piece)) {
      issues.push(violation('TRACE_SUPPLY_AVAILABLE', ['pieceIds', index], 'Units can only eat off the map when no trace supply is available.', '12.6c'));
    }
  }
  if (sourcePieceId === null) {
    issues.push(violation('SUPPLY_SOURCE_REQUIRED', ['sourcePieceId'], 'Choose the dump that feeds these units.', '12.6c'));
  } else if (issues.length === 0) {
    const cost = eatOffMapCost(pieces.reduce((total, piece) => total + reTicksOf(state, piece!), 0));
    const reachesAll = pieces.every((piece) => dumpsReaching(state, actorId, hexOf(piece!)!, piece!)
      .some((dump) => dump.pieceId === sourcePieceId && dump.availableQuantity >= cost));
    if (!reachesAll) issues.push(violation('INVALID_SUPPLY_SOURCE', ['sourcePieceId'], 'That dump cannot reach every unit or lacks the Tokens.', '12.3'));
  }
  return issues;
};
