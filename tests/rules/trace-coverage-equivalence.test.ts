import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createInitialGameState,
  dumpsReaching,
  formationMembers,
  friendlySourceHexes,
  hasEnemyCombatUnit,
  prepareNewGame,
  queryZoc,
  queryFeedCoverage,
  queryTraceCoverage,
  stableSort,
  supplyPathCostModel,
  supplyPathCosts,
  traceRoutesFor,
  traceSupplyAvailableAt,
  type GameState,
  type HexId,
  type PieceState,
  type PlayerId,
} from '../../src/index.js';
import {
  adjacentHexIds, formationOf, hexOf, hqMaySupply, isHq, isMultiUnitFormation, locatedHexOf, mobilityOf, throwRangeTicks,
} from '../../src/rules/pieces.js';

/**
 * Trace supply (12.3, 12.6) is computed from the Supply Sources outward for speed (PERF-1). This keeps the
 * earlier Hex-by-Hex routing as a reference and checks both give the same routes, coverage and direct coverage
 * on generated games, including positions scrambled so that enemy ZOCs, unfed HQs, HQs in Strat Mode and
 * split formations all occur.
 */
const reference = (() => {
  const reaches = (costs: ReadonlyMap<HexId, number>, hexId: HexId) => costs.has(hexId) || adjacentHexIds(hexId).some((adjacent) => costs.has(adjacent));
  const throwingHqs = (state: GameState, playerId: PlayerId) => state.pieceState.pieces.filter((piece) => piece.ownerId === playerId
    && piece.location.kind === 'ON_MAP' && isHq(state, piece) && piece.mode !== 'STRAT' && throwRangeTicks(state, piece) > 0);
  const hqMobility = (state: GameState, hq: PieceState) => mobilityOf(state, hq) ?? 'truck';
  const routesFrom = (state: GameState, playerId: PlayerId, origin: HexId, hexId: HexId, consumer: PieceState | null): string[] => {
    const routes: string[] = [];
    const range = state.configuration.supplyDrawRangeTicks;
    if (reaches(supplyPathCosts(state, playerId, origin, 'truck', range), hexId)) routes.push('DRAW');
    for (const hq of throwingHqs(state, playerId)) {
      if (!hqMaySupply(state, hq, consumer)) continue;
      const hqDraw = supplyPathCosts(state, playerId, origin, hqMobility(state, hq), range);
      const supplied = consumer?.id === hq.id ? reaches(hqDraw, hexId)
        : reaches(hqDraw, hexOf(hq)!) && reaches(supplyPathCosts(state, hq.ownerId, hexOf(hq)!, hqMobility(state, hq), throwRangeTicks(state, hq)), hexId);
      if (supplied) routes.push(`HQ:${hq.id}`);
    }
    return routes;
  };
  const routes = (state: GameState, playerId: PlayerId, consumer: PieceState | null, hexId: HexId): string[] =>
    [...new Set(friendlySourceHexes(state, playerId).flatMap((source) => routesFrom(state, playerId, source, hexId, consumer)))].sort();
  const formationRoute = (state: GameState, playerId: PlayerId, formationId: NonNullable<ReturnType<typeof formationOf>>): string | null => {
    const byKey = new Map<string, string[]>();
    for (const member of formationMembers(state, playerId, formationId)) {
      for (const key of routes(state, playerId, member, locatedHexOf(state, member)!)) byKey.set(key, [...(byKey.get(key) ?? []), member.id]);
    }
    const options = stableSort([...byKey.entries()].map(([routeKey, pieceIds]) => ({ routeKey, pieceIds })),
      (left, right) => right.pieceIds.length - left.pieceIds.length || left.routeKey.localeCompare(right.routeKey));
    const chosen = state.formationTraces.find((choice) => choice.formationId === formationId)?.routeKey;
    return options.find(({ routeKey }) => routeKey === chosen)?.routeKey ?? options[0]?.routeKey ?? null;
  };
  const coverage = (state: GameState, playerId: PlayerId, piece: PieceState | null) => {
    const formationId = piece ? formationOf(state, piece) : null;
    const common = piece && isMultiUnitFormation(state, formationId) ? formationRoute(state, playerId, formationId!) : null;
    const direct = new Set(['DRAW', ...(piece ? [`HQ:${piece.id}`] : [])]);
    const hexIds: string[] = [];
    const directHexIds: string[] = [];
    for (const { id: hexId } of state.scenario.mapDefinition.hexes) {
      const all = routes(state, playerId, piece, hexId);
      const usable = common === null ? all : all.filter((key) => key === common);
      if (usable.length === 0) continue;
      hexIds.push(hexId);
      if (usable.some((key) => direct.has(key))) directHexIds.push(hexId);
    }
    return { hexIds, directHexIds };
  };
  return { routes, coverage };
})();

