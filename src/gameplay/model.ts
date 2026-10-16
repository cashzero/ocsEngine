import type {
  Brand,
  ContentHash,
  HexId,
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
  FuelCoverage,
  AttackerSupplyChoice,
  AttackerSupplyOptions,
  FuelPreview,
  SupplySourceHex,
  RailControlHex,
  RailMoveOptions,
  SeaMoveOptions,
  GameAction,
  PendingDecisionKind,
  RuleEvent,
  RuleExplanation,
  RuleProjection,
  RuleViolation,
  TraceCoverage,
  FeedSource,
  PlannedAttack,
  RuleConfiguration,
  ReachableHex,
  RuleQueryResult,
  TransportOptions,
} from '../rules/index.js';

export type SessionId = Brand<string, 'SessionId'>;
export type SeatId = Brand<string, 'SeatId'>;
export type DispatchRequestId = Brand<string, 'DispatchRequestId'>;
export type CheckpointId = Brand<string, 'CheckpointId'>;
export type HandoffToken = Brand<string, 'HandoffToken'>;

export type SessionLifecycle = 'READY' | 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'FAULTED' | 'CLOSED';

/**
 * Who plays a seat. Absent means a person at the screen (hot seat); a BOT seat is played by a computer policy that
 * the UI (or a headless runner) drives through the same session API. The policy and seed are saved with the game, so
 * a loaded save resumes with the same computer players.
 */
export type SeatController =
  | { readonly kind: 'HUMAN' }
  | { readonly kind: 'BOT'; readonly policyId: string; /** uint32 */ readonly seed: number };

export interface SeatBinding {
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly label: string;
  readonly controller?: SeatController;
}

export const isBotSeat = (binding: Pick<SeatBinding, 'controller'>): boolean => binding.controller?.kind === 'BOT';

export interface CreateSessionRequest {
  readonly scenario: ScenarioDefinition;
  readonly configuration: RuleConfiguration;
  readonly rulesSeed: number;
  readonly bindings: readonly SeatBinding[];
  readonly label: string;
  /**
   * AUTOSAVE (default) hands a full save to the save port after every accepted dispatch. MANUAL skips it for
   * fast simulation such as bot-against-bot matches; `save()`/`serializeSave()` still work on demand.
   */
  readonly persistence?: SessionPersistence;
}

