import type {
  Brand,
  ContentHash,
  PieceId,
  PlayerId,
  Revision,
  ScenarioId,
} from '../core/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type {
  ActionFamily,
  CandidateRequest,
  CandidateResult,
  GameAction,
  PendingDecisionKind,
  RuleEvent,
  RuleExplanation,
  RuleProjection,
  RuleViolation,
  RuleConfiguration,
  ReachableHex,
  RuleQueryResult,
} from '../rules/index.js';

export type SessionId = Brand<string, 'SessionId'>;
export type SeatId = Brand<string, 'SeatId'>;
export type DispatchRequestId = Brand<string, 'DispatchRequestId'>;
export type CheckpointId = Brand<string, 'CheckpointId'>;
export type HandoffToken = Brand<string, 'HandoffToken'>;

export type SessionLifecycle = 'READY' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'FAULTED' | 'CLOSED';

export interface SeatBinding {
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly label: string;
}

export interface CreateSessionRequest {
  readonly scenario: ScenarioDefinition;
  readonly configuration: RuleConfiguration;
  readonly rulesSeed: number;
  readonly bindings: readonly SeatBinding[];
  readonly label: string;
}

export interface CreateStoredSessionRequest {
  readonly scenarioId: ScenarioId;
  readonly configuration: RuleConfiguration;
  readonly rulesSeed: number;
  readonly bindings: readonly SeatBinding[];
  readonly label: string;
}

export interface SessionMetadata {
  readonly id: SessionId;
  readonly label: string;
  readonly scenarioId: ScenarioId;
  readonly scenarioHash: ContentHash;
  readonly stateHash: ContentHash;
  readonly rulesVersion: string;
  readonly createdAtMs: number;
  readonly lifecycle: SessionLifecycle;
  readonly activeSeatId: SeatId;
}

export interface GameplayView {
  readonly metadata: SessionMetadata;
  readonly stateRevision: Revision;
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly privacyLocked: boolean;
  readonly projection: RuleProjection | null;
  readonly pendingDecision: PendingDecisionDescriptor | null;
}

export interface PendingDecisionDescriptor {
  readonly id: string;
  readonly kind: PendingDecisionKind;
  readonly transactionId: string | null;
  readonly prompt: string;
  readonly stateRevision: Revision;
  /** `hexId` is set when the option refers to a map Hex (retreat or placement destinations). */
  readonly options: readonly { readonly id: string; readonly label: string; readonly hexId: string | null }[];
}

export interface ActionDraft {
  readonly stateRevision: Revision;
  readonly seatId: SeatId;
  readonly action: GameAction;
}

export interface DraftValidation {
  readonly current: boolean;
  readonly explanation: RuleExplanation;
}

export interface DispatchRequest {
  readonly requestId: DispatchRequestId;
  readonly seatId: SeatId;
  readonly action: GameAction;
}

export type DispatchStatus = 'ACCEPTED' | 'REJECTED' | 'DUPLICATE' | 'FATAL';

export interface DispatchResult {
  readonly status: DispatchStatus;
  readonly requestId: DispatchRequestId;
  readonly revision: Revision;
  readonly events: readonly RuleEvent[];
  readonly violations: readonly RuleViolation[];
  readonly pendingDecision: PendingDecisionDescriptor | null;
  readonly warnings: readonly GameplayWarning[];
}

export interface GameplayWarning {
  readonly code: 'SUBSCRIBER_FAILURE' | 'PERSISTENCE_FAILURE';
  readonly message: string;
}

export type SessionNotification =
  | { readonly kind: 'LIFECYCLE_CHANGED'; readonly lifecycle: SessionLifecycle; readonly revision: Revision }
  | { readonly kind: 'DISPATCH_ACCEPTED'; readonly record: HistoryRecord }
  | { readonly kind: 'PENDING_DECISION_CHANGED'; readonly decision: PendingDecisionDescriptor | null; readonly revision: Revision }
  | { readonly kind: 'CHECKPOINT_RESTORED'; readonly checkpointId: CheckpointId; readonly revision: Revision }
  | { readonly kind: 'PRIVACY_HANDOFF'; readonly locked: boolean; readonly activeSeatId: SeatId; readonly revision: Revision }
  | { readonly kind: 'FAULTED'; readonly code: string; readonly revision: Revision };

