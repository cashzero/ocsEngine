import type { DefinitionId, HexId } from '../../core/index.js';
import type { HexsideId } from '../../domain/map/index.js';
import { columnOf, definitionId, type GeneratedCell } from './internal.js';
import type { GeneratedMapStrategicRegions, NormalizedMapGenerationOptions } from './model.js';
import { generateRoadNetwork } from './roads.js';
import { CITY, selectSettlements, TOWN, VILLAGE } from './settlements.js';

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

export const generateStrategicNetwork = (
  cells: ReadonlyMap<HexId, GeneratedCell>,
  hexsides: Map<HexsideId, Set<DefinitionId>>,
  options: NormalizedMapGenerationOptions,
): GeneratedMapStrategicRegions => {
  const settlements = selectSettlements(cells, hexsides, options);
  settlements.forEach(({ cell, rank }) => cell.features.push({ kind: 'PRINTED_FEATURE', definitionId: RANK_FEATURE[rank] }));
  const firstEntry = selectEdgeHex(cells, 'FIRST', options.height);
  const secondEntry = selectEdgeHex(cells, 'SECOND', options.height);
  firstEntry.features.push({ kind: 'ENTRY', definitionId: FIRST_ENTRY }, { kind: 'SOURCE', definitionId: FIRST_SOURCE });
  secondEntry.features.push({ kind: 'ENTRY', definitionId: SECOND_ENTRY }, { kind: 'SOURCE', definitionId: SECOND_SOURCE });
  generateRoadNetwork(cells, hexsides, options, settlements, [firstEntry.id, secondEntry.id]);
  return {
    firstEntryHexIds: [firstEntry.id], secondEntryHexIds: [secondEntry.id],
    firstSupplyHexIds: [firstEntry.id], secondSupplyHexIds: [secondEntry.id],
    settlementHexIds: settlements.map(({ cell }) => cell.id),
  };
};
