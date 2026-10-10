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
  opponentOf,
} from '../pieces.js';
import { INTERNAL_RECOVERY_TOKENS_PER_LEVEL } from '../tables/ocs-4.3.js';
import { playerSupplyPathCostModel } from '../movement/bridging.js';
import { PORT_SOURCE_MINIMUM_TOKENS, portAt, portCapacityTokens } from '../port/state.js';
import { violation } from '../validation/violation.js';
import { hasEnemyCombatUnit, queryZoc } from '../zoc/zoc.js';
import { detrainableHexesFrom, isRailHex, railControlWith, railNetworkOf, railTraceReach, railTracePassable } from './rail.js';

/**
 * Supply paths (12.3): draw, throw and trace are counted like the movement of a non-combat unit,
 * never through enemy combat units, and a Truck path cannot pass in or out of an un-negated enemy
 * ZOC (12.3d). Weather that raises costs is ignored (17.0c). "Adjacent is close enough" (12.3c).
 */

type CostMap = ReadonlyMap<HexId, number>;

/**
 * Caches for supply paths and trace (12.3, 12.6). They read only the pieces, the map state (rail control), the
 * weather (path costs), the scenario and the configuration, so they are kept per combination of those objects
 * rather than per state: one End step passes through several states that change only the sequence, and a cache
 * per state started cold at each of them.
 */
interface TraceScope {
  readonly mapState: GameState['mapState'];
  readonly weather: GameState['weather'];
  readonly scenario: GameState['scenario'];
  readonly configuration: GameState['configuration'];
  readonly caches: Map<string, unknown>;
}

const traceScopes = new WeakMap<GameState['pieceState'], TraceScope[]>();

const traceScopeCache = <T>(state: GameState, name: string, create: () => T): T => {
  let scopes = traceScopes.get(state.pieceState);
  if (!scopes) { scopes = []; traceScopes.set(state.pieceState, scopes); }
  let scope = scopes.find((candidate) => candidate.mapState === state.mapState && candidate.weather === state.weather
    && candidate.scenario === state.scenario && candidate.configuration === state.configuration);
  if (!scope) {
    scope = { mapState: state.mapState, weather: state.weather, scenario: state.scenario, configuration: state.configuration, caches: new Map() };
    scopes.push(scope);
  }
  let cache = scope.caches.get(name) as T | undefined;
  if (cache === undefined) { cache = create(); scope.caches.set(name, cache); }
  return cache;
};

/**
 * What blocks a supply path for one player in one state, shared by every path traced in it (a large map
 * traces from dozens of sources): Hexes holding enemy combat units, and Hexes in un-negated enemy ZOC.
 */
interface SupplyPathBlocks {
  readonly enemyCombat: ReadonlySet<HexId>;
  readonly zoc: Map<HexId, boolean>;
}

const supplyPathBlocks = (state: GameState, playerId: PlayerId): SupplyPathBlocks => {
  const cache = traceScopeCache(state, 'path-blocks', () => new Map<string, SupplyPathBlocks>());
  const cached = cache.get(String(playerId));
  if (cached) return cached;
  const enemyCombat = new Set<HexId>();
  for (const piece of state.pieceState.pieces) {
    if (piece.ownerId === playerId || piece.location.kind !== 'ON_MAP' || enemyCombat.has(piece.location.hexId)) continue;
    if (hasEnemyCombatUnit(state, playerId, piece.location.hexId)) enemyCombat.add(piece.location.hexId);
  }
  const blocks: SupplyPathBlocks = { enemyCombat, zoc: new Map() };
  cache.set(String(playerId), blocks);
  return blocks;
};

/** A binary min-heap of [Hex, cost], cheapest first (ties by Hex ID, so the visit order is reproducible). */
class Frontier {
  readonly #items: Array<readonly [HexId, number]> = [];
  get size(): number { return this.#items.length; }
  static #less(left: readonly [HexId, number], right: readonly [HexId, number]): boolean {
    return left[1] < right[1] || (left[1] === right[1] && left[0] < right[0]);
  }
  push(item: readonly [HexId, number]): void {
    const items = this.#items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!Frontier.#less(items[index]!, items[parent]!)) break;
      [items[index], items[parent]] = [items[parent]!, items[index]!];
      index = parent;
    }
  }
  pop(): readonly [HexId, number] {
    const items = this.#items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && Frontier.#less(items[left]!, items[smallest]!)) smallest = left;
        if (right < items.length && Frontier.#less(items[right]!, items[smallest]!)) smallest = right;
        if (smallest === index) break;
        [items[index], items[smallest]] = [items[smallest]!, items[index]!];
        index = smallest;
      }
    }
    return top;
  }
}