export type SessionListener = (notification: SessionNotification) => void;
export type Unsubscribe = () => void;

export interface HistoryRecord {
  readonly sequence: number;
  readonly requestId: DispatchRequestId;
  readonly seatId: SeatId;
  readonly action: GameAction;
  readonly events: readonly RuleEvent[];
  readonly revisionBefore: Revision;
  readonly revisionAfter: Revision;
  readonly acceptedAtMs: number;
  readonly durationMs: number;
  readonly summary: string;
}

export interface HistoryQuery {
  readonly offset: number;
  readonly limit: number;
  readonly actionKind: GameAction['kind'] | null;
}

export interface HistoryPage {
  readonly records: readonly HistoryRecord[];
  readonly total: number;
  readonly truncated: boolean;
}

export interface RejectionDiagnostic {
  readonly requestId: DispatchRequestId;
  readonly code: string;
  readonly revision: Revision;
  readonly recordedAtMs: number;
}

export interface SessionMetrics {
  readonly acceptedDispatches: number;
  readonly rejectedDispatches: number;
  readonly duplicateRequests: number;
  readonly subscriberFailures: number;
  readonly persistenceFailures: number;
  readonly maximumDispatchDurationMs: number;
}

export interface SessionDiagnostics {
  readonly lifecycle: SessionLifecycle;
  readonly revision: Revision;
  readonly stateHash: ContentHash;
  readonly pendingDecisionKind: PendingDecisionKind | null;
  readonly historyLength: number;
  readonly rejections: readonly RejectionDiagnostic[];
  readonly metrics: SessionMetrics;
  readonly fatalCode: string | null;
}

export interface CheckpointDescriptor {
  readonly id: CheckpointId;
  readonly label: string;
  readonly actionIndex: number;
  readonly revision: Revision;
  readonly stateHash: ContentHash;
}

export interface GameplaySaveCheckpoint extends CheckpointDescriptor {
  readonly snapshot: string;
}

export interface GameplaySaveActionMetadata {
  readonly requestId: DispatchRequestId;
  readonly seatId: SeatId;
  readonly acceptedAtMs: number;
  readonly durationMs: number;
}

export interface GameplaySaveEnvelope {
  readonly schemaVersion: 1;
  /**
   * 0.3.0: adds air power (aircraft, Air Bases, air missions). 0.2.0 saves (ground rules before air)
   * are still read: their snapshots are upgraded with empty air bookkeeping when loaded.
   */
  readonly gameplayVersion: '0.2.0' | '0.3.0';
  readonly sessionId: SessionId;
  readonly label: string;
  readonly createdAtMs: number;
  readonly lifecycle: Exclude<SessionLifecycle, 'FAULTED' | 'CLOSED'>;
  readonly activeSeatId: SeatId;
  readonly bindings: readonly SeatBinding[];
  readonly scenarioHash: ContentHash;
  readonly initialStateHash: ContentHash;
  readonly finalStateHash: ContentHash;
  readonly initialSnapshot: string;
  readonly currentSnapshot: string;
  readonly acceptedActions: readonly GameAction[];
  readonly acceptedActionMetadata: readonly GameplaySaveActionMetadata[];
  readonly checkpoints: readonly GameplaySaveCheckpoint[];
}

export interface GameplayReplayEnvelope {
  readonly schemaVersion: 1;
  readonly scenarioHash: ContentHash;
  readonly initialStateHash: ContentHash;
  readonly finalStateHash: ContentHash;
  readonly initialSnapshot: string;
  readonly actions: readonly GameAction[];
}

export interface HeadlessCommand {
  readonly requestId: DispatchRequestId;
  readonly seatId: SeatId;
  readonly action: GameAction;
}

