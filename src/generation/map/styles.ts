import type { GeneratedTerrainKind, MapGenerationStyle, MapSeaPlacement } from './model.js';

/** Terrain kinds whose distance from a road is bounded; marsh and mountain may stay roadless. */
export type RoadServedTerrain = 'CLEAR' | 'WOODS' | 'ROUGH';

/**
 * Everything that differs between map themes. The western profile holds the Beyond the Rhine
 * calibration (docs/generator/map-styles.md); the eastern one the Case Blue / GBII
 * calibration (docs/generator/map-styles.md).
 */
export interface MapStyleProfile {
  /** The sea a map of this style gets when the options name none. */
  readonly sea: MapSeaPlacement;
  readonly terrain: 'WESTERN' | 'EASTERN';
  /** Share of land Hexes beside a river that become riverbank woods (the eastern wooded river valleys). */
  readonly riverbankWoods: number;
  /** Default settlements per land Hex. */
  readonly settlementDensity: number;
  readonly landHexesPerMajorCity: number;
  /** Share of the non-city settlements that are Minor Cities rather than villages. */
  readonly townShare: number;
  readonly roads: {
    readonly mainLinkRange: number;
    readonly mainDetourLimit: number;
    readonly trackLinkRange: number;
    readonly trackDetourLimit: number;
    readonly borderExitSpacing: number;
    readonly borderHexesPerExit: number;
  };
  /** Largest distance, in Hexes, from any road for each served terrain; validation and the coverage pass share it. */
  readonly roadGapLimit: Readonly<Record<RoadServedTerrain, number>>;
  /** Road Hexsides per land Hex below which the generator warns of slow movement. */
  readonly lowRoadDensity: number;
  readonly rails: {
    /** Share of Minor Cities, best first, that get a line of their own. */
    readonly townRailShare: number;
    readonly loopRange: number;
    readonly loopDetourLimit: number;
    /**
     * Map rows per entry Hex that is also a railroad Hex. A side's other entries are road-only (still
     * Supply Sources, 12.6a), so rail lines leave the map edge a realistic distance apart.
     */
    readonly rowsPerRailEntry: number;
  };
}

const WESTERN: MapStyleProfile = {
  sea: 'NONE',
  terrain: 'WESTERN',
  riverbankWoods: 0,
  settlementDensity: 0.1,
  landHexesPerMajorCity: 450,
  townShare: 0.42,
  roads: {
    mainLinkRange: 10, mainDetourLimit: 1.4, trackLinkRange: 5, trackDetourLimit: 1.7,
    borderExitSpacing: 5, borderHexesPerExit: 6,
  },
  roadGapLimit: { CLEAR: 2, WOODS: 3, ROUGH: 3 },
  lowRoadDensity: 0.35,
  rails: { townRailShare: 0.4, loopRange: 8, loopDetourLimit: 2.5, rowsPerRailEntry: 10 },
};

/**
 * Case Blue (5-mile Hexes) measured on the Don bend sheet: about one place per 25 land Hexes, nearly
 * all villages; about one road Hexside per five land Hexes, most of it track; open steppe up to four
 * Hexes from a road; railways a few trunk lines with stations at the larger towns. The generator keeps
 * its BtR Hex scale, so these are the BtR values thinned toward that picture, not a 5-mile rescale.
 */
const EASTERN: MapStyleProfile = {
  sea: 'NONE',
  terrain: 'EASTERN',
  riverbankWoods: 0.35,
  settlementDensity: 0.05,
  landHexesPerMajorCity: 900,
  townShare: 0.3,
  roads: {
    mainLinkRange: 6, mainDetourLimit: 2, trackLinkRange: 4, trackDetourLimit: 2.5,
    borderExitSpacing: 8, borderHexesPerExit: 12,
  },
  roadGapLimit: { CLEAR: 4, WOODS: 5, ROUGH: 5 },
  lowRoadDensity: 0.15,
  rails: { townRailShare: 0.1, loopRange: 0, loopDetourLimit: 0, rowsPerRailEntry: 14 },
};

export const MAP_STYLE_PROFILES: Readonly<Record<MapGenerationStyle, MapStyleProfile>> = {
  WESTERN_EUROPE: WESTERN,
  EASTERN_EUROPE: EASTERN,
};

export const roadGapLimitFor = (
  style: MapGenerationStyle,
  terrain: GeneratedTerrainKind,
): number | undefined => (terrain === 'CLEAR' || terrain === 'WOODS' || terrain === 'ROUGH'
  ? MAP_STYLE_PROFILES[style].roadGapLimit[terrain] : undefined);
