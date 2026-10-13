import type { DefinitionId, HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { columnOf, definitionId, distanceBetween, neighborCells, type GeneratedCell } from './internal.js';
import type { GeneratedMapStrategicRegions, MapGenerationStyle, NormalizedMapGenerationOptions } from './model.js';
import { PORT, selectPorts } from './ports.js';
import { generateRailNetwork } from './rails.js';
import { generateRoadNetwork } from './roads.js';
import { CITY, selectSettlements, TOWN, VILLAGE } from './settlements.js';
import { MAP_STYLE_PROFILES } from './styles.js';

const FIRST_ENTRY = definitionId('entry:first');
const SECOND_ENTRY = definitionId('entry:second');
const FIRST_SOURCE = definitionId('source:first');
const SECOND_SOURCE = definitionId('source:second');
const RANK_FEATURE = { CITY, TOWN, VILLAGE } as const;

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

/** Map rows per reinforcement entry Hex along a side's map edge. */
export const MAP_ROWS_PER_ENTRY = 6;
/** Entry Hexes per side: at least two, at most eight. */
export const entryCountFor = (height: number): number => Math.max(2, Math.min(8, Math.round(height / MAP_ROWS_PER_ENTRY)));
/**
 * Entry Hexes per side that are also railroad Hexes: one per the style's `rowsPerRailEntry` map rows,
 * at least the primary. They lead the side's entry list (railEntriesFirst).
 */
export const railEntryCountFor = (style: MapGenerationStyle, height: number): number =>
  Math.min(entryCountFor(height), Math.max(1, Math.round(height / MAP_STYLE_PROFILES[style].rails.rowsPerRailEntry)));
/** Columns in from a side's outermost land Hex that still count as that side's map edge. */
const ENTRY_EDGE_DEPTH = 1;
/** Preferred minimum Hex distance between two entry Hexes of one side; relaxes only on a short edge. */
const ENTRY_SPACING_HEXES = 3;

/**
 * Reinforcement entry Hexes for one side (13.6), each also a Supply Source: the central `primary` (the
 * side's deployment anchor) first, then further Hexes along the same map edge, spread by farthest-point
 * sampling so arrivals can come in along the whole front. Candidates are the outermost land Hex of each inner row,
 * land-connected to the primary, and not mountain or marsh.
 */
const selectEntryHexes = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  primary: GeneratedCell,
  side: 'FIRST' | 'SECOND',
  options: NormalizedMapGenerationOptions,
): readonly GeneratedCell[] => {
  const reach = new Set<HexId>([primary.id]);
  const queue = [primary];
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of neighborCells(queue[head]!, cells)) {
      if (next.terrain === 'WATER' || reach.has(next.id)) continue;
      reach.add(next.id);
      queue.push(next);
    }
  }
  const outward = (cell: GeneratedCell): number =>
    side === 'FIRST' ? columnOf(cell.coordinate) : options.width - 1 - columnOf(cell.coordinate);
  const edgeDepth = outward(primary) + ENTRY_EDGE_DEPTH;
  const outermostByRow = new Map<number, GeneratedCell>();
  for (const cell of cells.values()) {
    if (!reach.has(cell.id) || cell.terrain === 'MOUNTAIN' || cell.terrain === 'MARSH') continue;
    if (cell.coordinate.r < 1 || cell.coordinate.r > options.height - 2 || outward(cell) > edgeDepth) continue;
    const held = outermostByRow.get(cell.coordinate.r);
    if (!held || outward(cell) < outward(held)) outermostByRow.set(cell.coordinate.r, cell);
  }
  const candidates = [...outermostByRow.values()].filter(({ id }) => id !== primary.id)
    .sort((left, right) => left.coordinate.r - right.coordinate.r);
  const count = entryCountFor(options.height);
  for (const spacing of [ENTRY_SPACING_HEXES, 2]) {
    const chosen = [primary];
    while (chosen.length < count) {
      let best: { cell: GeneratedCell; distance: number } | null = null;
      for (const cell of candidates) {
        if (chosen.includes(cell)) continue;
        const distance = Math.min(...chosen.map((other) => distanceBetween(other.id, cell.id)));
        if (distance >= spacing && (!best || distance > best.distance)) best = { cell, distance };
      }
      if (!best) break;
      chosen.push(best.cell);
    }
    if (chosen.length === count || spacing === 2) return chosen;
  }
  return [primary];
};

