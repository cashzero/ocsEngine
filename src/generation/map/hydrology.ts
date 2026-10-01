import { HEX_DIRECTIONS, neighbor, type DefinitionId, type HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { createSeededRandom } from './rng.js';
import {
  addHexsideFeature,
  coordinateKey,
  definitionId,
  MinHeap,
  type GeneratedCell,
} from './internal.js';
import type { NormalizedMapGenerationOptions } from './model.js';

const RIVER = definitionId('edge:river');
const MAJOR_RIVER = definitionId('edge:major-river');

/** Priority-flood tilt: makes every flat or filled basin drain along a single downhill tree. */
const FLOOD_EPSILON = 1e-5;
/** Streams smaller than this much upstream rainfall are not drawn. */
const MINIMUM_RIVER_FLOW = 3;
/** Shortest river kept, in Hexsides. */
const MINIMUM_RIVER_LENGTH = 4;

/**
 * A hex corner, shared by up to three Hexes. Rivers run along Hexsides, so a river is a path
 * through corners; two river Hexsides therefore always join end to end, as on a printed map.
 */
interface Corner {
  readonly key: string;
  elevation: number;
  rain: number;
  /** Touches the map border or the sea, so water leaves the map here. */
  outlet: boolean;
  readonly links: Array<{ readonly corner: Corner; readonly left: GeneratedCell; readonly right: GeneratedCell }>;
}

const buildCorners = (cells: ReadonlyMap<HexId, GeneratedCell>, rngNoise: () => number): Corner[] => {
  const corners = new Map<string, Corner>();
  const cornerAt = (...coordinates: ReturnType<typeof neighbor>[]): Corner => {
    const members = coordinates.map((coordinate) => ({ coordinate, cell: cells.get(coordinateKey(coordinate) as HexId) }));
    const key = members.map(({ coordinate }) => coordinateKey(coordinate)).sort().join('|');
    let corner = corners.get(key);
    if (!corner) {
      const inside = members.flatMap(({ cell }) => (cell ? [cell] : []));
      const land = inside.filter(({ terrain }) => terrain !== 'WATER');
      corner = {
        key,
        elevation: land.length > 0 ? land.reduce((sum, { elevation }) => sum + elevation, 0) / land.length + rngNoise() * 0.02 : -1,
        rain: land.length > 0 ? 0.6 + land.reduce((sum, { moisture }) => sum + moisture, 0) / land.length : 0,
        outlet: inside.length < 3 || land.length < 3,
        links: [],
      };
      corners.set(key, corner);
    }
    return corner;
  };
  for (const cell of cells.values()) {
    if (cell.terrain === 'WATER') continue;
    HEX_DIRECTIONS.forEach((direction, index) => {
      const other = cells.get(coordinateKey(neighbor(cell.coordinate, direction)) as HexId);
      if (!other || other.terrain === 'WATER' || String(cell.id) > String(other.id)) return;
      const before = neighbor(cell.coordinate, HEX_DIRECTIONS[(index + 5) % 6]!);
      const after = neighbor(cell.coordinate, HEX_DIRECTIONS[(index + 1) % 6]!);
      const first = cornerAt(cell.coordinate, other.coordinate, before);
      const second = cornerAt(cell.coordinate, other.coordinate, after);
      first.links.push({ corner: second, left: cell, right: other });
      second.links.push({ corner: first, left: cell, right: other });
    });
  }
  return [...corners.values()];
};

/**
 * Rivers are drained, not wandered: every corner flows to the corner that carried the flood to it
 * (a priority-flood from the map border and coast, so basins fill and spill rather than dead-end),
 * rainfall accumulates downstream, and only the best-fed channels are drawn. Tributaries and
 * confluences emerge naturally and every river reaches the sea or the map edge.
 */
export const generateHydrology = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): void => {
  const rng = createSeededRandom(options.seed ^ 0x6a09e667);
  const corners = buildCorners(cells, () => rng.next() - 0.5);

  const level = new Map<Corner, number>();
  const receiver = new Map<Corner, { corner: Corner; left: GeneratedCell; right: GeneratedCell }>();
  const order: Corner[] = [];
  const frontier = new MinHeap<Corner>();
  for (const corner of corners) if (corner.outlet) {
    level.set(corner, corner.elevation);
    frontier.push(corner, corner.elevation);
  }
  const settled = new Set<Corner>();
  while (frontier.size > 0) {
    const current = frontier.pop()!;
    if (settled.has(current)) continue;
    settled.add(current);
    order.push(current);
    for (const link of current.links) {
      if (settled.has(link.corner) || link.corner.outlet) continue;
      const next = Math.max(link.corner.elevation, level.get(current)! + FLOOD_EPSILON);
      if (next >= (level.get(link.corner) ?? Number.POSITIVE_INFINITY)) continue;
      level.set(link.corner, next);
      receiver.set(link.corner, { corner: current, left: link.left, right: link.right });
      frontier.push(link.corner, next);
    }
  }

  const flow = new Map<Corner, number>();
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const corner = order[index]!;
    const total = (flow.get(corner) ?? 0) + corner.rain;
    flow.set(corner, total);
    const next = receiver.get(corner);
    if (next) flow.set(next.corner, (flow.get(next.corner) ?? 0) + total);
  }

  const channels = [...receiver.entries()]
    .map(([corner, next]) => ({ ...next, from: corner, flow: flow.get(corner)! }))
    .filter(({ flow: amount }) => amount >= MINIMUM_RIVER_FLOW)
    .sort((left, right) => right.flow - left.flow
      || String(left.left.id).localeCompare(String(right.left.id))
      || String(left.right.id).localeCompare(String(right.right.id)));
  if (channels.length === 0) return;
  // Downstream flow is never smaller than upstream, so any flow cut-off keeps whole rivers.
  const budget = Math.max(8, Math.round((options.width + options.height) * 1.4));
  const cutoff = channels[Math.min(budget, channels.length) - 1]!.flow;
  const majorCutoff = Math.max(cutoff * 2, channels[0]!.flow * 0.65);
  const drawn = channels.filter(({ flow: amount }) => amount >= cutoff);
  // A river must run a few Hexsides: drop stubs where two small streams meet right at the coast or border.
  const carrying = new Set(drawn.map(({ from }) => from));
  const kept = new Set<Corner>();
  for (const head of drawn) {
    if (drawn.some(({ corner }) => corner === head.from)) continue;
    const path: Corner[] = [];
    for (let at: Corner | undefined = head.from; at && carrying.has(at); at = receiver.get(at)?.corner) path.push(at);
    if (path.length >= MINIMUM_RIVER_LENGTH) path.forEach((corner) => kept.add(corner));
  }
  for (const channel of drawn) {
    if (!kept.has(channel.from)) continue;
    addHexsideFeature(hexsides, channel.left.id, channel.right.id, channel.flow >= majorCutoff ? MAJOR_RIVER : RIVER);
  }
};
