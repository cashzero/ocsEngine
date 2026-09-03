import type { HexId, ValidationIssue } from '../../core/index.js';
import type { MapDefinition } from '../../domain/map/index.js';

export const MAP_GENERATOR_VERSION = '0.1.0' as const;

export type MapGenerationStyle = 'TEMPERATE_INLAND' | 'MEDITERRANEAN_COAST';

export interface MapGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly style: MapGenerationStyle;
  readonly settlementDensity?: number;
}
export interface NormalizedMapGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly style: MapGenerationStyle;
  readonly settlementDensity: number;
}

export type GeneratedTerrainKind = 'CLEAR' | 'WOODS' | 'ROUGH' | 'MOUNTAIN' | 'MARSH' | 'WATER';

export interface GeneratedMapStrategicRegions {
  readonly firstEntryHexIds: readonly HexId[];
  readonly secondEntryHexIds: readonly HexId[];
  readonly firstSupplyHexIds: readonly HexId[];
  readonly secondSupplyHexIds: readonly HexId[];
  readonly settlementHexIds: readonly HexId[];
}

export interface GeneratedMapMetrics {
  readonly terrainCounts: Readonly<Record<GeneratedTerrainKind, number>>;
  readonly landHexes: number;
  readonly roadEdges: number;
  readonly primaryRoadEdges: number;
  readonly riverEdges: number;
  readonly majorRiverEdges: number;
  readonly settlements: number;
  readonly connectedRoadComponents: number;
}

export interface GeneratedMap {
  readonly schemaVersion: 1;
  readonly generatorVersion: typeof MAP_GENERATOR_VERSION;
  readonly options: NormalizedMapGenerationOptions;
  readonly mapDefinition: MapDefinition;
  readonly strategicRegions: GeneratedMapStrategicRegions;
  readonly metrics: GeneratedMapMetrics;
  readonly warnings: readonly string[];
}

export interface MapGenerationError {
  readonly code: 'INVALID_OPTIONS' | 'GENERATION_INVALID';
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly issues?: readonly ValidationIssue[];
}

export interface GeneratedMapValidation {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly metrics: GeneratedMapMetrics;
}

export interface MapSeedSweepReport {
  readonly requested: number;
  readonly generated: number;
  readonly invalid: number;
  readonly exceptions: number;
  readonly minimumLandRatio: number;
  readonly maximumSevereTerrainRatio: number;
  readonly minimumRoadEdges: number;
  readonly maximumRoadEdges: number;
  readonly failures: readonly { readonly seed: number; readonly codes: readonly string[] }[];
}
