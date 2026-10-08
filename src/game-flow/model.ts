import type { HexId, ValidationIssue } from '../core/index.js';
import type { PieceRuntimeState } from '../domain/piece/index.js';
import type { MapState } from '../domain/map/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameSession, GameplayEngine, SeatBinding } from '../gameplay/index.js';
import type {
  GeneratedMap,
  MapGenerationStyle,
} from '../generation/map/index.js';
import type { AirForceLevel, GeneratedOob, OobScale, OobSide } from '../generation/oob/index.js';
import type { RuleConfiguration } from '../rules/index.js';

export const GAME_FLOW_VERSION = '0.1.0' as const;
export const NEW_GAME_TEMPLATE_IDS = ['GROUND_DUEL'] as const;
export type NewGameTemplateId = (typeof NEW_GAME_TEMPLATE_IDS)[number];

/**
 * The situation the forces start in: a meeting engagement (both sides advance on a front between them, each holding
 * the same VP) or one side attacking objectives the other holds (docs/roadmap/13-engagement-scenarios-wbs.md).
 */
export const ENGAGEMENTS = ['MEETING', 'ALLIED_ATTACKS', 'AXIS_ATTACKS'] as const;
export type Engagement = (typeof ENGAGEMENTS)[number];

/** The attacking side of an engagement, or null for a meeting engagement. */
export const attackerOf = (engagement: Engagement): OobSide | null =>
  engagement === 'ALLIED_ATTACKS' ? 'ALLIED' : engagement === 'AXIS_ATTACKS' ? 'AXIS' : null;

/** Every random stream is explicit so changing one subsystem cannot perturb another. */
export interface NewGameRequest {
  readonly templateId: NewGameTemplateId;
  /** Absent means MEETING, so requests and saves made before engagements existed keep their meaning. */
  readonly engagement?: Engagement;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly style: MapGenerationStyle;
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

export interface NewGameOrchestrator {
  readonly prepare: (
    request: NewGameRequest,
  ) => { readonly ok: true; readonly value: GeneratedScenarioPackage }
    | { readonly ok: false; readonly error: readonly GameFlowFailure[] };
  readonly create: (
    request: NewGameRequest,
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
