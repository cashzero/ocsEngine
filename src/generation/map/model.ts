import type { HexId, ValidationIssue } from '../../core/index.js';
import type { MapDefinition } from '../../domain/map/index.js';

export const MAP_GENERATOR_VERSION = '0.4.0' as const;

/**
 * Map themes. The two western themes are calibrated on Beyond the Rhine (north-west Europe);
 * EASTERN_EUROPE on Case Blue / Guderian's Blitzkrieg II (southern and central Russia): flatter,
 * emptier country with far fewer roads, railways and towns (docs/generator/11-eastern-europe-theme.md).
 */
export const MAP_GENERATION_STYLES = ['TEMPERATE_INLAND', 'MEDITERRANEAN_COAST', 'EASTERN_EUROPE'] as const;
export type MapGenerationStyle = (typeof MAP_GENERATION_STYLES)[number];

export interface MapGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly style: MapGenerationStyle;
  /** Settlements per land Hex; defaults to the style's own density. */
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
  /** Largest distance in Hexes from a road to any open, wooded or hill Hex. */
  readonly maximumRoadGap: number;
  /** How far the worst Hex exceeds its terrain's road-gap limit; 0 when every Hex is served. */
  readonly roadGapExcess: number;
  /** Railroad hexsides of either class (13.3). */
  readonly railEdges: number;
  readonly multiTrackRailEdges: number;
  /** Rail Hexes with a village or city: where a side can detrain and trace supply (13.3c). */
  readonly railStations: number;
  readonly connectedRailComponents: number;
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
