import type {
  DefinitionId,
  HexId,
  PieceId,
  PlayerId,
  Revision,
  ScenarioId,
  SchemaVersion,
  ValidationIssue,
} from '../../core/index.js';
import type { MapState } from '../../domain/map/index.js';
import type { OcsMode, PieceRuntimeState } from '../../domain/piece/index.js';
import type { ScenarioDefinition } from '../../domain/scenario/index.js';
import type { RuleActionId, RuleDecisionId, RuleTransactionId } from './ids.js';

export const RULE_PHASES = [
  'WEATHER', 'FIRST_PLAYER', 'AIRCRAFT_REFIT', 'REINFORCEMENT', 'MOVEMENT',
  'SUPPLY', 'REACTION', 'COMBAT', 'EXPLOITATION', 'CLEAN_UP', 'TURN_END', 'COMPLETE',
] as const;
export type RulePhase = (typeof RULE_PHASES)[number];

export type RuleSegment = 'NONE' | 'MOVEMENT' | 'BARRAGE' | 'COMBAT';

export interface TurnSequenceState {
  readonly gameTurn: number;
  readonly playerTurnIndex: 0 | 1;
  readonly phase: RulePhase;
  readonly segment: RuleSegment;
  readonly phasingPlayerId: PlayerId;
  readonly actingPlayerId: PlayerId;
}

export interface TerrainMovementCost {
  readonly terrainDefinitionId: DefinitionId;
  readonly costTicks: number;
}

export interface HexsideMovementCost {
  readonly featureDefinitionId: DefinitionId;
  readonly costTicks: number;
}

export type CombatResultCode =
  | 'NO_EFFECT'
  | 'ATTACKER_STEP_LOSS'
  | 'DEFENDER_STEP_LOSS'
  | 'DEFENDER_RETREAT'
  | 'DEFENDER_STEP_LOSS_AND_RETREAT';

export interface CombatTableBand {
  readonly minimumOdds: number;
  readonly resultsByTwoDiceTotal: Readonly<Record<number, CombatResultCode>>;
}

export type BarrageResultCode = 'NO_EFFECT' | 'DG' | 'STEP_LOSS_AND_DG';

export interface BarrageTableBand {
  readonly minimumStrength: number;
  readonly supplyTokenCost: number;
  readonly resultsByTwoDiceTotal: Readonly<Record<number, BarrageResultCode>>;
}

export interface ObjectiveDefinition {
  readonly hexId: HexId;
  readonly points: number;
}

export interface RuleConfiguration {
  readonly schemaVersion: SchemaVersion;
  readonly id: DefinitionId;
  readonly rulesVersion: string;
  readonly terrainMovementCosts: readonly TerrainMovementCost[];
  readonly hexsideMovementCosts: readonly HexsideMovementCost[];
  readonly defaultTerrainCostTicks: number;
  readonly minimumMoveTicks: number;
  readonly stackingLimitReTicks: number;
  readonly supplyTraceRange: number;
  readonly combatSupplyTokenCost: number;
  readonly combatTable: readonly CombatTableBand[];
  readonly barrageTable: readonly BarrageTableBand[];
  readonly turnLimit: number;
  readonly objectives: readonly ObjectiveDefinition[];
}

export interface RulesRngState {
  readonly state: number;
  readonly draws: number;
}

export interface PieceUsageState {
  readonly pieceId: PieceId;
  readonly movementSpentTicks: number;
  readonly moved: boolean;
  readonly fired: boolean;
  readonly attacked: boolean;
  readonly barraged: boolean;
  readonly reserveReleased: boolean;
}

export interface ResourceReservation {
  readonly resourcePieceId: PieceId;
  readonly quantity: number;
  readonly unitDefinitionId: DefinitionId;
}

export type RuleTransactionKind = 'COMBAT' | 'OVERRUN' | 'BARRAGE';
export type RuleTransactionStep =
  | 'AWAITING_RESOURCE'
  | 'READY'
  | 'AWAITING_LOSS'
  | 'AWAITING_RETREAT'
  | 'AWAITING_ADVANCE';

export interface RulesDiceRoll {
  readonly dice: readonly [number, number];
  readonly total: number;
  readonly stateBefore: number;
  readonly stateAfter: number;
}

export interface RuleTransaction {
  readonly id: RuleTransactionId;
  readonly kind: RuleTransactionKind;
  readonly step: RuleTransactionStep;
  readonly ownerId: PlayerId;
  readonly originRevision: Revision;
  readonly attackerIds: readonly PieceId[];
  readonly defenderIds: readonly PieceId[];
  readonly targetHexId: HexId;
  readonly reservations: readonly ResourceReservation[];
  readonly roll: RulesDiceRoll | null;
  readonly result: CombatResultCode | BarrageResultCode | null;
}

export type PendingDecisionKind = 'RESOURCE_SOURCE' | 'STEP_LOSS' | 'RETREAT_HEX' | 'ADVANCE_HEX';

export interface PendingDecisionOption {
  readonly id: string;
  readonly label: string;
}

export interface PendingDecision {
  readonly id: RuleDecisionId;
  readonly kind: PendingDecisionKind;
  readonly ownerId: PlayerId;
  readonly transactionId: RuleTransactionId;
  readonly options: readonly PendingDecisionOption[];
}

export interface VictoryState {
  readonly scores: readonly { readonly playerId: PlayerId; readonly points: number }[];
  readonly winnerId: PlayerId | null;
  readonly reason: 'TURN_LIMIT' | 'OBJECTIVES' | null;
}