export type SessionPersistence = 'AUTOSAVE' | 'MANUAL';

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
  /** The accepted action drew from the dice stream, whether or not an event shows it: taking it back would allow a re-roll. */
  readonly randomUsed?: boolean;
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
  | { readonly kind: 'SEAT_CONTROLLER_CHANGED'; readonly seatId: SeatId; readonly controller: SeatController; readonly revision: Revision }
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
   * 0.5.0: adds the replacement bookkeeping (trucks lost to enemy action, 13.5e). 0.4.0 added Air Base construction, Drop Plans and the unload ledger to the air bookkeeping. 0.3.0 added air power
   * (aircraft, Air Bases, air missions). 0.2.0 saves (ground rules before air)
   * are still read: their snapshots are upgraded with empty air bookkeeping when loaded.
   */
  readonly gameplayVersion: '0.2.0' | '0.3.0' | '0.4.0' | '0.5.0';
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
  readonly getLogisticsOverview: (seatId: SeatId, selected: readonly PieceId[]) => import('./logistics.js').LogisticsOverview | null;
  readonly planLogistics: (seatId: SeatId, request: import('./logistics.js').LogisticsRequest) => import('./logistics.js').LogisticsPlan | null;
  readonly validateActionSequence: (seatId: SeatId, actions: readonly GameAction[]) => Promise<{ readonly allowed: boolean; readonly message: string; readonly finalStateHash: string }>;
  readonly getMetadata: () => SessionMetadata;
  readonly getRevision: () => Revision;
  /** The seats and who controls each (a person or a computer policy). */
  readonly getBindings: () => readonly SeatBinding[];
  /** Hands a seat to a person or a computer; saved with the game. Does not change the active (viewing) seat. */
  readonly setSeatController: (seatId: SeatId, controller: SeatController, label?: string) => void;
  readonly getView: (seatId: SeatId) => GameplayView;
  readonly getActionFamilies: (seatId: SeatId) => readonly ActionFamily[];
  readonly getActionCandidates: (seatId: SeatId, request: Omit<CandidateRequest, 'actorId'>) => CandidateResult;
  /** Destinations of one of the seat's units with their MP cost (6.1); empty when not interactive. */
  /** Where the unit can move; with `companionIds`, where it and they can move together as one stack (6.1f). */
  readonly getMovementRange: (seatId: SeatId, pieceId: PieceId, companionIds?: readonly PieceId[]) => RuleQueryResult<readonly ReachableHex[]>;
  /** What the seat's Transport Point can load or unload where it stands, with Token ranges, MP cost and the rule behind anything not offered. */
  readonly getTransportOptions: (seatId: SeatId, truckId: PieceId) => RuleQueryResult<TransportOptions | null>;
  /** Hexes where the seat's trace supply reaches, for one of its units or (null) any unit; empty when not interactive. */
  readonly getTraceCoverage: (seatId: SeatId, pieceId: PieceId | null) => RuleQueryResult<TraceCoverage>;
  /** Where each of the seat's dumps can feed one of its units (or, null, any unit) out of trace (12.6c); empty when not interactive. */
  readonly getFeedCoverage: (seatId: SeatId, pieceId: PieceId | null) => RuleQueryResult<readonly FeedSource[]>;
  /** Hexes within draw range (12.3a) of SP standing in `hexId`, for the seat; empty when not interactive. */
  readonly getDrawReach: (seatId: SeatId, hexId: HexId) => RuleQueryResult<readonly HexId[]>;
  /** What the seat's units would count attacking `targetHexId` from beside it, per terrain the defender may choose (9.4b). */
  readonly getAttackStrength: (seatId: SeatId, attackerIds: readonly PieceId[], targetHexId: HexId) => RuleQueryResult<PlannedAttack | null>;
  /** The seat's Supply Sources (12.6a) and why each counts; empty when not interactive. */
  readonly getSupplySources: (seatId: SeatId) => RuleQueryResult<readonly SupplySourceHex[]>;
  /** Control of every rail Hex from the seat's side (13.3h); empty when not interactive. */
  readonly getRailControl: (seatId: SeatId) => RuleQueryResult<readonly RailControlHex[]>;
  /** What a rail move from one Hex could carry for the seat, where it could detrain, and the Rail Cap left (13.3). */
  readonly getRailMoveOptions: (seatId: SeatId, fromHexId: HexId) => RuleQueryResult<RailMoveOptions | null>;
  /** What a shipment from a port (or, null, the reinforcement Box) could carry for the seat, and where it could land (19.0f). */
  readonly getSeaMoveOptions: (seatId: SeatId, fromHexId: HexId | null) => RuleQueryResult<SeaMoveOptions | null>;
  /** Each fuel payment open to one of the seat's units with the units it would newly fuel (12.5c). */
  /** How one of the seat's units is fueled now (12.5): a coverage method, 'NOT_NEEDED', or null when it needs fuel and has none. */
  readonly getFuelCoverage: (seatId: SeatId, pieceId: PieceId) => RuleQueryResult<FuelCoverage>;
  readonly getFuelPreview: (seatId: SeatId, pieceId: PieceId) => RuleQueryResult<readonly FuelPreview[]>;
  /** Combat supply sources one of the seat's units may declare after the attackers already declared (9.5, 12.10a). */
  readonly getAttackerSupplyOptions: (seatId: SeatId, prior: readonly AttackerSupplyChoice[], pieceId: PieceId) => RuleQueryResult<AttackerSupplyOptions | null>;
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
  readonly loadReplay: (serializedReplay: string, bindings: readonly SeatBinding[]) => Promise<GameSession>;
  readonly loadStoredSession: (sessionId: SessionId) => Promise<GameSession>;
}
