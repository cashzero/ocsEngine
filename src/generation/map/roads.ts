import { hexDistance, type DefinitionId, type HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import {
  addHexsideFeature,
  columnOf,
  coordinateFor,
  definitionId,
  hexsideBetween,
  MinHeap,
  neighborCells,
  type GeneratedCell,
} from './internal.js';
import { mixUint32 } from './rng.js';
import type { NormalizedMapGenerationOptions } from './model.js';
import { MAP_STYLE_PROFILES, type MapStyleProfile } from './styles.js';
import type { GeneratedSettlement } from './settlements.js';

/** BtR "Secondary Road" (1/2 MP); the main road class of a generated map. */
const MAIN_ROAD = definitionId('edge:primary-road');
/** BtR "Track" (1 MP); fills in between main roads, mostly to villages and in broken ground. */
const TRACK = definitionId('edge:road');
const RIVER = 'edge:river';
const MAJOR_RIVER = 'edge:major-river';

type RoadClass = 'MAIN' | 'TRACK';

/**
 * Scale (docs/generator/map-styles.md): at 3.5 miles a Hex, the BtR map runs a
 * Secondary Road every three to five Hexes in settled country, so no open Hex lies more than two
 * Hexes from a road, and forest or hills more than three. A generated map is a window on such a
 * landscape: roads leave every land border, towns are junctions, and the network has loops. Link
 * ranges, detour limits, border exits and the coverage gap come from the map style (styles.ts): the
 * eastern theme keeps the same structure with far fewer, longer roads.
 */
/** A Hex this far or farther from every road receives a through track: one beyond the style's road-gap limit. */
const coverageGap = (profile: MapStyleProfile, terrain: GeneratedCell['terrain']): number =>
  (terrain === 'CLEAR' || terrain === 'WOODS' || terrain === 'ROUGH' ? profile.roadGapLimit[terrain] + 1 : Number.POSITIVE_INFINITY);
const ROUTE_TERRAIN_COST: Readonly<Record<GeneratedCell['terrain'], number>> = {
  CLEAR: 1, WOODS: 1.7, ROUGH: 2.1, MARSH: 4.5, MOUNTAIN: 7, WATER: Number.POSITIVE_INFINITY,
};
/** Bridges are few: a crossing costs extra, so roads converge on the crossings that exist. */
const RIVER_CROSSING_COST = 1.6;
const MAJOR_RIVER_CROSSING_COST = 4;
/** Following an existing road is cheap, so new roads join and share the network instead of paralleling it. */
const SHARED_ROAD_FACTOR = 0.3;
/**
 * A shortcut is built because the existing road is a detour, so it must not simply be routed back
 * onto that detour: it follows existing road only where it runs the same way.
 */
const SHORTCUT_SHARE_FACTOR = 0.85;
const UPGRADED_TRACK_FACTOR = 0.6;
const SETTLEMENT_FACTOR = 0.75;
/** Roads cross the map border rather than run along it, which a map window would rarely show. */
const BORDER_FACTOR = 2.5;

class RoadNetwork {
  readonly #adjacency = new Map<HexId, Map<HexId, RoadClass>>();

  classBetween(left: HexId, right: HexId): RoadClass | undefined {
    return this.#adjacency.get(left)?.get(right);
  }

  has(hexId: HexId): boolean { return this.#adjacency.has(hexId); }

  hexes(): readonly HexId[] { return [...this.#adjacency.keys()]; }

  add(path: readonly HexId[], roadClass: RoadClass): void {
    for (let index = 1; index < path.length; index += 1) {
      const left = path[index - 1]!;
      const right = path[index]!;
      const next = this.classBetween(left, right) === 'MAIN' ? 'MAIN' : roadClass;
      for (const [from, to] of [[left, right], [right, left]] as const) {
        const links = this.#adjacency.get(from) ?? new Map<HexId, RoadClass>();
        links.set(to, next);
        this.#adjacency.set(from, links);
      }
    }
  }

  /** Road Hexes between two Hexes along the network, or Infinity beyond `limit`. */
  distance(start: HexId, goal: HexId, mainOnly: boolean, limit: number): number {
    if (start === goal) return 0;
    if (!this.has(start) || !this.has(goal)) return Number.POSITIVE_INFINITY;
    const seen = new Set<HexId>([start]);
    let frontier: HexId[] = [start];
    for (let steps = 1; steps <= limit && frontier.length > 0; steps += 1) {
      const next: HexId[] = [];
      for (const hexId of frontier) for (const [other, roadClass] of this.#adjacency.get(hexId) ?? []) {
        if (mainOnly && roadClass !== 'MAIN') continue;
        if (other === goal) return steps;
        if (!seen.has(other)) { seen.add(other); next.push(other); }
      }
      frontier = next;
    }
    return Number.POSITIVE_INFINITY;
  }

  components(): readonly (readonly HexId[])[] {
    const result: HexId[][] = [];
    const unseen = new Set([...this.#adjacency.keys()].sort());
    for (const first of [...unseen]) {
      if (!unseen.delete(first)) continue;
      const component = [first];
      for (let index = 0; index < component.length; index += 1) {
        for (const other of this.#adjacency.get(component[index]!)?.keys() ?? []) {
          if (unseen.delete(other)) component.push(other);
        }
      }
      result.push(component);
    }
    return result.sort((left, right) => right.length - left.length || String(left[0]).localeCompare(String(right[0])));
  }

  edges(): readonly { readonly left: HexId; readonly right: HexId; readonly roadClass: RoadClass }[] {
    return [...this.#adjacency.entries()].flatMap(([left, links]) => [...links.entries()]
      .filter(([right]) => String(left) < String(right))
      .map(([right, roadClass]) => ({ left, right, roadClass })));
  }
}

interface RoutingContext {
  readonly cells: ReadonlyMap<HexId, GeneratedCell>;
  readonly hexsides: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>;
  readonly settled: ReadonlySet<HexId>;
  readonly network: RoadNetwork;
  readonly onBorder: (cell: GeneratedCell) => boolean;
  readonly profile: MapStyleProfile;
}

const stepCost = (
  context: RoutingContext, from: GeneratedCell, to: GeneratedCell, roadClass: RoadClass, share: number,
): number => {
  const existing = context.network.classBetween(from.id, to.id);
  let cost = ROUTE_TERRAIN_COST[to.terrain];
  if (!Number.isFinite(cost)) return cost;
  for (const feature of context.hexsides.get(hexsideBetween(from.id, to.id)) ?? []) {
    if (String(feature) === MAJOR_RIVER) cost += MAJOR_RIVER_CROSSING_COST;
    else if (String(feature) === RIVER) cost += RIVER_CROSSING_COST;
  }
  if (context.settled.has(to.id)) cost *= SETTLEMENT_FACTOR;
  if (context.onBorder(to) && context.onBorder(from)) cost *= BORDER_FACTOR;
  if (existing === 'MAIN' || existing === roadClass) cost *= share;
  else if (existing === 'TRACK') cost *= Math.min(UPGRADED_TRACK_FACTOR, share);
  return cost;
};

/** Cheapest road route from `start` to any Hex accepted by `isGoal`; A* when a single `target` is known. */
const route = (
  context: RoutingContext,
  start: HexId,
  isGoal: (hexId: HexId) => boolean,
  roadClass: RoadClass,
  target?: HexId,
  share = SHARED_ROAD_FACTOR,
): readonly HexId[] => {
  const heuristic = (hexId: HexId): number => (target ? hexDistance(coordinateFor(hexId), coordinateFor(target)) * Math.min(share, UPGRADED_TRACK_FACTOR) : 0);
  const frontier = new MinHeap<HexId>();
  const cost = new Map<HexId, number>([[start, 0]]);
  const previous = new Map<HexId, HexId>();
  const closed = new Set<HexId>();
  frontier.push(start, heuristic(start));
  let reached: HexId | null = null;
  while (frontier.size > 0) {
    const currentId = frontier.pop()!;
    if (closed.has(currentId)) continue;
    closed.add(currentId);
    if (currentId !== start && isGoal(currentId)) { reached = currentId; break; }
    const current = context.cells.get(currentId)!;
    for (const next of neighborCells(current, context.cells)) {
      if (closed.has(next.id)) continue;
      const step = stepCost(context, current, next, roadClass, share);
      if (!Number.isFinite(step)) continue;
      const nextCost = cost.get(currentId)! + step;
      if (nextCost >= (cost.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(next.id, nextCost);
      previous.set(next.id, currentId);
      frontier.push(next.id, nextCost + heuristic(next.id));
    }
  }
  if (!reached) return [];
  const path: HexId[] = [reached];
  while (path[0] !== start) path.unshift(previous.get(path[0]!)!);
  return path;
};

const link = (context: RoutingContext, from: HexId, to: HexId, roadClass: RoadClass, share = SHARED_ROAD_FACTOR): void => {
  context.network.add(route(context, from, (hexId) => hexId === to, roadClass, to, share), roadClass);
};

/** Spanner: join close pairs whose current road connection is missing or a long detour. */
const densify = (
  context: RoutingContext,
  nodes: readonly HexId[],
  roadClass: RoadClass,
  range: number,
  detourLimit: number,
  accept: (left: HexId, right: HexId) => boolean = () => true,
): void => {
  const pairs: { left: HexId; right: HexId; distance: number }[] = [];
  for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
    const left = nodes[i]!;
    const right = nodes[j]!;
    const distance = hexDistance(coordinateFor(left), coordinateFor(right));
    if (distance <= range && accept(left, right)) pairs.push({ left, right, distance });
  }
  pairs.sort((a, b) => a.distance - b.distance || `${a.left}|${a.right}`.localeCompare(`${b.left}|${b.right}`));
  for (const { left, right, distance } of pairs) {
    const limit = Math.floor(distance * detourLimit);
    if (context.network.distance(left, right, roadClass === 'MAIN', limit) <= limit) continue;
    link(context, left, right, roadClass, SHORTCUT_SHARE_FACTOR);
  }
};

/** Points where main roads leave the map, spaced along every land border. */
const selectBorderExits = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  options: NormalizedMapGenerationOptions,
  reserved: readonly HexId[],
): readonly HexId[] => {
  const { width, height, seed } = options;
  const { borderExitSpacing, borderHexesPerExit } = MAP_STYLE_PROFILES[options.style].roads;
  const sides: GeneratedCell[][] = [[], [], [], []];
  for (const cell of cells.values()) {
    const column = columnOf(cell.coordinate);
    if (cell.coordinate.r === 0) sides[0]!.push(cell);
    if (cell.coordinate.r === height - 1) sides[1]!.push(cell);
    if (column === 0) sides[2]!.push(cell);
    if (column === width - 1) sides[3]!.push(cell);
  }
  const chosen: HexId[] = [];
  const taken = [...reserved];
  sides.forEach((side, sideIndex) => {
    const target = Math.max(1, Math.floor(side.length / borderHexesPerExit));
    const candidates = side
      .filter(({ terrain }) => terrain === 'CLEAR' || terrain === 'WOODS' || terrain === 'ROUGH')
      .map((cell) => ({
        cell,
        score: ROUTE_TERRAIN_COST[cell.terrain]
          + mixUint32(seed ^ 0x9b05688c ^ Math.imul(sideIndex + 1, 0x27d4eb2f) ^ Math.imul(cell.coordinate.q + 7, 2654435761) ^ Math.imul(cell.coordinate.r + 3, 40503)) / 0xffff_ffff * 1.5,
      }))
      .sort((left, right) => left.score - right.score || String(left.cell.id).localeCompare(String(right.cell.id)));
    let count = 0;
    for (const { cell } of candidates) {
      if (count >= target) break;
      if (taken.some((other) => hexDistance(coordinateFor(other), cell.coordinate) < borderExitSpacing)) continue;
      chosen.push(cell.id);
      taken.push(cell.id);
      count += 1;
    }
  });
  return chosen;
};

/** Multi-source distance, in Hexes, from every road Hex. */
const roadDistances = (cells: ReadonlyMap<HexId, GeneratedCell>, network: RoadNetwork): Map<HexId, number> => {
  const distance = new Map<HexId, number>();
  let frontier = network.hexes().filter((hexId) => cells.has(hexId));
  frontier.forEach((hexId) => distance.set(hexId, 0));
  for (let steps = 1; frontier.length > 0; steps += 1) {
    const next: HexId[] = [];
    for (const hexId of frontier) for (const other of neighborCells(cells.get(hexId)!, cells)) {
      if (distance.has(other.id)) continue;
      distance.set(other.id, steps);
      next.push(other.id);
    }
    frontier = next;
  }
  return distance;
};

/**
 * Lower `distance` (from `roadDistances`) after `added` Hexes join the network: distances only shrink,
 * so a search out from the new road Hexes alone gives what a fresh `roadDistances` would.
 */
const lowerRoadDistances = (cells: ReadonlyMap<HexId, GeneratedCell>, distance: Map<HexId, number>, added: readonly HexId[]): void => {
  let frontier = added.filter((hexId) => cells.has(hexId) && distance.get(hexId) !== 0);
  frontier.forEach((hexId) => distance.set(hexId, 0));
  for (let steps = 1; frontier.length > 0; steps += 1) {
    const next: HexId[] = [];
    for (const hexId of frontier) for (const other of neighborCells(cells.get(hexId)!, cells)) {
      if ((distance.get(other.id) ?? Number.POSITIVE_INFINITY) <= steps) continue;
      distance.set(other.id, steps);
      next.push(other.id);
    }
    frontier = next;
  }
};

/** Run a through track across every open district the network leaves empty. */
const fillCoverageGaps = (context: RoutingContext): void => {
  const distance = roadDistances(context.cells, context.network);
  for (let guard = 0; guard < context.cells.size; guard += 1) {
    let worst: { cell: GeneratedCell; excess: number } | null = null;
    for (const cell of context.cells.values()) {
      const gap = coverageGap(context.profile, cell.terrain);
      const excess = (distance.get(cell.id) ?? Number.POSITIVE_INFINITY) - gap;
      if (excess < 0 || !Number.isFinite(gap)) continue;
      if (!worst || excess > worst.excess || (excess === worst.excess && String(cell.id) < String(worst.cell.id))) worst = { cell, excess };
    }
    if (!worst) return;
    const origin = worst.cell.coordinate;
    const first = route(context, worst.cell.id, (hexId) => context.network.has(hexId), 'TRACK');
    if (first.length === 0) return;
    const joined = coordinateFor(first.at(-1)!);
    const away = { q: joined.q - origin.q, r: joined.r - origin.r };
    context.network.add(first, 'TRACK');
    lowerRoadDistances(context.cells, distance, first);
    const firstSet = new Set(first);
    // Continue out the far side, so the gap gets a through road rather than a dead end.
    const second = route(context, worst.cell.id, (hexId) => {
      if (firstSet.has(hexId) || !context.network.has(hexId)) return false;
      const at = coordinateFor(hexId);
      const toward = { q: at.q - origin.q, r: at.r - origin.r };
      // Dot product in axial space with the s component, i.e. cube coordinates.
      return away.q * toward.q + away.r * toward.r + (away.q + away.r) * (toward.q + toward.r) < 0;
    }, 'TRACK');
    if (second.length > 0 && second.length <= context.profile.roads.trackLinkRange + 3) {
      context.network.add(second, 'TRACK');
      lowerRoadDistances(context.cells, distance, second);
    }
  }
};

/** Join every stray piece of road to the largest network. */
const connectComponents = (context: RoutingContext): void => {
  for (let components = context.network.components(); components.length > 1; components = context.network.components()) {
    const main = new Set(components[0]);
    const stray = components.at(-1)!;
    const path = stray.map((hexId) => route(context, hexId, (other) => main.has(other), 'TRACK'))
      .filter((candidate) => candidate.length > 0)
      .sort((left, right) => left.length - right.length || String(left[0]).localeCompare(String(right[0])))[0];
    if (!path) return;
    context.network.add(path, 'TRACK');
  }
};

export const generateRoadNetwork = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
  settlements: readonly GeneratedSettlement[],
  entries: readonly HexId[],
): void => {
  const network = new RoadNetwork();
  const onBorder = (cell: GeneratedCell): boolean => cell.coordinate.r === 0 || cell.coordinate.r === options.height - 1
    || columnOf(cell.coordinate) === 0 || columnOf(cell.coordinate) === options.width - 1;
  const profile = MAP_STYLE_PROFILES[options.style];
  const { mainLinkRange, mainDetourLimit, trackLinkRange, trackDetourLimit } = profile.roads;
  const context: RoutingContext = { cells, hexsides, settled: new Set(settlements.map(({ cell }) => cell.id)), network, onBorder, profile };
  const centres = [...new Set([
    ...entries,
    ...settlements.filter(({ rank, cell, coreId }) => rank === 'TOWN' || (rank === 'CITY' && cell.id === coreId)).map(({ cell }) => cell.id),
  ])];

  // 1. Main-road tree over cities, towns and entries (nearest-first), so the network starts connected.
  // Each step joins the closest (pending, joined) pair, ties broken by "node|anchor". Every pending centre
  // keeps its closest joined anchor (ties by anchor ID, which orders "node|anchor" for a fixed node), updated
  // as centres join, so a step costs one pass over the pending centres instead of every pair.
  const pending = new Set(centres.slice(1));
  const nearest = new Map<HexId, { anchor: HexId; distance: number }>();
  const consider = (node: HexId, anchor: HexId): void => {
    const distance = hexDistance(coordinateFor(node), coordinateFor(anchor));
    const current = nearest.get(node);
    if (!current || distance < current.distance || (distance === current.distance && anchor < current.anchor)) nearest.set(node, { anchor, distance });
  };
  for (const node of pending) consider(node, centres[0]!);
  while (pending.size > 0) {
    let best: { node: HexId; anchor: HexId; distance: number } | null = null;
    for (const node of pending) {
      const { anchor, distance } = nearest.get(node)!;
      if (!best || distance < best.distance || (distance === best.distance && `${node}|${anchor}` < `${best.node}|${best.anchor}`)) {
        best = { node, anchor, distance };
      }
    }
    link(context, best!.anchor, best!.node, 'MAIN');
    pending.delete(best!.node);
    for (const node of pending) consider(node, best!.node);
  }
  // 2. Loops: towns a short way apart get a direct main road unless one already runs nearly straight.
  densify(context, centres, 'MAIN', mainLinkRange, mainDetourLimit);
  // 3. Main roads continue off every land border toward the world beyond the map.
  for (const exit of selectBorderExits(cells, options, entries)) {
    const nearest = [...centres].sort((left, right) => hexDistance(coordinateFor(exit), coordinateFor(left))
      - hexDistance(coordinateFor(exit), coordinateFor(right)) || String(left).localeCompare(String(right)))[0]!;
    link(context, exit, nearest, 'MAIN');
  }
  // 4. Every Major City Hex lies on a main road.
  for (const { cell } of settlements.filter(({ rank }) => rank === 'CITY')) {
    if (!network.has(cell.id)) network.add(route(context, cell.id, (hexId) => network.has(hexId), 'MAIN'), 'MAIN');
  }
  // 5. Tracks: villages join their neighbours and the road network.
  const places = settlements.map(({ cell }) => cell.id);
  const villages = new Set(settlements.filter(({ rank }) => rank === 'VILLAGE').map(({ cell }) => cell.id));
  densify(context, places, 'TRACK', trackLinkRange, trackDetourLimit, (left, right) => villages.has(left) || villages.has(right));
  for (const village of villages) {
    if (!network.has(village)) network.add(route(context, village, (hexId) => network.has(hexId), 'TRACK'), 'TRACK');
  }
  // 6. No open district is left without a road, and the network is one piece.
  fillCoverageGaps(context);
  connectComponents(context);

  for (const { left, right, roadClass } of network.edges()) {
    addHexsideFeature(hexsides, left, right, roadClass === 'MAIN' ? MAIN_ROAD : TRACK);
  }
};