export interface HeadlessRunResult {
  readonly results: readonly DispatchResult[];
  readonly accepted: number;
  readonly rejected: number;
  readonly finalRevision: Revision;
  readonly finalStateHash: ContentHash;
  readonly stopReason: 'COMMANDS_EXHAUSTED' | 'NO_COMMAND' | 'REJECTED' | 'FINISHED' | 'BUDGET_EXHAUSTED';
}

export type HeadlessCommandSource = (
  session: GameSession,
  commandIndex: number,
) => HeadlessCommand | null;

export interface GameplayOperationResult {
  readonly ok: boolean;
  readonly code: string;
  readonly lifecycle: SessionLifecycle;
  readonly revision: Revision;
}

export interface GameplayError {
  readonly code:
    | 'INVALID_SESSION_ID' | 'INVALID_SEAT_ID' | 'INVALID_REQUEST_ID' | 'INVALID_CHECKPOINT_ID'
    | 'INVALID_BINDINGS' | 'SCENARIO_NOT_FOUND' | 'SCENARIO_INCOMPATIBLE'
    | 'SAVE_INVALID' | 'SAVE_INCOMPATIBLE' | 'SAVE_REPLAY_MISMATCH' | 'SAVE_NOT_FOUND'
    | 'SESSION_NOT_AVAILABLE' | 'CHECKPOINT_NOT_FOUND' | 'HANDOFF_INVALID';
  readonly message: string;
  readonly path: readonly (string | number)[];
}

export interface GameSession {
  readonly getMetadata: () => SessionMetadata;
  readonly getRevision: () => Revision;
  readonly getView: (seatId: SeatId) => GameplayView;
  readonly getActionFamilies: (seatId: SeatId) => readonly ActionFamily[];
  readonly getActionCandidates: (seatId: SeatId, request: Omit<CandidateRequest, 'actorId'>) => CandidateResult;
  /** Destinations of one of the seat's units with their MP cost (6.1); empty when not interactive. */
  readonly getMovementRange: (seatId: SeatId, pieceId: PieceId) => RuleQueryResult<readonly ReachableHex[]>;
  readonly createDraft: (seatId: SeatId, action: GameAction) => ActionDraft;
  readonly validateDraft: (draft: ActionDraft) => DraftValidation;
  readonly getPendingDecision: (seatId: SeatId) => PendingDecisionDescriptor | null;
  readonly respondToPendingDecision: (requestId: DispatchRequestId, seatId: SeatId, choiceId: string) => Promise<DispatchResult>;
  readonly dispatch: (request: DispatchRequest) => Promise<DispatchResult>;
  readonly subscribe: (listener: SessionListener) => Unsubscribe;
  readonly getHistory: (query: HistoryQuery) => HistoryPage;
  readonly getDiagnostics: () => SessionDiagnostics;
  readonly start: () => GameplayOperationResult;
  readonly pause: () => GameplayOperationResult;
  readonly resume: () => GameplayOperationResult;
  readonly beginHandoff: (fromSeatId: SeatId, toSeatId: SeatId) => HandoffToken;
  readonly completeHandoff: (token: HandoffToken) => GameplayOperationResult;
  readonly createCheckpoint: (label?: string) => CheckpointDescriptor;
  readonly listCheckpoints: () => readonly CheckpointDescriptor[];
  /** Drop a checkpoint that is no longer wanted (for example a superseded automatic one). */
  readonly removeCheckpoint: (checkpointId: CheckpointId) => boolean;
  readonly undoTo: (checkpointId: CheckpointId) => Promise<GameplayOperationResult>;
  readonly save: () => GameplaySaveEnvelope;
  readonly serializeSave: () => string;
  readonly exportReplay: () => GameplayReplayEnvelope;
  readonly close: () => Promise<GameplayOperationResult>;
}

export interface GameplayEngine {
  readonly createSession: (request: CreateSessionRequest) => Promise<GameSession>;
  readonly createStoredSession: (request: CreateStoredSessionRequest) => Promise<GameSession>;
  readonly loadSession: (serializedSave: string) => Promise<GameSession>;
  readonly loadStoredSession: (sessionId: SessionId) => Promise<GameSession>;
}
