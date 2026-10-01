import {
  hexDistance,
  type DefinitionId,
  type HexId,
} from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import {
  addHexsideFeature,
  columnOf,
  definitionId,
  distanceBetween,
  MinHeap,
  neighborCells,
  type GeneratedCell,
} from './internal.js';
import { mixUint32 } from './rng.js';
import type { GeneratedMapStrategicRegions, NormalizedMapGenerationOptions } from './model.js';

const ROAD = definitionId('edge:road');
const PRIMARY_ROAD = definitionId('edge:primary-road');
const CITY = definitionId('settlement:city');
const TOWN = definitionId('settlement:town');
const VILLAGE = definitionId('settlement:village');
const FIRST_ENTRY = definitionId('entry:first');
const SECOND_ENTRY = definitionId('entry:second');
const FIRST_SOURCE = definitionId('source:first');
const SECOND_SOURCE = definitionId('source:second');

const selectEdgeHex = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  side: 'FIRST' | 'SECOND',
  height: number,
): GeneratedCell => {
  const land = [...cells.values()].filter(({ terrain }) => terrain !== 'WATER');
  return land.sort((left, right) => {
    const sideOrder = side === 'FIRST'
      ? columnOf(left.coordinate) - columnOf(right.coordinate)
      : columnOf(right.coordinate) - columnOf(left.coordinate);
    if (sideOrder !== 0) return sideOrder;
    return Math.abs(left.coordinate.r - height / 2) - Math.abs(right.coordinate.r - height / 2)
      || String(left.id).localeCompare(String(right.id));
  })[0]!;
};

const selectSettlements = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  options: NormalizedMapGenerationOptions,
): readonly GeneratedCell[] => {
  const target = Math.max(4, Math.round(options.width * options.height * options.settlementDensity));
  const candidates = [...cells.values()]
    .filter((cell) => cell.terrain !== 'WATER' && cell.terrain !== 'MOUNTAIN'
      && columnOf(cell.coordinate) > 0 && columnOf(cell.coordinate) < options.width - 1
      && cell.coordinate.r > 0 && cell.coordinate.r < options.height - 1)
    .map((cell) => ({
      cell,
      score: cell.moisture * 0.25 + (1 - cell.roughness) * 0.35
        + (1 - Math.abs(cell.elevation - 0.45)) * 0.25
        + mixUint32(options.seed ^ Math.imul(cell.coordinate.q + 1, 4099) ^ Math.imul(cell.coordinate.r + 1, 131)) / 0xffff_ffff * 0.15,
    }))
    .sort((left, right) => right.score - left.score || String(left.cell.id).localeCompare(String(right.cell.id)));
  const selected: GeneratedCell[] = [];
  for (const candidate of candidates) {
    if (selected.length >= target) break;
    if (selected.every((other) => hexDistance(other.coordinate, candidate.cell.coordinate) >= 3)) selected.push(candidate.cell);
  }
  return selected;
};

const terrainCost = (cell: GeneratedCell): number => {
  switch (cell.terrain) {
    case 'CLEAR': return 1;
    case 'WOODS': return 1.5;
    case 'ROUGH': return 2;
    case 'MARSH': return 3;
    case 'MOUNTAIN': return 4;
    case 'WATER': return Number.POSITIVE_INFINITY;
  }
};

const findPath = (
  start: HexId,
  goal: HexId,
  cells: ReadonlyMap<HexId, GeneratedCell>,
): readonly HexId[] => {
  const frontier = new MinHeap<HexId>();
  frontier.push(start, 0);
  const cost = new Map<HexId, number>([[start, 0]]);
  const previous = new Map<HexId, HexId>();
  while (frontier.size > 0) {
    const currentId = frontier.pop()!;
    if (currentId === goal) break;
    const current = cells.get(currentId)!;
    for (const next of neighborCells(current, cells)) {
      const step = terrainCost(next);
      if (!Number.isFinite(step)) continue;
      const nextCost = cost.get(currentId)! + step;
      if (nextCost >= (cost.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(next.id, nextCost);
      previous.set(next.id, currentId);
      frontier.push(next.id, nextCost + distanceBetween(next.id, goal));
    }
  }
  if (!cost.has(goal)) return [];
  const path: HexId[] = [goal];
  while (path[0] !== start) path.unshift(previous.get(path[0]!)!);
  return path;
};

export const generateStrategicNetwork = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): GeneratedMapStrategicRegions => {
  const settlements = selectSettlements(cells, options);
  settlements.forEach((cell, index) => cell.features.push({
    kind: 'PRINTED_FEATURE',
    definitionId: index === 0 ? CITY : index < Math.max(2, Math.ceil(settlements.length / 3)) ? TOWN : VILLAGE,
  }));
  const firstEntry = selectEdgeHex(cells, 'FIRST', options.height);
  const secondEntry = selectEdgeHex(cells, 'SECOND', options.height);
  firstEntry.features.push({ kind: 'ENTRY', definitionId: FIRST_ENTRY }, { kind: 'SOURCE', definitionId: FIRST_SOURCE });
  secondEntry.features.push({ kind: 'ENTRY', definitionId: SECOND_ENTRY }, { kind: 'SOURCE', definitionId: SECOND_SOURCE });

  const nodes = [...new Set<HexId>([firstEntry.id, secondEntry.id, ...settlements.map(({ id }) => id)])];
  const connected: HexId[] = [firstEntry.id];
  const remaining = new Set(nodes.slice(1));
  while (remaining.size > 0) {
    let best: { node: HexId; anchor: HexId; distance: number } | null = null;
    for (const node of remaining) for (const anchor of connected) {
      const distance = distanceBetween(node, anchor);
      if (!best || distance < best.distance || (distance === best.distance && `${node}|${anchor}` < `${best.node}|${best.anchor}`)) {
        best = { node, anchor, distance };
      }
    }
    const selected = best!;
    const path = findPath(selected.anchor, selected.node, cells);
    for (let index = 1; index < path.length; index += 1) {
      const isPrimary = selected.node === secondEntry.id || selected.anchor === firstEntry.id;
      addHexsideFeature(hexsides, path[index - 1]!, path[index]!, isPrimary ? PRIMARY_ROAD : ROAD);
    }
    connected.push(selected.node);
    remaining.delete(selected.node);
  }

  return {
    firstEntryHexIds: [firstEntry.id], secondEntryHexIds: [secondEntry.id],
    firstSupplyHexIds: [firstEntry.id], secondSupplyHexIds: [secondEntry.id],
    settlementHexIds: settlements.map(({ id }) => id),
  };
};