export const supplyPathCosts = (
  state: GameState,
  playerId: PlayerId,
  originHexId: HexId,
  mobility: MobilityType,
  maximumTicks: number,
): CostMap => {
  const cache = traceScopeCache(state, 'paths', () => new Map<string, CostMap>());
  const key = `${playerId}|${originHexId}|${mobility}|${maximumTicks}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const costs = playerSupplyPathCostModel(state, playerId, mobility);
  const blocks = supplyPathBlocks(state, playerId);
  const zocBlocks = (hexId: HexId): boolean => {
    if (mobility !== 'truck') return false;
    let blocked = blocks.zoc.get(hexId);
    if (blocked === undefined) { blocked = !queryZoc(state, playerId, hexId, 'SUPPLY_PATH').allowed; blocks.zoc.set(hexId, blocked); }
    return blocked;
  };
  const best = new Map<HexId, number>([[originHexId, 0]]);
  const frontier = new Frontier();
  frontier.push([originHexId, 0]);
  const done = new Set<HexId>();
  while (frontier.size > 0) {
    const [hexId, cost] = frontier.pop();
    if (done.has(hexId)) continue;
    done.add(hexId);
    if (zocBlocks(hexId)) continue;
    for (const next of adjacentHexIds(hexId)) {
      if (done.has(next) || blocks.enemyCombat.has(next) || zocBlocks(next)) continue;
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

/**
 * Why a Hex is a Supply Source (12.6a): `MAP_EDGE` for a source the scenario declares (map-edge
 * railroad entry Hexes and other game-specific sources), `PORT` for a declared source in a port Hex (19.0e), `DETRAINABLE` for a detrainable rail Hex
 * (13.3c), `EXTENDER` for a linked Extender (12.7a).
 */
export interface SupplySourceHex {
  readonly hexId: HexId;
  readonly kind: 'MAP_EDGE' | 'PORT' | 'DETRAINABLE' | 'EXTENDER';
}


/**
 * 12.6a Supply Sources: the side's map-edge sources; detrainable Hexes with a rail path free of enemy
 * ZOC back to a source (13.3c, 13.3h, 13.8c); and Extenders linked to any of these, directly or in a
 * daisy chain (12.7a A, 12.7c). An Extender also joins the rail Hexes in or adjacent to its Hex
 * (12.7g) to its source, so the rail line beyond it becomes detrainable (12.7a B and C); one with no
 * source in range still does so when it reaches a rail Hex whose line leads back to a source (12.7a B).
 */
export const friendlySupplySources = (state: GameState, playerId: PlayerId): readonly SupplySourceHex[] => {
  const cache = traceScopeCache(state, 'sources', () => new Map<string, readonly SupplySourceHex[]>());
  const cached = cache.get(String(playerId));
  if (cached) return cached;
  const side = sideOf(state, playerId);
  const kinds = new Map<HexId, SupplySourceHex['kind']>();
  for (const { hexId, sideDefinitionId } of state.scenario.sources) {
    if ((sideDefinitionId !== null && sideDefinitionId !== side) || !sourceUsable(state, playerId, hexId)) continue;
    // 19.0e, 9.14h: a port the game makes a Supply Source serves only the side holding it, while it has 1 SP of capacity.
    const port = portAt(state, hexId);
    if (port && (port.controllerId !== playerId || portCapacityTokens(port) < PORT_SOURCE_MINIMUM_TOKENS)) continue;
    kinds.set(hexId, port ? 'PORT' : 'MAP_EDGE');
  }
  const sources = (): ReadonlySet<HexId> => new Set(kinds.keys());
  const extenders = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && hexOf(piece) !== null && isExtender(state, piece));
  const hasRail = railNetworkOf(state).neighbors.size > 0;
  // 12.7a B: Extenders that join a rail line leading to a source but are not themselves sources (no source in range).
  const connectors = new Set<HexId>();
  const railSeeds = (): HexId[] => {
    const seeds = [...kinds.keys()];
    for (const [hexId, kind] of [...kinds.entries(), ...[...connectors].map((hexId) => [hexId, 'EXTENDER'] as const)]) {
      if (kind !== 'EXTENDER') continue;
      seeds.push(...[hexId, ...adjacentHexIds(hexId)].filter((rail) => isRailHex(state, rail) && railTracePassable(state, playerId, rail)));
    }
    return seeds;
  };
  let added = true;
  while (added) {
    added = false;
    if (hasRail) {
      for (const hexId of detrainableHexesFrom(state, playerId, railSeeds())) {
        if (kinds.has(hexId) || !sourceUsable(state, playerId, hexId)) continue;
        kinds.set(hexId, 'DETRAINABLE');
        added = true;
      }
    }
    for (const extender of extenders) {
      const hexId = hexOf(extender)!;
      if (kinds.has(hexId) || !sourceUsable(state, playerId, hexId) || !extenderLinks(state, playerId, extender, sources())) continue;
      kinds.set(hexId, 'EXTENDER');
      connectors.delete(hexId);
      added = true;
    }
    if (!hasRail || added) continue;
    // 12.7a B: the "back" rail line need not hold a station; any rail Hex a trace path reaches from a source will do.
    const backLine = new Set(railTraceReach(state, playerId, railSeeds()));
    for (const extender of extenders) {
      const hexId = hexOf(extender)!;
      if (kinds.has(hexId) || connectors.has(hexId) || !sourceUsable(state, playerId, hexId) || !extenderLinks(state, playerId, extender, backLine)) continue;
      connectors.add(hexId);
      added = true;
    }
  }
  const result = [...kinds.entries()].map(([hexId, kind]) => ({ hexId, kind }))
    .sort((left, right) => String(left.hexId).localeCompare(String(right.hexId)));
  cache.set(String(playerId), result);
  return result;
};

/** Rail each side's trace path reaches from its Supply Sources (13.3c, 13.3h), as `actorId` sees it. */
export const queryRailControl = (state: GameState, actorId: PlayerId) => {
  const reach = (playerId: PlayerId) => new Set(railTraceReach(state, playerId, friendlySupplySources(state, playerId).map(({ hexId }) => hexId)));
  return railControlWith(state, reach(actorId), reach(opponentOf(state, actorId)));
};

/** Every Supply Source Hex of the player (12.6a); see `friendlySupplySources` for why each one counts. */
const sourceHexCache = new WeakMap<readonly SupplySourceHex[], readonly HexId[]>();
export const friendlySourceHexes = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  const sources = friendlySupplySources(state, playerId);
  let hexes = sourceHexCache.get(sources);
  if (!hexes) { hexes = sources.map(({ hexId }) => hexId); sourceHexCache.set(sources, hexes); }
  return hexes;
};

/**
 * A trace route key: `DRAW` (direct draw from any of the side's Supply Sources, which count as one common
 * source for 12.6f) or `HQ:<hq id>`.
 */
export type TraceRouteKey = string;

/**
 * Where trace supply reaches for one player, worked out once from the Supply Sources outward rather than
 * per Hex and per source (`routesFrom` for every source at every Hex grew with Hexes × sources × pieces):
 * a Hex has the DRAW route when it lies in or next to (12.3c) the truck draw of any source, and an HQ's
 * route when the HQ stands in or next to its own draw from a source and the Hex lies in or next to its
 * throw. An HQ tracing for itself draws where it stands (`selfReach`). Same answers as routing per Hex.
 */
interface TraceHq {
  readonly hq: PieceState;
  readonly key: TraceRouteKey;
  /** The HQ can draw from some Supply Source where it stands now (12.3b), so it throws. */
  readonly fed: boolean;
  /** Hexes in or adjacent to its throw; empty when not fed. */
  readonly throwReach: ReadonlySet<HexId>;
  /** Hexes in or adjacent to its own draw from any source, for the HQ tracing for itself. */
  readonly selfReach: () => ReadonlySet<HexId>;
}

interface TraceIndex {
  /** Hexes in or adjacent to the truck draw from any Supply Source (12.3a, 12.3c). */
  readonly draw: ReadonlySet<HexId>;
  readonly hqs: readonly TraceHq[];
}

/** The Hexes of the cost maps and every Hex adjacent to one (12.3c: adjacent is close enough). */
const withAdjacent = (maps: readonly CostMap[]): Set<HexId> => {
  const reached = new Set<HexId>();
  const expanded = new Set<HexId>();
  for (const costs of maps) {
    for (const hexId of costs.keys()) {
      if (expanded.has(hexId)) continue;
      expanded.add(hexId);
      reached.add(hexId);
      for (const adjacent of adjacentHexIds(hexId)) reached.add(adjacent);
    }
  }
  return reached;
};


const traceIndex = (state: GameState, playerId: PlayerId): TraceIndex => {
  const cache = traceScopeCache(state, 'trace-index', () => new Map<string, TraceIndex>());
  const cached = cache.get(String(playerId));
  if (cached) return cached;
  const sources = friendlySourceHexes(state, playerId);
  const range = state.configuration.supplyDrawRangeTicks;
  const drawFrom = (mobility: MobilityType) => sources.map((source) => supplyPathCosts(state, playerId, source, mobility, range));
  const hqs = throwingHqs(state, playerId).map((hq): TraceHq => {
    const mobility = hqMobility(state, hq);
    const hqHexId = hexOf(hq)!;
    const fed = sources.some((source) => reaches(supplyPathCosts(state, playerId, source, mobility, range), hqHexId));
    let self: ReadonlySet<HexId> | null = null;
    return {
      hq, key: `HQ:${hq.id}`, fed,
      throwReach: fed ? withAdjacent([supplyPathCosts(state, hq.ownerId, hqHexId, mobility, throwRangeTicks(state, hq))]) : new Set(),
      selfReach: () => (self ??= withAdjacent(drawFrom(mobility))),
    };
  });
  const index: TraceIndex = { draw: withAdjacent(drawFrom('truck')), hqs };
  cache.set(String(playerId), index);
  return index;
};

/**
 * The trace routes open at a Hex to `consumer` (or to any friendly unit when null), sorted: DRAW, and
 * each HQ that may supply the consumer (13.1d) and reaches it.
 */
const traceRoutesAt = (state: GameState, playerId: PlayerId, consumer: PieceState | null): ((hexId: HexId) => TraceRouteKey[]) => {
  const index = traceIndex(state, playerId);
  const hqs = index.hqs.filter(({ hq }) => hqMaySupply(state, hq, consumer));
  return (hexId) => {
    const keys: TraceRouteKey[] = [];
    if (index.draw.has(hexId)) keys.push('DRAW');
    for (const entry of hqs) {
      // An HQ supplying itself stands at `hexId`: it draws there and has nothing to throw, wherever it stands now.
      const supplied = consumer?.id === entry.hq.id ? entry.selfReach().has(hexId) : entry.fed && entry.throwReach.has(hexId);
      if (supplied) keys.push(entry.key);
    }
    return keys.sort();
  };
};

/** Every trace route open to `piece` from any Supply Source. */
export const traceRoutesFor = (state: GameState, piece: PieceState, hexId: HexId | null = locatedHexOf(state, piece)): readonly TraceRouteKey[] =>
  hexId === null ? [] : traceRoutesAt(state, piece.ownerId, piece)(hexId);

/** Trace routes reachable at a Hex by any friendly unit, ignoring formation and divisional limits. */
export const traceSupplyAvailableAt = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  traceRoutesAt(state, playerId, null)(hexId).length > 0;

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
    for (const key of pieceRoutes(state, piece)) byKey.set(key, [...(byKey.get(key) ?? []), piece.id]);
  }
  return stableSort([...byKey.entries()].map(([key, pieceIds]) => ({ routeKey: key, pieceIds })),
    (left, right) => right.pieceIds.length - left.pieceIds.length || left.routeKey.localeCompare(right.routeKey));
};

/**
 * A unit's own trace routes at its Hex, and each formation's route options, kept in the trace scope: the end of
 * a step asks whether every unit traces (12.6), Breakout asks again for every other unit (12.8e), and each answer
 * for a formation member needed the whole formation's routes. Keyed by the exact Piece object (immutable).
 */
const pieceRoutes = (state: GameState, piece: PieceState): readonly TraceRouteKey[] => {
  const cache = traceScopeCache(state, 'piece-routes', () => new WeakMap<PieceState, readonly TraceRouteKey[]>());
  let routes = cache.get(piece);
  if (!routes) { routes = traceRoutesFor(state, piece); cache.set(piece, routes); }
  return routes;
};

/** The formation's common route: the player's choice this Supply Phase, else the one covering most units. */
export const formationRoute = (state: GameState, playerId: PlayerId, formationId: DefinitionId): TraceRouteKey | null => {
  const cache = traceScopeCache(state, 'formation-options', () => new Map<string, ReturnType<typeof formationRouteOptions>>());
  const key = `${playerId}|${formationId}`;
  let options = cache.get(key);
  if (!options) { options = formationRouteOptions(state, playerId, formationId); cache.set(key, options); }
  const chosen = state.formationTraces.find((choice) => choice.formationId === formationId)?.routeKey;
  return options.find(({ routeKey: option }) => option === chosen)?.routeKey ?? options[0]?.routeKey ?? null;
};

/**
 * 12.6, 12.6f: does `piece` make its trace "for free"? A member of a multi-unit formation must use
 * the formation's common route; any other unit may use any route.
 */
export const pieceHasTrace = (state: GameState, piece: PieceState): boolean => computePieceHasTrace(state, piece);

const computePieceHasTrace = (state: GameState, piece: PieceState): boolean => {
  const routes = pieceRoutes(state, piece);
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

/**
 * Where a unit out of trace could still eat (12.6c): one friendly dump (or truck cargo) with the Tokens it holds and
 * every hex its SP reaches by draw (12.3a) or through an HQ throw (12.3b; for a selected unit the divisional HQ limit
 * of 13.1d applies).
 */
export interface FeedSource {
  readonly dumpId: string;
  readonly tokens: number;
  readonly hexIds: readonly string[];
}

/** The hexes each friendly dump's SP reaches for `consumer` (any unit when null), as routesFrom decides for one hex. */
const feedCoverage = (state: GameState, playerId: PlayerId, consumer: PieceState | null): FeedSource[] => {
  const dumps = state.pieceState.pieces.filter((piece) => isFriendlyDump(state, playerId, piece) && availableTokens(state, piece) > 0);
  if (dumps.length === 0) return [];
  const hqs = throwingHqs(state, playerId).filter((hq) => hq.id !== consumer?.id && hqMaySupply(state, hq, consumer));
  return dumps.map((dump) => {
    const origin = locatedHexOf(state, dump)!;
    const draw = supplyPathCosts(state, playerId, origin, 'truck', state.configuration.supplyDrawRangeTicks);
    const maps = [draw, ...hqs.filter((hq) => reaches(supplyPathCosts(state, playerId, origin, hqMobility(state, hq), state.configuration.supplyDrawRangeTicks), hexOf(hq)!))
      .map((hq) => supplyPathCosts(state, playerId, hexOf(hq)!, hqMobility(state, hq), throwRangeTicks(state, hq)))];
    const hexIds = state.scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => maps.some((map) => reaches(map, hexId)));
    return { dumpId: dump.id, tokens: availableTokens(state, dump), hexIds };
  });
};

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
  const routesAt = traceRoutesAt(state, actorId, piece ?? null);
  for (const { id: hexId, terrainDefinitionIds } of state.scenario.mapDefinition.hexes) {
    // No unit can stand at sea, so the sea beside a source or a port is never shown as covered.
    if (terrainDefinitionIds.some((id) => String(id) === 'terrain:water')) continue;
    const routes = routesAt(hexId);
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

/** Where each of the actor's dumps can feed `pieceId` (any unit when null) out of trace (12.6c). */
export const queryFeedCoverage = (state: GameState, actorId: PlayerId, pieceId: PieceId | null): RuleQueryResult<readonly FeedSource[]> => {
  const piece = pieceId === null ? null : pieceById(state, pieceId);
  if (pieceId !== null && (!piece || piece.ownerId !== actorId)) {
    return {
      allowed: false, value: [],
      reasons: [{ code: 'SUPPLY_CONSUMER_UNAVAILABLE', allowed: false, message: 'Choose one of your own units.', rule: '12.6c' }],
      facts: [], dependencies: [],
    };
  }
  return {
    allowed: true,
    value: feedCoverage(state, actorId, piece ?? null),
    reasons: [{ code: 'FEED_COVERAGE', allowed: true, message: 'Hexes where each dump can feed a unit out of trace.', rule: '12.6c' }],
    facts: [],
    dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: `supply:feeds:${pieceId ?? 'any'}` }],
  };
};

/** The actor's Supply Sources (12.6a) and why each counts: map edge, detrainable rail Hex, or Extender. */
export const querySupplySources = (state: GameState, actorId: PlayerId): RuleQueryResult<readonly SupplySourceHex[]> => ({
  allowed: true,
  value: friendlySupplySources(state, actorId),
  reasons: [{ code: 'SUPPLY_SOURCES', allowed: true, message: 'Map-edge sources, detrainable rail Hexes and linked Extenders.', rule: '12.6a' }],
  facts: [],
  dependencies: [{ aggregate: 'PIECE', revision: state.pieceState.revision, key: 'supply:sources' }],
});

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
