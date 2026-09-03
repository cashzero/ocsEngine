import { parseHexsideId, type HexsideId } from '../domain/map/index.js';
import type { GeneratedMap, GeneratedTerrainKind } from '../generation/index.js';
import { layoutMapDefinition, type HexMapLayout } from './presenter.js';

export interface GeneratedMapPreviewEdge {
  readonly id: HexsideId;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: 'RIVER' | 'MAJOR_RIVER' | 'ROAD' | 'PRIMARY_ROAD';
}

export interface GeneratedMapPreviewCell {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly points: string;
  readonly terrain: GeneratedTerrainKind;
  readonly settlement: 'CITY' | 'TOWN' | 'VILLAGE' | null;
  readonly strategic: 'FIRST' | 'SECOND' | null;
}

export interface GeneratedMapPreview {
  readonly layout: HexMapLayout;
  readonly cells: readonly GeneratedMapPreviewCell[];
  readonly edges: readonly GeneratedMapPreviewEdge[];
}

const terrain = (value: string): GeneratedTerrainKind => {
  const kind = value.split(':').at(-1)?.toUpperCase();
  return kind === 'WOODS' || kind === 'ROUGH' || kind === 'MOUNTAIN'
    || kind === 'MARSH' || kind === 'WATER' ? kind : 'CLEAR';
};

const edgeKind = (definitions: readonly string[]): GeneratedMapPreviewEdge['kind'] | null => {
  if (definitions.includes('edge:primary-road')) return 'PRIMARY_ROAD';
  if (definitions.includes('edge:road')) return 'ROAD';
  if (definitions.includes('edge:major-river')) return 'MAJOR_RIVER';
  if (definitions.includes('edge:river')) return 'RIVER';
  return null;
};

export const buildGeneratedMapPreview = (generated: GeneratedMap, hexSize = 36): GeneratedMapPreview => {
  const layout = layoutMapDefinition(generated.mapDefinition, hexSize);
  const positions = new Map(layout.cells.map((cell) => [cell.id, cell]));
  const cells = layout.cells.map((cell) => {
    const definition = generated.mapDefinition.hexes.find(({ id }) => id === cell.id)!;
    const settlementId = definition.features.find(({ definitionId }) => String(definitionId).startsWith('settlement:'))?.definitionId;
    const first = generated.strategicRegions.firstEntryHexIds.includes(cell.id)
      || generated.strategicRegions.firstSupplyHexIds.includes(cell.id);
    const second = generated.strategicRegions.secondEntryHexIds.includes(cell.id)
      || generated.strategicRegions.secondSupplyHexIds.includes(cell.id);
    return {
      id: cell.id, x: cell.x, y: cell.y, points: cell.points,
      terrain: terrain(definition.terrainDefinitionIds[0]!),
      settlement: settlementId ? String(settlementId).split(':').at(-1)!.toUpperCase() as 'CITY' | 'TOWN' | 'VILLAGE' : null,
      strategic: first ? 'FIRST' as const : second ? 'SECOND' as const : null,
    };
  });
  const edges = generated.mapDefinition.hexsides.flatMap((edge) => {
    const kind = edgeKind(edge.featureDefinitionIds.map(String));
    const parsed = parseHexsideId(edge.hexsideId);
    if (!kind || !parsed.ok) return [];
    const first = positions.get(parsed.value.firstHexId);
    const second = positions.get(parsed.value.secondHexId);
    return first && second ? [{
      id: edge.hexsideId, x1: first.x, y1: first.y, x2: second.x, y2: second.y, kind,
    }] : [];
  });
  return { layout, cells, edges };
};