/** The earlier supply-path search (12.3): frontier re-sorted on every step, blocks looked up per call. */
const referenceCosts = (state: GameState, playerId: PlayerId, originHexId: HexId, mobility: ReturnType<typeof mobilityOf> & string, maximumTicks: number) => {
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
  return best;
};

const sortedEntries = (costs: ReadonlyMap<HexId, number>) => [...costs.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

const generated = (width: number, height: number, seed: number): GameState => {
  const prepared = prepareNewGame({
    ...DEFAULT_NEW_GAME_REQUEST, map: { ...DEFAULT_NEW_GAME_REQUEST.map, width, height },
    seeds: { map: seed, oob: seed + 1, deployment: seed + 2, rules: seed + 3 },
  });
  if (!prepared.ok) throw new Error(prepared.error.map(({ code }) => code).join(','));
  const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, 7);
  if (!created.ok) throw new Error(created.error.map(({ code }) => code).join(','));
  return created.value;
};

/** Every on-map piece moved to a pseudo-random land-or-not Hex; every third HQ put in Strat Mode. */
const scrambled = (state: GameState, seed: number): GameState => {
  let value = seed >>> 0;
  const next = () => { value = (Math.imul(value ^ (value >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return value; };
  const hexes = state.scenario.mapDefinition.hexes;
  let hqs = 0;
  return {
    ...state,
    pieceState: {
      ...state.pieceState,
      pieces: state.pieceState.pieces.map((piece) => {
        if (piece.location.kind !== 'ON_MAP') return piece;
        const moved: PieceState = { ...piece, location: { kind: 'ON_MAP', hexId: hexes[next() % hexes.length]!.id } };
        return isHq(state, piece) && (hqs += 1) % 3 === 0 ? { ...moved, mode: 'STRAT' } : moved;
      }),
    },
  };
};

/** What the compared states exercised, so the comparison cannot pass on trivial positions. */
const seen = { hqRoutes: 0, unfedHqs: 0, uncovered: 0 };

const players = (state: GameState) => state.scenario.players.map(({ id }) => id);

const expectSame = (state: GameState): void => {
  for (const playerId of players(state)) {
    // The path search itself, from every source in every mobility and from every HQ over its throw range.
    const range = state.configuration.supplyDrawRangeTicks;
    for (const source of friendlySourceHexes(state, playerId)) {
      for (const mobility of ['truck', 'leg', 'tracked'] as const) {
        expect(sortedEntries(supplyPathCosts(state, playerId, source, mobility, range)), `${playerId} ${mobility} from ${source}`)
          .toEqual(sortedEntries(referenceCosts(state, playerId, source, mobility, range)));
      }
    }
    for (const hq of state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isHq(state, piece))) {
      const mobility = mobilityOf(state, hq) ?? 'truck';
      expect(sortedEntries(supplyPathCosts(state, playerId, hexOf(hq)!, mobility, throwRangeTicks(state, hq))), `${hq.id} throw`)
        .toEqual(sortedEntries(referenceCosts(state, playerId, hexOf(hq)!, mobility, throwRangeTicks(state, hq))));
    }
    const any = queryTraceCoverage(state, playerId, null).value!;
    expect(any, `${playerId} any unit`).toEqual(reference.coverage(state, playerId, null));
    const covered = new Set(any.hexIds);
    seen.uncovered += state.scenario.mapDefinition.hexes.length - covered.size;
    for (const { id: hexId } of state.scenario.mapDefinition.hexes) {
      expect(traceSupplyAvailableAt(state, playerId, hexId), `${playerId} available at ${hexId}`).toBe(covered.has(hexId));
    }
    const own = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP');
    // Every HQ (its self-trace and the divisional limit), and a spread of other units.
    const sample = [...own.filter((piece) => isHq(state, piece)), ...own.filter((piece) => !isHq(state, piece)).filter((_, index) => index % 5 === 0)];
    for (const piece of sample) {
      expect(queryTraceCoverage(state, playerId, piece.id).value, `${piece.id} coverage`).toEqual(reference.coverage(state, playerId, piece));
      for (const { id: hexId } of state.scenario.mapDefinition.hexes.filter((_, index) => index % 7 === 0)) {
        const expected = reference.routes(state, playerId, piece, hexId);
        expect(traceRoutesFor(state, piece, hexId), `${piece.id} at ${hexId}`).toEqual(expected);
        seen.hqRoutes += expected.filter((key) => key.startsWith('HQ:')).length;
      }
      if (isHq(state, piece) && reference.routes(state, playerId, null, hexOf(piece)!).length === 0) seen.unfedHqs += 1;
    }
  }
};

describe('trace supply computed from the sources outward (PERF-1)', () => {
  it('matches Hex-by-Hex routing on generated openings', () => {
    for (const [width, height, seed] of [[16, 12, 11], [24, 18, 21], [20, 16, 31]] as const) expectSame(generated(width, height, seed));
  }, 120_000);

  it('matches Hex-by-Hex routing with units scrambled across the map', () => {
    const base = generated(16, 12, 41);
    for (const seed of [1, 2, 3, 4, 5, 6]) expectSame(scrambled(base, seed));
    const larger = generated(24, 18, 51);
    for (const seed of [7, 8]) expectSame(scrambled(larger, seed));
    expect(seen.hqRoutes).toBeGreaterThan(0);
    expect(seen.unfedHqs).toBeGreaterThan(0);
    expect(seen.uncovered).toBeGreaterThan(0);
  }, 120_000);

  // The bot asks where each dump can feed a unit out of trace (12.6c) for the whole map at once: the same dumps the
  // Supply Phase offers hex by hex.
  it('feed coverage lists the dumps that reach each hex', () => {
    let fed = 0;
    for (const state of [generated(16, 12, 61), scrambled(generated(16, 12, 41), 9), scrambled(generated(20, 16, 31), 10)]) {
      for (const { id: playerId } of state.scenario.players) {
        const own = state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP');
        for (const consumer of [null, ...own.filter((piece) => !isHq(state, piece)).filter((_, index) => index % 6 === 0)]) {
          const feeds = queryFeedCoverage(state, playerId, consumer?.id ?? null).value!;
          for (const { id: hexId } of state.scenario.mapDefinition.hexes.filter((_, index) => index % 3 === 0)) {
            const expected = dumpsReaching(state, playerId, hexId, consumer).map(({ pieceId }) => String(pieceId)).sort();
            expect(feeds.filter(({ hexIds }) => hexIds.includes(hexId)).map(({ dumpId }) => String(dumpId)).sort(), `${consumer?.id ?? 'any'} at ${hexId}`).toEqual(expected);
            fed += expected.length;
          }
        }
      }
    }
    expect(fed).toBeGreaterThan(0);
  }, 120_000);
});
