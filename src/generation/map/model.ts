import type { HexId, ValidationIssue } from '../../core/index.js';
import type { MapDefinition } from '../../domain/map/index.js';

export const MAP_GENERATOR_VERSION = '0.5.0' as const;

/**
 * Map themes. WESTERN_EUROPE is calibrated on Beyond the Rhine (north-west Europe);
 * EASTERN_EUROPE on Case Blue / Guderian's Blitzkrieg II (southern and central Russia): flatter,
 * emptier country with far fewer roads, railways and towns (docs/generator/map-styles.md).
 */
export const MAP_GENERATION_STYLES = ['WESTERN_EUROPE', 'EASTERN_EUROPE'] as const;
export type MapGenerationStyle = (typeof MAP_GENERATION_STYLES)[number];

/**
 * Where the sea lies, by map edge: none; along the north edge, a flank both sides advance beside;
 * or behind the west (first, Allied) or east (second, Axis) entry edge.
 */
export const MAP_SEA_PLACEMENTS = ['NONE', 'NORTH', 'WEST', 'EAST'] as const;
export type MapSeaPlacement = (typeof MAP_SEA_PLACEMENTS)[number];

/** Entry edges: west for the first (Allied) side, east for the second (Axis). */
export const MAP_LANDING_EDGES = ['WEST', 'EAST'] as const;
export type MapLandingEdge = (typeof MAP_LANDING_EDGES)[number];
/** How far in from its edge, as a share of the map width, a landing port lies. */
export const LANDING_PORT_DEPTH_SHARE = 0.2;
/** Columns from `edge` to the landing port farthest in that still counts as near the edge. */
export const landingPortDepth = (width: number): number => Math.max(3, Math.round(width * LANDING_PORT_DEPTH_SHARE));

export interface MapGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly style: MapGenerationStyle;
  /** Defaults to the style's own sea: NONE. */
  readonly sea?: MapSeaPlacement;
  /**
   * Entry edges of sides that reach the map only by sea (no inland entry Hexes): each gets a port within
   * `landingPortDepth` columns of it. Needs a sea; absent means none.
   */
  readonly landingEdges?: readonly MapLandingEdge[];
  /** Settlements per land Hex; defaults to the style's own density. */
  readonly settlementDensity?: number;
}
export interface NormalizedMapGenerationOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly style: MapGenerationStyle;
  readonly sea: MapSeaPlacement;
  readonly landingEdges: readonly MapLandingEdge[];
  readonly settlementDensity: number;
}

export type GeneratedTerrainKind = 'CLEAR' | 'WOODS' | 'ROUGH' | 'MOUNTAIN' | 'MARSH' | 'WATER';

export interface GeneratedMapStrategicRegions {
  readonly firstEntryHexIds: readonly HexId[];
  readonly secondEntryHexIds: readonly HexId[];
  readonly firstSupplyHexIds: readonly HexId[];
  readonly secondSupplyHexIds: readonly HexId[];
  readonly settlementHexIds: readonly HexId[];
  /** Ports (19.0), each in a coastal place; none on a map without a sea. */
  readonly portHexIds: readonly HexId[];
  /** Each port's printed capacity (19.0a) in Tokens, in `portHexIds` order. */
  readonly ports: readonly GeneratedPort[];
}

export interface GeneratedPort {
  readonly hexId: HexId;
  readonly capacityTokens: number;
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
  readonly ports: number;
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
