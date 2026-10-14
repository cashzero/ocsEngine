import { parseHexsideId, type HexsideId } from '../domain/map/index.js';
import type { GeneratedMap, GeneratedTerrainKind } from '../generation/index.js';
import { layoutMapDefinition, type HexMapLayout } from './presenter.js';

export interface GeneratedMapPreviewEdge {
  readonly id: HexsideId;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly kind: 'RIVER' | 'MAJOR_RIVER' | 'ROAD' | 'PRIMARY_ROAD' | 'RAIL' | 'MULTI_RAIL';
}

export interface GeneratedMapPreviewCell {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly points: string;
  readonly terrain: GeneratedTerrainKind;
  readonly settlement: 'CITY' | 'TOWN' | 'VILLAGE' | null;
  /** Core Hex of a Major City cluster: the only Hex of the cluster that carries the place name (map art only). */
  readonly urbanCore?: boolean;
  readonly strategic: 'FIRST' | 'SECOND' | null;
  /** Whose Supply Source (12.6a) this hex is, so the map can mark it; null for an ordinary hex. */
  readonly supplySource: 'FIRST' | 'SECOND' | null;
  /** Explicit Air Entry Point for aircraft based off the map. */
  readonly airEntry?: 'FIRST' | 'SECOND' | null;
  /** A port (19.0) is printed here. */
  readonly port: boolean;
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

/** A hexside may carry a watercourse, a road and a railroad (bridges); each is drawn on its own layer. */
const edgeKinds = (definitions: readonly string[]): GeneratedMapPreviewEdge['kind'][] => {
  const road = definitions.includes('edge:primary-road') ? 'PRIMARY_ROAD' as const
    : definitions.includes('edge:road') ? 'ROAD' as const : null;
  const river = definitions.includes('edge:major-river') ? 'MAJOR_RIVER' as const
    : definitions.includes('edge:river') ? 'RIVER' as const : null;
  const rail = definitions.includes('edge:multi-track-rail') ? 'MULTI_RAIL' as const
    : definitions.includes('edge:rail') ? 'RAIL' as const : null;
  return [river, road, rail].filter((kind) => kind !== null);
};

/**
 * `inland` says which sides' entry edges the game declares: a side without inland entry Hexes (it lands by sea) keeps
 * its edge Hexes in the generated map but gets no entry band or Supply Source mark there.
 */
export const buildGeneratedMapPreview = (
  generated: GeneratedMap,
  hexSize = 36,
  inland: { readonly FIRST: boolean; readonly SECOND: boolean } = { FIRST: true, SECOND: true },
): GeneratedMapPreview => {
  const layout = layoutMapDefinition(generated.mapDefinition, hexSize);
  const positions = new Map(layout.cells.map((cell) => [cell.id, cell]));
  const cityIds = layout.cells.filter(({ id }) => generated.mapDefinition.hexes.find((hex) => String(hex.id) === id)
    ?.features.some(({ definitionId }) => String(definitionId) === 'settlement:city'));
  const near = (left: { x: number; y: number }, right: { x: number; y: number }): boolean => Math.hypot(left.x - right.x, left.y - right.y) < hexSize * 1.9;
  const cityNeighbors = (cell: { id: string; x: number; y: number }): number => cityIds.filter((other) => other.id !== cell.id && near(other, cell)).length;
  // The core touches every suburb: most city neighbours wins, the smaller ID breaks a tie.
  const cores = new Set(cityIds.filter((cell) => !cityIds.some((other) => other.id !== cell.id && near(other, cell)
    && (cityNeighbors(other) > cityNeighbors(cell) || cityNeighbors(other) === cityNeighbors(cell) && other.id < cell.id))).map(({ id }) => id));
  const cells = layout.cells.map((cell) => {
    const definition = generated.mapDefinition.hexes.find(({ id }) => id === cell.id)!;
    const settlementId = definition.features.find(({ definitionId }) => String(definitionId).startsWith('settlement:'))?.definitionId;
    const first = inland.FIRST && (generated.strategicRegions.firstEntryHexIds.includes(cell.id)
      || generated.strategicRegions.firstSupplyHexIds.includes(cell.id));
    const second = inland.SECOND && (generated.strategicRegions.secondEntryHexIds.includes(cell.id)
      || generated.strategicRegions.secondSupplyHexIds.includes(cell.id));
    return {
      id: cell.id, x: cell.x, y: cell.y, points: cell.points,
      terrain: terrain(definition.terrainDefinitionIds[0]!),
      settlement: settlementId ? String(settlementId).split(':').at(-1)!.toUpperCase() as 'CITY' | 'TOWN' | 'VILLAGE' : null,
      urbanCore: cores.has(cell.id),
      strategic: first ? 'FIRST' as const : second ? 'SECOND' as const : null,
      supplySource: inland.FIRST && generated.strategicRegions.firstSupplyHexIds.includes(cell.id) ? 'FIRST' as const
        : inland.SECOND && generated.strategicRegions.secondSupplyHexIds.includes(cell.id) ? 'SECOND' as const : null,
      airEntry: definition.features.some(({ definitionId }) => definitionId === 'air-entry:first') ? 'FIRST' as const
        : definition.features.some(({ definitionId }) => definitionId === 'air-entry:second') ? 'SECOND' as const : null,
      port: definition.features.some(({ kind, definitionId }) => kind === 'FACILITY' && String(definitionId) === 'facility:port'),
    };
  });
  const edges = generated.mapDefinition.hexsides.flatMap((edge) => {
    const kinds = edgeKinds(edge.featureDefinitionIds.map(String));
    const parsed = parseHexsideId(edge.hexsideId);
    if (kinds.length === 0 || !parsed.ok) return [];
    const first = positions.get(parsed.value.firstHexId);
    const second = positions.get(parsed.value.secondHexId);
    return first && second ? kinds.map((kind) => ({
      id: edge.hexsideId, x1: first.x, y1: first.y, x2: second.x, y2: second.y, kind,
    })) : [];
  });
  return { layout, cells, edges };
};
