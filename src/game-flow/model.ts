import type { HexId, ValidationIssue } from '../core/index.js';
import type { PieceRuntimeState } from '../domain/piece/index.js';
import type { MapState } from '../domain/map/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameSession, GameplayEngine, SeatBinding } from '../gameplay/index.js';
import type {
  GeneratedMap,
  MapGenerationStyle,
} from '../generation/map/index.js';
import type { AirForceLevel, GeneratedOob, OobScale } from '../generation/oob/index.js';
import type { RuleConfiguration } from '../rules/index.js';

export const GAME_FLOW_VERSION = '0.1.0' as const;
export const NEW_GAME_TEMPLATE_IDS = ['GROUND_DUEL'] as const;
export type NewGameTemplateId = (typeof NEW_GAME_TEMPLATE_IDS)[number];

/** Every random stream is explicit so changing one subsystem cannot perturb another. */
export interface NewGameRequest {
  readonly templateId: NewGameTemplateId;
  readonly map: {
    readonly width: number;
    readonly height: number;
    readonly style: MapGenerationStyle;
  };
  readonly oob: {
    readonly scale: OobScale;
    readonly formationsPerSide: number;
    /** Aircraft and Air Bases (14.0-15.0). Absent means NONE: a ground duel. */
    readonly air?: AirForceLevel;
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
}

export interface GeneratedDeployment {
  readonly initialMapState: MapState;
  readonly initialPieceState: PieceRuntimeState;
  readonly objectiveHexIds: readonly HexId[];
  readonly metrics: {
    readonly pieces: number;
    readonly occupiedHexes: number;
    readonly alliedPieces: number;
    readonly axisPieces: number;
    readonly maximumStackReTicks: number;
  };
  readonly warnings: readonly string[];
}

export interface GeneratedGameSummary {
  readonly mapSize: string;
  readonly mapStyle: MapGenerationStyle;
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