/**
 * A side's entries reordered so its `count` rail entries come first, the primary leading: one entry
 * nearest each of `count` evenly spaced rows, the band holding the primary keeping the primary. Even
 * spacing keeps rail off the corner entries, whose lines would otherwise run along the top or bottom edge.
 */
const railEntriesFirst = (entries: readonly GeneratedCell[], count: number, height: number): readonly GeneratedCell[] => {
  const [primary, ...others] = entries;
  if (!primary) return entries;
  const targets = Array.from({ length: count }, (_, index) => (index + 0.5) * height / count);
  const primaryTarget = targets.reduce((best, row) => (Math.abs(row - primary.coordinate.r) < Math.abs(best - primary.coordinate.r) ? row : best));
  const rail: GeneratedCell[] = [primary];
  for (const target of targets.filter((row) => row !== primaryTarget)) {
    const pick = others.filter((cell) => !rail.includes(cell))
      .sort((left, right) => Math.abs(left.coordinate.r - target) - Math.abs(right.coordinate.r - target) || left.coordinate.r - right.coordinate.r)[0];
    if (pick) rail.push(pick);
  }
  return [...rail, ...others.filter((cell) => !rail.includes(cell))];
};

export const generateStrategicNetwork = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): GeneratedMapStrategicRegions => {
  const chosenSettlements = selectSettlements(cells, hexsides, options);
  const { ports, addedTowns } = selectPorts(cells, chosenSettlements, options);
  const settlements = [...chosenSettlements, ...addedTowns];
  settlements.forEach(({ cell, rank }) => cell.features.push({ kind: 'PRINTED_FEATURE', definitionId: RANK_FEATURE[rank] }));
  const firstEntry = selectEdgeHex(cells, 'FIRST', options.height);
  const secondEntry = selectEdgeHex(cells, 'SECOND', options.height);
  ports.forEach(({ cell }) => cell.features.push({ kind: 'FACILITY', definitionId: PORT }));
  firstEntry.features.push({ kind: 'ENTRY', definitionId: FIRST_ENTRY }, { kind: 'SOURCE', definitionId: FIRST_SOURCE });
  secondEntry.features.push({ kind: 'ENTRY', definitionId: SECOND_ENTRY }, { kind: 'SOURCE', definitionId: SECOND_SOURCE });
  // Dedicated Air Entry Points: ground reinforcement entries never substitute for these.
  firstEntry.features.push({ kind: 'PRINTED_FEATURE', definitionId: definitionId('air-entry:first') });
  secondEntry.features.push({ kind: 'PRINTED_FEATURE', definitionId: definitionId('air-entry:second') });
  const railEntries = railEntryCountFor(options.style, options.height);
  const firstEntries = railEntriesFirst(selectEntryHexes(cells, firstEntry, 'FIRST', options), railEntries, options.height);
  const secondEntries = railEntriesFirst(selectEntryHexes(cells, secondEntry, 'SECOND', options), railEntries, options.height);
  // Each entry Hex is also a Supply Source (12.6a), so a reinforcement arriving there starts in trace supply.
  firstEntries.slice(1).forEach((cell) => cell.features.push({ kind: 'ENTRY', definitionId: FIRST_ENTRY }, { kind: 'SOURCE', definitionId: FIRST_SOURCE }));
  secondEntries.slice(1).forEach((cell) => cell.features.push({ kind: 'ENTRY', definitionId: SECOND_ENTRY }, { kind: 'SOURCE', definitionId: SECOND_SOURCE }));
  // Every entry Hex is a main-road centre, so reinforcements arrive on a road.
  generateRoadNetwork(cells, hexsides, options, settlements, [...firstEntries, ...secondEntries].map(({ id }) => id));
  // A side's leading entries, the primary first, are also map-edge railroad Hexes; the rest are road-only.
  generateRailNetwork(cells, hexsides, settlements, [firstEntry.id, secondEntry.id],
    [...firstEntries.slice(0, railEntries), ...secondEntries.slice(0, railEntries)].map(({ id }) => id),
    MAP_STYLE_PROFILES[options.style].rails, options.width);
  return {
    firstEntryHexIds: firstEntries.map(({ id }) => id), secondEntryHexIds: secondEntries.map(({ id }) => id),
    firstSupplyHexIds: firstEntries.map(({ id }) => id), secondSupplyHexIds: secondEntries.map(({ id }) => id),
    settlementHexIds: settlements.map(({ cell }) => cell.id),
    portHexIds: ports.map(({ cell }) => cell.id),
    ports: ports.map(({ cell, capacityTokens }) => ({ hexId: cell.id, capacityTokens })),
  };
};