export interface GameState {
  readonly schemaVersion: SchemaVersion;
  readonly revision: Revision;
  readonly scenarioId: ScenarioId;
  readonly scenario: ScenarioDefinition;
  readonly configuration: RuleConfiguration;
  readonly sequence: TurnSequenceState;
  readonly mapState: MapState;
  readonly pieceState: PieceRuntimeState;
  readonly usage: readonly PieceUsageState[];
  readonly currentMoverId: PieceId | null;
  readonly rng: RulesRngState;
  readonly activeTransaction: RuleTransaction | null;
  readonly pendingDecision: PendingDecision | null;
  readonly victory: VictoryState;
}

interface ActionEnvelope {
  readonly actionId: RuleActionId;
  readonly actorId: PlayerId;
  readonly expectedRevision: Revision;
}

export type GameAction =
  | (ActionEnvelope & { readonly kind: 'ADVANCE_SEQUENCE' })
  | (ActionEnvelope & { readonly kind: 'CHANGE_MODE'; readonly pieceId: PieceId; readonly mode: OcsMode })
  | (ActionEnvelope & { readonly kind: 'RELEASE_RESERVE'; readonly pieceId: PieceId })
  | (ActionEnvelope & { readonly kind: 'MOVE_PIECE'; readonly pieceId: PieceId; readonly path: readonly HexId[] })
  | (ActionEnvelope & { readonly kind: 'CHECK_SUPPLY'; readonly pieceIds: readonly PieceId[]; readonly sourcePieceId: PieceId | null })
  | (ActionEnvelope & {
    readonly kind: 'DECLARE_COMBAT';
    readonly combatKind: 'REGULAR' | 'OVERRUN';
    readonly attackerIds: readonly PieceId[];
    readonly defenderIds: readonly PieceId[];
    readonly targetHexId: HexId;
  })
  | (ActionEnvelope & {
    readonly kind: 'DECLARE_BARRAGE';
    readonly firerIds: readonly PieceId[];
    readonly targetPieceIds: readonly PieceId[];
    readonly targetHexId: HexId;
  })
  | (ActionEnvelope & { readonly kind: 'RESPOND_DECISION'; readonly decisionId: RuleDecisionId; readonly choiceId: string })
  | (ActionEnvelope & { readonly kind: 'COMMIT_TRANSACTION'; readonly transactionId: RuleTransactionId })
  | (ActionEnvelope & { readonly kind: 'CANCEL_TRANSACTION'; readonly transactionId: RuleTransactionId })
  | (ActionEnvelope & { readonly kind: 'PLACE_REINFORCEMENT'; readonly pieceId: PieceId; readonly hexId: HexId });

export type RuleEvent =
  | { readonly kind: 'SEQUENCE_ADVANCED'; readonly sequence: number; readonly from: TurnSequenceState; readonly to: TurnSequenceState }
  | { readonly kind: 'MODE_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly from: OcsMode | null; readonly to: OcsMode }
  | { readonly kind: 'PIECE_MOVED'; readonly sequence: number; readonly pieceId: PieceId; readonly path: readonly HexId[]; readonly spentTicks: number }
  | { readonly kind: 'SUPPLY_STATUS_CHANGED'; readonly sequence: number; readonly pieceId: PieceId; readonly inSupply: boolean }
  | { readonly kind: 'SUPPLY_SPENT'; readonly sequence: number; readonly resourcePieceId: PieceId; readonly quantity: number }
  | { readonly kind: 'TRANSACTION_DECLARED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly transactionKind: RuleTransactionKind }
  | { readonly kind: 'DECISION_REQUESTED'; readonly sequence: number; readonly decision: PendingDecision }
  | { readonly kind: 'RESOURCE_RESERVED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly reservation: ResourceReservation }
  | { readonly kind: 'RESOURCE_CONSUMED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly reservation: ResourceReservation }
  | { readonly kind: 'DICE_ROLLED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly roll: RulesDiceRoll }
  | { readonly kind: 'TRANSACTION_RESOLVED'; readonly sequence: number; readonly transactionId: RuleTransactionId; readonly result: string }
  | { readonly kind: 'TRANSACTION_CANCELLED'; readonly sequence: number; readonly transactionId: RuleTransactionId }
  | { readonly kind: 'STEP_LOST'; readonly sequence: number; readonly pieceId: PieceId; readonly remainingSteps: number | null }
  | { readonly kind: 'PIECE_RETREATED'; readonly sequence: number; readonly pieceId: PieceId; readonly toHexId: HexId }
  | { readonly kind: 'PIECE_ADVANCED'; readonly sequence: number; readonly pieceId: PieceId; readonly toHexId: HexId }
  | { readonly kind: 'REINFORCEMENT_PLACED'; readonly sequence: number; readonly pieceId: PieceId; readonly hexId: HexId }
  | { readonly kind: 'CLEANUP_COMPLETED'; readonly sequence: number; readonly playerId: PlayerId }
  | { readonly kind: 'VICTORY_RECORDED'; readonly sequence: number; readonly winnerId: PlayerId | null; readonly reason: string };

export interface RuleViolation {
  readonly code: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly rule: string;
}

export interface ActionValidation {
  readonly allowed: boolean;
  readonly violations: readonly RuleViolation[];
}

export type TransitionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly RuleEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly events: readonly []; readonly violations: readonly RuleViolation[] };

export interface GameStateValidation {
  readonly issues: readonly ValidationIssue[];
}
