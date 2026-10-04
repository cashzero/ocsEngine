import { hexDistance, type DefinitionId, type HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import {
  addHexsideFeature,
  coordinateFor,
  definitionId,
  hexsideBetween,
  MinHeap,
  neighborCells,
  type GeneratedCell,
} from './internal.js';
import type { GeneratedSettlement } from './settlements.js';

/** Single-track railroad (13.3), the standard rail feature. */
export const RAIL = definitionId('edge:rail');
/** Multi-track railroad: a trunk line (13.3a halves Rail Cap along it). */
export const MULTI_TRACK_RAIL = definitionId('edge:multi-track-rail');
const RIVER = 'edge:river';
const MAJOR_RIVER = 'edge:major-river';

type RailClass = 'MULTI' | 'SINGLE';

/**
 * Railways at Beyond the Rhine scale (docs/generator/10-btr-scale-density.md): a multi-track trunk
 * runs between the two sides' main entries through the Major Cities, single-track lines reach every
 * Minor City and every entry Hex (so each map-edge entry is a railroad Supply Source, 12.6a), and
 * nearby towns get a direct line when the rail detour is long. Railways keep to low, open ground,
 * avoid hills more than roads do, and cross rivers at few bridges.
 */
const RAIL_TERRAIN_COST: Readonly<Record<GeneratedCell['terrain'], number>> = {
  CLEAR: 1, WOODS: 1.6, ROUGH: 2.8, MARSH: 4, MOUNTAIN: 14, WATER: Number.POSITIVE_INFINITY,
};
const RIVER_CROSSING_COST = 2.5;
const MAJOR_RIVER_CROSSING_COST = 5;
/** Railways run through towns: their stations are why the line was built. */
const SETTLEMENT_FACTOR = 0.8;
/** Following an existing line is cheap, so branches join the network instead of paralleling it. */
const SHARED_RAIL_FACTOR = 0.3;
/** A loop line only follows existing track where it runs the same way. */
const LOOP_SHARE_FACTOR = 0.85;
/**
 * Railways are much sparser than roads (about a quarter of the road density): only the larger Minor
 * Cities, the best-placed share by the settlement score, get a line of their own.
 */
const TOWN_RAIL_SHARE = 0.4;
/** A loop line is built only between stations whose rail detour is very long. */
const LOOP_RANGE = 8;
const LOOP_DETOUR_LIMIT = 2.5;

class RailNetwork {
  readonly #adjacency = new Map<HexId, Map<HexId, RailClass>>();

  classBetween(left: HexId, right: HexId): RailClass | undefined { return this.#adjacency.get(left)?.get(right); }

  has(hexId: HexId): boolean { return this.#adjacency.has(hexId); }

  add(path: readonly HexId[], railClass: RailClass): void {
    for (let index = 1; index < path.length; index += 1) {
      const left = path[index - 1]!;
      const right = path[index]!;
      const next = this.classBetween(left, right) === 'MULTI' ? 'MULTI' : railClass;
      for (const [from, to] of [[left, right], [right, left]] as const) {
        const links = this.#adjacency.get(from) ?? new Map<HexId, RailClass>();
        links.set(to, next);
        this.#adjacency.set(from, links);
      }
    }
  }

  /** Rail Hexes between two Hexes along the network, or Infinity beyond `limit`. */
  distance(start: HexId, goal: HexId, limit: number): number {
    if (start === goal) return 0;
    if (!this.has(start) || !this.has(goal)) return Number.POSITIVE_INFINITY;
    const seen = new Set<HexId>([start]);
    let frontier: HexId[] = [start];
    for (let steps = 1; steps <= limit && frontier.length > 0; steps += 1) {
      const next: HexId[] = [];
      for (const hexId of frontier) for (const other of this.#adjacency.get(hexId)?.keys() ?? []) {
        if (other === goal) return steps;
        if (!seen.has(other)) { seen.add(other); next.push(other); }
      }
      frontier = next;
    }
    return Number.POSITIVE_INFINITY;
  }

  edges(): readonly { readonly left: HexId; readonly right: HexId; readonly railClass: RailClass }[] {
    return [...this.#adjacency.entries()].flatMap(([left, links]) => [...links.entries()]
      .filter(([right]) => String(left) < String(right))
      .map(([right, railClass]) => ({ left, right, railClass })));
  }
}

interface RailContext {
  readonly cells: ReadonlyMap<HexId, GeneratedCell>;
  readonly hexsides: ReadonlyMap<HexsideId, ReadonlySet<DefinitionId>>;
  readonly settled: ReadonlySet<HexId>;
  readonly network: RailNetwork;
}

const stepCost = (context: RailContext, from: GeneratedCell, to: GeneratedCell, share: number): number => {
  let cost = RAIL_TERRAIN_COST[to.terrain];
  if (!Number.isFinite(cost)) return cost;
  for (const feature of context.hexsides.get(hexsideBetween(from.id, to.id)) ?? []) {
    if (String(feature) === MAJOR_RIVER) cost += MAJOR_RIVER_CROSSING_COST;
    else if (String(feature) === RIVER) cost += RIVER_CROSSING_COST;
  }
  if (context.settled.has(to.id)) cost *= SETTLEMENT_FACTOR;
  if (context.network.classBetween(from.id, to.id)) cost *= share;
  return cost;
};

/** Cheapest rail route from `start` to a Hex accepted by `isGoal`; A* toward `target` when one is known. */
const route = (
  context: RailContext,
  start: HexId,
  isGoal: (hexId: HexId) => boolean,
  target?: HexId,
  share = SHARED_RAIL_FACTOR,
): readonly HexId[] => {
  const heuristic = (hexId: HexId): number => (target ? hexDistance(coordinateFor(hexId), coordinateFor(target)) * share * SETTLEMENT_FACTOR : 0);
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
      const step = stepCost(context, current, next, share);
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

const nearestFirst = (nodes: readonly HexId[], joined: readonly HexId[]): { node: HexId; anchor: HexId } | null => {
  let best: { node: HexId; anchor: HexId; distance: number } | null = null;
  for (const node of nodes) for (const anchor of joined) {
    const distance = hexDistance(coordinateFor(node), coordinateFor(anchor));
    if (!best || distance < best.distance || (distance === best.distance && `${node}|${anchor}` < `${best.node}|${best.anchor}`)) {
      best = { node, anchor, distance };
    }
  }
  return best;
};

/**
 * Adds railroad hexsides to `hexsides`. `primaryEntries` are the two sides' main entry Hexes (the
 * trunk's ends); `entries` are every entry Hex, each of which becomes a rail Hex.
 */
export const generateRailNetwork = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  settlements: readonly GeneratedSettlement[],
  primaryEntries: readonly HexId[],
  entries: readonly HexId[],
): void => {
  const network = new RailNetwork();
  const context: RailContext = { cells, hexsides, settled: new Set(settlements.map(({ cell }) => cell.id)), network };
  const cities = settlements.filter(({ rank, cell, coreId }) => rank === 'CITY' && cell.id === coreId).map(({ cell }) => cell.id);
  // Settlements come ranked best first (selectSettlements), so the leading towns are the larger ones.
  const allTowns = settlements.filter(({ rank }) => rank === 'TOWN').map(({ cell }) => cell.id);
  const towns = allTowns.slice(0, Math.ceil(allTowns.length * TOWN_RAIL_SHARE));

  // 1. Multi-track trunk: a tree over the main entries and the Major Cities, nearest first.
  const trunk = [...new Set([...primaryEntries, ...cities])];
  const joined: HexId[] = [trunk[0]!];
  const pending = new Set(trunk.slice(1));
  while (pending.size > 0) {
    const { node, anchor } = nearestFirst([...pending], joined)!;
    network.add(route(context, anchor, (hexId) => hexId === node, node), 'MULTI');
    joined.push(node);
    pending.delete(node);
  }
  // 2. Single-track lines from every Minor City and entry Hex to the nearest point of the network.
  const branches = [...new Set([...towns, ...entries])].filter((hexId) => !network.has(hexId))
    .sort((left, right) => {
      const nearest = (hexId: HexId): number => Math.min(...trunk.map((other) => hexDistance(coordinateFor(hexId), coordinateFor(other))));
      return nearest(left) - nearest(right) || String(left).localeCompare(String(right));
    });
  for (const hexId of branches) {
    if (!network.has(hexId)) network.add(route(context, hexId, (other) => network.has(other)), 'SINGLE');
  }
  // 3. Loops: towns and cities a short way apart get a direct line when the rail detour is long.
  const stations = [...new Set([...cities, ...towns])];
  const pairs: { left: HexId; right: HexId; distance: number }[] = [];
  for (let i = 0; i < stations.length; i += 1) for (let j = i + 1; j < stations.length; j += 1) {
    const distance = hexDistance(coordinateFor(stations[i]!), coordinateFor(stations[j]!));
    if (distance <= LOOP_RANGE) pairs.push({ left: stations[i]!, right: stations[j]!, distance });
  }
  pairs.sort((a, b) => a.distance - b.distance || `${a.left}|${a.right}`.localeCompare(`${b.left}|${b.right}`));
  for (const { left, right, distance } of pairs) {
    const limit = Math.floor(distance * LOOP_DETOUR_LIMIT);
    if (network.distance(left, right, limit) <= limit) continue;
    network.add(route(context, left, (hexId) => hexId === right, right, LOOP_SHARE_FACTOR), 'SINGLE');
  }

  for (const { left, right, railClass } of network.edges()) {
    addHexsideFeature(hexsides, left, right, railClass === 'MULTI' ? MULTI_TRACK_RAIL : RAIL);
  }
};
