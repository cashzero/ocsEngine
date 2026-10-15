import type { HexId, ValidationIssue } from '../core/index.js';
import type { PieceRuntimeState } from '../domain/piece/index.js';
import type { MapState } from '../domain/map/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameSession, GameplayEngine, SeatBinding } from '../gameplay/index.js';
import type {
  GeneratedMap,
  MapGenerationStyle,
  MapLandingEdge,
  MapSeaPlacement,
} from '../generation/map/index.js';
import type { AirForceLevel, GeneratedOob, OobScale, OobSide } from '../generation/oob/index.js';
import type { RuleConfiguration } from '../rules/index.js';

export const GAME_FLOW_VERSION = '0.1.0' as const;
export const NEW_GAME_TEMPLATE_IDS = ['GROUND_DUEL'] as const;
export type NewGameTemplateId = (typeof NEW_GAME_TEMPLATE_IDS)[number];

/**
 * The situation the forces start in: a meeting engagement (both sides advance on a front between them, each holding
 * the same VP) or one side attacking the other’s objectives, with its own ports also carrying VP (docs/roadmap/13-engagement-scenarios-wbs.md).
 */
export const ENGAGEMENTS = ['MEETING', 'ALLIED_ATTACKS', 'AXIS_ATTACKS'] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

/** The attacking side of an engagement, or null for a meeting engagement. */
export const attackerOf = (engagement: Engagement): OobSide | null =>
  engagement === 'ALLIED_ATTACKS' ? 'ALLIED' : engagement === 'AXIS_ATTACKS' ? 'AXIS' : null;

/**
 * Whether the operation has a sea: none, or along the flank (the north edge, the front running west-east along the
 * coast). Who may use it is set per side: Sea Cap (`seaCap`) and whether the side has inland entry Hexes (`inlandEntry`).
 */
export const NEW_GAME_SEAS = ['NONE', 'FLANK'] as const;
export type NewGameSea = (typeof NEW_GAME_SEAS)[number];

/** The sea a style brings when the request names none: the Mediterranean coast has one along the flank. */
export const styleSeaOf = (style: MapGenerationStyle): NewGameSea => (style === 'MEDITERRANEAN_COAST' ? 'FLANK' : 'NONE');

/** The request's sea, with the style's own sea standing in when the request names none. */
export const newGameSeaOf = (request: NewGameRequest): NewGameSea => request.map.sea ?? styleSeaOf(request.map.style);

/** The map edge the sea lies on. */
export const mapSeaPlacementOf = (request: NewGameRequest): MapSeaPlacement => (newGameSeaOf(request) === 'FLANK' ? 'NORTH' : 'NONE');

/** Whether each side has inland entry Hexes on its map edge; absent means both do. */
export const inlandEntryOf = (request: NewGameRequest): { readonly allied: boolean; readonly axis: boolean } =>
  request.inlandEntry ?? { allied: true, axis: true };

/**
 * Sides without inland entry Hexes: their reinforcements, SP and Repls reach the map only by ship, through ports, so
 * Sea Cap and port capacity limit them, and their ports are their only Supply Sources. Allied first. Empty without a sea.
 */
export const seaArrivalSidesOf = (request: NewGameRequest): readonly OobSide[] => {
  if (newGameSeaOf(request) === 'NONE') return [];
  const entry = inlandEntryOf(request);
  return [...entry.allied ? [] : ['ALLIED' as const], ...entry.axis ? [] : ['AXIS' as const]];
};

/** The map edges of the sides landing from the sea: Allied enters from the west edge, Axis from the east. */
export const landingEdgesOf = (request: NewGameRequest): readonly MapLandingEdge[] =>
  seaArrivalSidesOf(request).map((side) => (side === 'ALLIED' ? 'WEST' : 'EAST'));

/** Every random stream is explicit so changing one subsystem cannot perturb another. */
export interface NewGameRequest {
  readonly templateId: NewGameTemplateId;
  /** Absent means MEETING, so requests and saves made before engagements existed keep their meaning. */
  readonly engagement?: Engagement;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly style: MapGenerationStyle;
    /** Absent means the style's own sea (`styleSeaOf`): along the flank for the Mediterranean coast, none otherwise. */
    readonly sea?: NewGameSea;
  };
  readonly oob: {
    readonly scale: OobScale;
    /** Every division per side; `armoredDivisionsPerSide` of them are armored, the rest foot (infantry, airborne). */
    readonly divisionsPerSide: number;
    readonly armoredDivisionsPerSide: number;
    /** Aircraft and Air Bases (14.0-15.0). Absent means NONE: a ground duel. */
    readonly air?: AirForceLevel;
    /** Transport aircraft and a paratroop battalion per side (14.9, 14.10). Needs `air`; absent means NONE. */
    readonly airTransport?: AirForceLevel;
  };
  readonly seeds: {
    readonly map: number;
    readonly oob: number;
    readonly deployment: number;
    readonly rules: number;
  };
  readonly turnLimit: number;
  /** Month of the first Game Turn (September through April), which selects the Weather Table rows (17.0). */
  readonly startMonth: number;
  /**
   * Rail Cap points each side gets in its Movement Phase (13.3b). Absent means the engagement's default
   * (`defaultRailCap`), so requests made before Rail Cap existed get the default.
   */
  readonly railCap?: { readonly allied: number; readonly axis: number };
  /**
   * Sea Cap points each side gets in its Movement Phase (19.0f). 0 means no Sea Cap: the side neither ships nor draws
   * supply from ports. A side without inland entry needs at least 1. Absent means `defaultSeaCap`; ignored without a sea.
   */
  readonly seaCap?: { readonly allied: number; readonly axis: number };
  /**
   * Whether each side has inland entry Hexes (map-edge entries and Supply Sources). A side without them lands everything
   * by sea at ports (19.0f), and the map gets a port near its edge. Needs a sea; absent means both sides have them.
   */
  readonly inlandEntry?: { readonly allied: boolean; readonly axis: boolean };
  /**
   * Share of each side's divisions (whole percent, rounded to whole divisions) that start in the reinforcement Box
   * instead of on the map, arriving one division per Game Turn from `firstTurn`. The last division must have at least
   * two Game Turns to play, including its arrival turn. `reinforcementDivisionsOf` leaves at least one division deployed.
   * Absent means none: every division starts deployed.
   */
  readonly reinforcements?: { readonly allied: number; readonly axis: number; readonly firstTurn: number };
}

export interface GeneratedDeployment {
  readonly initialMapState: MapState;
  readonly initialPieceState: PieceRuntimeState;
  /** Objective Hexes in Major Cities (3 VP) and towns (1 VP); each side starts holding the ones in its zone. */
  readonly objectives: readonly { readonly hexId: HexId; readonly points: number }[];
  readonly objectiveHexIds: readonly HexId[];
  /** The attacking side, which also moves first on Game Turn 1; null in a meeting engagement. */
  readonly attacker: OobSide | null;
  readonly metrics: {
    readonly pieces: number;
    readonly occupiedHexes: number;
    readonly alliedPieces: number;
    readonly axisPieces: number;
    readonly maximumStackReTicks: number;
    /** Land Hexes in each side's deployment zone: equal halves in a meeting engagement, most of the map for a defender. */
    readonly zoneHexes?: { readonly allied: number; readonly axis: number };
  };
  readonly warnings: readonly string[];
}

export interface GeneratedGameSummary {
  readonly mapSize: string;
  readonly mapStyle: MapGenerationStyle;
  readonly engagement: Engagement;
  readonly unitCount: number;
  readonly formationCount: number;
  readonly objectiveCount: number;
  readonly turnLimit: number;
}

export interface GeneratedScenarioPackage {
  readonly request: NewGameRequest;
  readonly generatedMap: GeneratedMap;
  readonly generatedOob: GeneratedOob;
  readonly deployment: GeneratedDeployment;
  readonly scenario: ScenarioDefinition;
  readonly configuration: RuleConfiguration;
  readonly bindings: readonly SeatBinding[];
  readonly summary: GeneratedGameSummary;
  readonly warnings: readonly string[];
}

export type GameFlowStage =
  | 'OPTIONS'
  | 'MAP'
  | 'OOB'
  | 'DEPLOYMENT'
  | 'SCENARIO'
  | 'GAMEPLAY_BOOTSTRAP';

export interface GameFlowFailure {
  readonly stage: GameFlowStage;
  readonly code: string;
  readonly message: string;
  readonly path: readonly (string | number)[];
  readonly issues?: readonly ValidationIssue[];
}

export interface CreatedNewGame extends GeneratedScenarioPackage {
  readonly session: GameSession;
}

/** The generation steps of a New Game package, in the order they run. */
export type NewGamePreparationStage = 'MAP' | 'OOB' | 'DEPLOYMENT' | 'SCENARIO';

export type PreparedNewGame = { readonly ok: true; readonly value: GeneratedScenarioPackage }
  | { readonly ok: false; readonly error: readonly GameFlowFailure[] };

export interface NewGameOrchestrator {
  readonly prepare: (request: NewGameRequest) => PreparedNewGame;
  /**
   * The same package as `prepare`, built one step at a time: `beforeStage` is awaited before each step, so a UI can
   * show the step and repaint. Returning `false` from it stops the build (the result is then `null`).
   */
  readonly prepareInStages: (
    request: NewGameRequest,
    beforeStage: (stage: NewGamePreparationStage) => Promise<boolean | void> | boolean | void,
  ) => Promise<PreparedNewGame | null>;
  readonly create: (
    request: NewGameRequest,
  ) => Promise<{ readonly ok: true; readonly value: CreatedNewGame }
    | { readonly ok: false; readonly error: readonly GameFlowFailure[] }>;
  /** Open a session on a package `prepare` already built, without building it again (what `create` does after preparing). */
  readonly start: (
    prepared: GeneratedScenarioPackage,
  ) => Promise<{ readonly ok: true; readonly value: CreatedNewGame }
    | { readonly ok: false; readonly error: readonly GameFlowFailure[] }>;
}

export interface SeedOrthogonalityCase {
  readonly name: 'MAP_SEED' | 'OOB_SEED' | 'DEPLOYMENT_SEED';
  readonly passed: boolean;
  readonly changed: readonly string[];
  readonly preserved: readonly string[];
}

export interface GameFlowSeedSweepReport {
  readonly passed: boolean;
  readonly cases: readonly SeedOrthogonalityCase[];
}

export type GameFlowEngine = GameplayEngine;
