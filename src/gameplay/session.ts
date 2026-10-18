import type { PlayerId, Revision } from '../core/index.js';
import { GAMEPLAY_SAVE_VERSION } from './persistence.js';
import {
  hashGameState,
  parseGameStateJson,
  parseRuleActionId,
  serializeGameState,
  type CandidateResult,
  type GameAction,
  type GameState,
  type RuleViolation,
} from '../rules/index.js';
import { formatHistorySummary, queryHistory } from './history.js';
import {
  parseCheckpointId,
  parseHandoffToken,
} from './ids.js';
import { serializeGameplaySave } from './persistence.js';
import type { GameplayPorts } from './ports.js';
import { logisticsOverview, planLogistics } from './logistics.js';
import type {
  ActionDraft,
  CheckpointDescriptor,
  DispatchRequest,
  DispatchResult,
  DraftValidation,
  GameSession,
  GameplayError,
  GameplayOperationResult,
  GameplayReplayEnvelope,
  GameplaySaveCheckpoint,
  GameplaySaveEnvelope,
  GameplayWarning,
  GameplayView,
  HandoffToken,
  HistoryPage,
  HistoryQuery,
  HistoryRecord,
  PendingDecisionDescriptor,
  RejectionDiagnostic,
  SeatBinding,
  SeatController,
  SeatId,
  SessionDiagnostics,
  SessionId,
  SessionLifecycle,
  SessionListener,
  SessionMetadata,
  SessionPersistence,
  SessionMetrics,
  SessionNotification,
  Unsubscribe,
} from './model.js';

export class GameplayFailure extends Error {
  readonly detail: GameplayError;
  constructor(detail: GameplayError) {
    super(`${detail.code}: ${detail.message}`);
    this.name = 'GameplayFailure';
    this.detail = detail;
  }
}

export interface GameplaySessionOptions {
  readonly id: SessionId;
  readonly label: string;
  readonly createdAtMs: number;
  readonly lifecycle: Exclude<SessionLifecycle, 'FAULTED' | 'CLOSED'>;
  readonly activeSeatId: SeatId;
  readonly bindings: readonly SeatBinding[];
  readonly scenarioHash: SessionMetadata['scenarioHash'];
  readonly initialStateHash: SessionMetadata['stateHash'];
  readonly stateHash: SessionMetadata['stateHash'];
  readonly initialState: GameState;
  readonly state: GameState;
  readonly history: readonly HistoryRecord[];
  readonly checkpoints: readonly GameplaySaveCheckpoint[];
  readonly ports: GameplayPorts;
  /** Defaults to AUTOSAVE. */
  readonly persistence?: SessionPersistence;
}

const cloneValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const cloneAction = (action: GameAction): GameAction => cloneValue(action);

const gameplayViolation = (code: string, message: string): RuleViolation => ({
  code, message, path: [], rule: 'gameplay',
});

const pendingFor = (state: GameState, playerId: PlayerId): PendingDecisionDescriptor | null => {
  const pending = state.pendingDecision;
  return pending?.ownerId === playerId ? {
    id: pending.id,
    kind: pending.kind,
    transactionId: pending.transactionId,
    prompt: pending.prompt,
    stateRevision: state.revision,
    options: pending.options.map((option) => ({ ...option })),
  } : null;
};

const initialMetrics = (): SessionMetrics => ({
  acceptedDispatches: 0, rejectedDispatches: 0, duplicateRequests: 0,
  subscriberFailures: 0, persistenceFailures: 0, maximumDispatchDurationMs: 0,
});

export class GameplaySession implements GameSession {
  readonly #ports: GameplayPorts;
  readonly #persistence: SessionPersistence;
  readonly #id: SessionId;
  readonly #label: string;
  readonly #createdAtMs: number;
  #bindings: readonly SeatBinding[];
  readonly #scenarioHash: SessionMetadata['scenarioHash'];
  readonly #initialStateHash: SessionMetadata['stateHash'];
  readonly #initialState: GameState;
  #state: GameState;
  #stateHash: SessionMetadata['stateHash'];
  #lifecycle: SessionLifecycle;
  #activeSeatId: SeatId;
  #handoff: { readonly token: HandoffToken; readonly toSeatId: SeatId } | null = null;
  #listeners = new Set<SessionListener>();
  #history: HistoryRecord[];
  #checkpoints: GameplaySaveCheckpoint[];
  #requests = new Map<string, DispatchResult>();
  #acceptedActionIds: Set<string>;
  #rejections: RejectionDiagnostic[] = [];
  #metrics = initialMetrics();
  #fatalCode: string | null = null;
  #dispatchTail: Promise<unknown> = Promise.resolve();
  #checkpointSequence: number;

  constructor(options: GameplaySessionOptions) {
    this.#ports = options.ports;
    this.#persistence = options.persistence ?? 'AUTOSAVE';
    this.#id = options.id;
    this.#label = options.label;
    this.#createdAtMs = options.createdAtMs;
    this.#bindings = options.bindings.map((binding) => ({ ...binding }));
    this.#scenarioHash = options.scenarioHash;
    this.#initialStateHash = options.initialStateHash;
    this.#initialState = options.initialState;
    this.#state = options.state;
    this.#stateHash = options.stateHash;
    this.#lifecycle = options.lifecycle;
    this.#activeSeatId = options.activeSeatId;
    this.#history = options.history.map((record) => ({ ...record, action: cloneAction(record.action), events: cloneValue(record.events) }));
    this.#checkpoints = options.checkpoints.map((checkpoint) => ({ ...checkpoint }));
    this.#acceptedActionIds = new Set(this.#history.map(({ action }) => String(action.actionId)));
    for (const record of this.#history) {
      this.#requests.set(String(record.requestId), {
        status: 'ACCEPTED', requestId: record.requestId, revision: record.revisionAfter,
        events: cloneValue(record.events), violations: [], pendingDecision: null, warnings: [],
      });
    }
    // Checkpoints may have been removed, so continue after the highest existing sequence number.
    this.#checkpointSequence = this.#checkpoints.reduce((highest, { id }) => Math.max(highest, Number(/:(\d+)$/u.exec(String(id))?.[1] ?? 0)), this.#checkpoints.length);
    this.#metrics = { ...this.#metrics, acceptedDispatches: this.#history.length };
  }

  getMetadata = (): SessionMetadata => ({
    id: this.#id, label: this.#label, scenarioId: this.#state.scenarioId,
    scenarioHash: this.#scenarioHash, stateHash: this.#stateHash,
    rulesVersion: this.#state.configuration.rulesVersion, createdAtMs: this.#createdAtMs,
    lifecycle: this.#lifecycle, activeSeatId: this.#activeSeatId,
  });

  getRevision = (): Revision => this.#state.revision;

  getBindings = (): readonly SeatBinding[] => this.#bindings.map((binding) => ({ ...binding }));

  setSeatController = (seatId: SeatId, controller: SeatController, label?: string): void => {
    this.#binding(seatId);
    this.#bindings = this.#bindings.map((binding) => {
      if (binding.seatId !== seatId) return binding;
      // A person is the default, so it is stored as no controller: saves of games without computers stay as they were.
      const { controller: _previous, ...rest } = binding;
      const named = label === undefined ? rest : { ...rest, label };
      return controller.kind === 'HUMAN' ? named : { ...named, controller: { ...controller } };
    });
    this.#notify({ kind: 'SEAT_CONTROLLER_CHANGED', seatId, controller, revision: this.#state.revision });
    if (this.#persistence === 'AUTOSAVE' && this.#lifecycle !== 'CLOSED' && this.#lifecycle !== 'FAULTED') {
      void Promise.resolve().then(() => this.#ports.saves.save(this.#id, this.serializeSave())).catch(() => {
        this.#metrics = { ...this.#metrics, persistenceFailures: this.#metrics.persistenceFailures + 1 };
      });
    }
  };

  #binding = (seatId: SeatId): SeatBinding => {
    const binding = this.#bindings.find((candidate) => candidate.seatId === seatId);
    if (!binding) throw new GameplayFailure({ code: 'INVALID_BINDINGS', message: 'Seat is not bound to this session.', path: ['seatId'] });
    return binding;
  };

  getView = (seatId: SeatId): GameplayView => {
    const binding = this.#binding(seatId);
    const privacyLocked = this.#handoff !== null;
    return {
      metadata: this.getMetadata(), stateRevision: this.#state.revision,
      seatId, playerId: binding.playerId, privacyLocked,
      projection: privacyLocked ? null : cloneValue(this.#ports.rules.projectForViewer(this.#state, binding.playerId)),
      pendingDecision: privacyLocked ? null : pendingFor(this.#state, binding.playerId),
    };
  };

  getActionFamilies = (seatId: SeatId) => {
    const binding = this.#binding(seatId);
    const families = this.#ports.rules.getActionFamilies(this.#state, binding.playerId);
    return this.#lifecycle === 'ACTIVE' && this.#handoff === null
      ? families : families.map(({ kind }) => ({ kind, enabled: false }));
  };

  getLogisticsOverview: GameSession['getLogisticsOverview'] = (seatId, selected) => {
    const view = this.getView(seatId);
    return this.#lifecycle === 'ACTIVE' && !view.privacyLocked && this.#state.sequence.actingPlayerId === view.playerId
      ? cloneValue(logisticsOverview(this.#state, view.playerId, selected, this.#ports.rules)) : null;
  };

  planLogistics: GameSession['planLogistics'] = (seatId, request) => {
    const view = this.getView(seatId);
    return this.#lifecycle === 'ACTIVE' && !view.privacyLocked
      ? cloneValue(planLogistics(this.#state, view.playerId, request, this.#ports.rules)) : null;
  };

  validateActionSequence: GameSession['validateActionSequence'] = async (seatId, actions) => {
    const view = this.getView(seatId);
    if (this.#lifecycle !== 'ACTIVE' || view.privacyLocked) return {allowed:false,message:'Session is not accepting actions.',finalStateHash:''};
    let next = this.#state;
    for (const action of actions) {
      if (action.actorId !== view.playerId) return {allowed:false,message:'A plan can act only for its own seat.',finalStateHash:''};
      const transition = this.#ports.rules.applyAction(next,action);
      if (!transition.ok) return {allowed:false,message:transition.violations.map(v=>v.message).join(' '),finalStateHash:''};
      if (JSON.stringify(next.rng) !== JSON.stringify(transition.state.rng) || transition.state.pendingDecision) return {allowed:false,message:'A plan cannot include dice or pending decisions.',finalStateHash:''};
      next = transition.state;
    }
    const hash = await hashGameState(next);
    if (!hash.ok) return {allowed:false,message:'Could not hash the simulated result.',finalStateHash:''};
    return {allowed:true,message:'Every step is legal.',finalStateHash:hash.value};
  };

  getBarrageAvailability: GameSession['getBarrageAvailability'] = (seatId) => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { kind: 'UNAVAILABLE', blockers: [] };
    }
    return this.#ports.rules.getBarrageAvailability(this.#state, binding.playerId);
  };

  getActionCandidates = (
    seatId: SeatId,
    request: Parameters<GameSession['getActionCandidates']>[1],
  ): CandidateResult => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) return {
      actions: [], truncated: false,
      reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }],
    };
    return this.#ports.rules.getActionCandidates(this.#state, { ...request, actorId: binding.playerId });
  };

  getMovementRange = (
    seatId: SeatId,
    pieceId: Parameters<GameSession['getMovementRange']>[1],
    companionIds: Parameters<GameSession['getMovementRange']>[2] = [],
  ): ReturnType<GameSession['getMovementRange']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryMovementRange(this.#state, binding.playerId, pieceId, companionIds));
  };

  getTransportOptions = (seatId: SeatId, truckId: Parameters<GameSession['getTransportOptions']>[1]): ReturnType<GameSession['getTransportOptions']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: null, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryTransportOptions(this.#state, binding.playerId, truckId));
  };

  getTraceCoverage = (seatId: SeatId, pieceId: Parameters<GameSession['getTraceCoverage']>[1]): ReturnType<GameSession['getTraceCoverage']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: { hexIds: [], directHexIds: [] }, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryTraceCoverage(this.#state, binding.playerId, pieceId));
  };

  getFeedCoverage = (seatId: SeatId, pieceId: Parameters<GameSession['getFeedCoverage']>[1]): ReturnType<GameSession['getFeedCoverage']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryFeedCoverage(this.#state, binding.playerId, pieceId));
  };

  getDrawReach = (seatId: SeatId, hexId: Parameters<GameSession['getDrawReach']>[1]): ReturnType<GameSession['getDrawReach']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryDrawReach(this.#state, binding.playerId, hexId));
  };

  getSupplySources = (seatId: SeatId): ReturnType<GameSession['getSupplySources']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.querySupplySources(this.#state, binding.playerId));
  };

  getRailControl = (seatId: SeatId): ReturnType<GameSession['getRailControl']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryRailControl(this.#state, binding.playerId));
  };

  getFuelCoverage = (seatId: SeatId, pieceId: Parameters<GameSession['getFuelCoverage']>[1]): ReturnType<GameSession['getFuelCoverage']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: null, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryFuelCoverage(this.#state, binding.playerId, pieceId));
  };

  getAttackerSupplyOptions = (seatId: SeatId, prior: Parameters<GameSession['getAttackerSupplyOptions']>[1], pieceId: Parameters<GameSession['getAttackerSupplyOptions']>[2]): ReturnType<GameSession['getAttackerSupplyOptions']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: null, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryAttackerSupplyOptions(this.#state, binding.playerId, prior, pieceId));
  };

  getRailMoveOptions = (seatId: SeatId, fromHexId: Parameters<GameSession['getRailMoveOptions']>[1]): ReturnType<GameSession['getRailMoveOptions']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: null, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryRailMoveOptions(this.#state, binding.playerId, fromHexId));
  };

  getSeaMoveOptions = (seatId: SeatId, fromHexId: Parameters<GameSession['getSeaMoveOptions']>[1]): ReturnType<GameSession['getSeaMoveOptions']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: null, reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.querySeaMoveOptions(this.#state, binding.playerId, fromHexId));
  };

  getFuelPreview = (seatId: SeatId, pieceId: Parameters<GameSession['getFuelPreview']>[1]): ReturnType<GameSession['getFuelPreview']> => {
    const binding = this.#binding(seatId);
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return { allowed: false, value: [], reasons: [{ code: 'SESSION_NOT_INTERACTIVE', allowed: false, message: 'Session is not accepting interaction.', rule: 'gameplay' }], facts: [], dependencies: [] };
    }
    return cloneValue(this.#ports.rules.queryFuelPreview(this.#state, binding.playerId, pieceId));
  };

  createDraft = (seatId: SeatId, action: GameAction): ActionDraft => ({
    stateRevision: this.#state.revision, seatId: this.#binding(seatId).seatId, action: cloneAction(action),
  });

  validateDraft = (draft: ActionDraft): DraftValidation => {
    const binding = this.#binding(draft.seatId);
    const current = draft.stateRevision === this.#state.revision
      && draft.action.expectedRevision === this.#state.revision
      && draft.action.actorId === binding.playerId;
    return { current, explanation: this.#ports.rules.explain(this.#state, draft.action) };
  };

  getPendingDecision = (seatId: SeatId): PendingDecisionDescriptor | null => {
    const binding = this.#binding(seatId);
    return this.#handoff === null ? pendingFor(this.#state, binding.playerId) : null;
  };

  respondToPendingDecision = async (
    requestId: Parameters<GameSession['respondToPendingDecision']>[0],
    seatId: SeatId,
    choiceId: string,
  ): Promise<DispatchResult> => {
    return this.#enqueue(async () => {
      const duplicate = this.#requests.get(String(requestId));
      if (duplicate) {
        this.#metrics = { ...this.#metrics, duplicateRequests: this.#metrics.duplicateRequests + 1 };
        return cloneValue({ ...duplicate, status: 'DUPLICATE', events: [], warnings: [] });
      }
      const binding = this.#binding(seatId);
      const pending = pendingFor(this.#state, binding.playerId);
      if (!pending) return this.#remember(
        requestId,
        this.#reject(requestId, 'NO_VISIBLE_PENDING_DECISION', 'Seat owns no pending decision.'),
      );
      const parsed = parseRuleActionId(`gameplay:decision:${pending.id}:${this.#state.revision}`);
      if (!parsed.ok) return this.#remember(
        requestId,
        this.#reject(requestId, 'INVALID_GENERATED_ACTION_ID', 'Pending response action ID is invalid.'),
      );
      return this.#performDispatch({
        requestId, seatId,
        action: {
          actionId: parsed.value, actorId: binding.playerId, expectedRevision: this.#state.revision,
          kind: 'RESPOND_DECISION', decisionId: this.#state.pendingDecision!.id, choiceId,
        },
      });
    });
  };

  #enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = this.#dispatchTail.then(operation, operation);
    this.#dispatchTail = result.then(() => undefined, () => undefined);
    return result;
  };

  dispatch = (request: DispatchRequest): Promise<DispatchResult> => {
    const snapshot: DispatchRequest = { ...request, action: cloneAction(request.action) };
    return this.#enqueue(() => this.#performDispatch(snapshot));
  };

  async #performDispatch(request: DispatchRequest): Promise<DispatchResult> {
    const duplicate = this.#requests.get(String(request.requestId));
    if (duplicate) {
      this.#metrics = { ...this.#metrics, duplicateRequests: this.#metrics.duplicateRequests + 1 };
      return cloneValue({ ...duplicate, status: 'DUPLICATE', events: [], warnings: [] });
    }
    if (this.#lifecycle !== 'ACTIVE' || this.#handoff !== null) {
      return this.#remember(request.requestId, this.#reject(request.requestId, 'SESSION_NOT_ACTIVE', 'Session is not accepting dispatch.'));
    }
    let binding: SeatBinding;
    try { binding = this.#binding(request.seatId); }
    catch { return this.#remember(request.requestId, this.#reject(request.requestId, 'UNBOUND_SEAT', 'Dispatch seat is not bound.')); }
    if (binding.playerId !== request.action.actorId) {
      return this.#remember(request.requestId, this.#reject(request.requestId, 'ACTOR_BINDING_MISMATCH', 'Seat cannot dispatch for this actor.'));
    }
    if (request.action.expectedRevision !== this.#state.revision) {
      return this.#remember(request.requestId, this.#reject(request.requestId, 'STALE_REVISION', 'Dispatch revision is stale.'));
    }
    if (this.#acceptedActionIds.has(String(request.action.actionId))) {
      return this.#remember(request.requestId, this.#reject(request.requestId, 'DUPLICATE_ACTION_ID', 'Action ID was already accepted.'));
    }
    const started = this.#ports.clock.nowMs();
    const before = this.#state;
    let transition: ReturnType<GameplayPorts['rules']['applyAction']>;
    try { transition = this.#ports.rules.applyAction(before, request.action); }
    catch {
      return this.#fault(request.requestId, 'RULE_ENGINE_EXCEPTION');
    }
    if (!transition.ok) {
      return this.#remember(request.requestId, this.#reject(
        request.requestId,
        transition.violations[0]?.code ?? 'RULE_REJECTED',
        'Rule Engine rejected the action.',
        transition.violations,
      ));
    }
    const hashed = await hashGameState(transition.state);
    if (!hashed.ok) return this.#fault(request.requestId, 'STATE_HASH_FAILURE');
    this.#state = transition.state;
    this.#stateHash = hashed.value;
    const duration = Math.max(0, this.#ports.clock.nowMs() - started);
    const record: HistoryRecord = {
      sequence: this.#history.length,
      requestId: request.requestId,
      seatId: request.seatId,
      action: cloneAction(request.action),
      events: cloneValue(transition.events),
      revisionBefore: before.revision,
      revisionAfter: transition.state.revision,
      acceptedAtMs: this.#ports.clock.nowMs(),
      durationMs: duration,
      summary: formatHistorySummary(request.action, transition.events),
    };
    this.#history.push(record);
    this.#acceptedActionIds.add(String(request.action.actionId));
    this.#metrics = {
      ...this.#metrics,
      acceptedDispatches: this.#metrics.acceptedDispatches + 1,
      maximumDispatchDurationMs: Math.max(this.#metrics.maximumDispatchDurationMs, duration),
    };
    const warnings: GameplayWarning[] = [
      ...this.#notify({ kind: 'DISPATCH_ACCEPTED', record }),
      ...this.#notify({
        kind: 'PENDING_DECISION_CHANGED',
        decision: this.#state.pendingDecision === null ? null : pendingFor(this.#state, this.#state.pendingDecision.ownerId),
        revision: this.#state.revision,
      }),
    ];
    if (this.#state.sequence.phase === 'COMPLETE') {
      this.#lifecycle = 'FINISHED';
      warnings.push(...this.#notify({ kind: 'LIFECYCLE_CHANGED', lifecycle: 'FINISHED', revision: this.#state.revision }));
    }
    if (this.#persistence === 'AUTOSAVE') {
      try { await this.#ports.saves.save(this.#id, this.serializeSave()); }
      catch {
        this.#metrics = { ...this.#metrics, persistenceFailures: this.#metrics.persistenceFailures + 1 };
        warnings.push({ code: 'PERSISTENCE_FAILURE', message: 'Accepted state is live but automatic persistence failed.' });
        this.#log('WARN', 'PERSISTENCE_FAILURE');
      }
    }
    const result: DispatchResult = {
      status: 'ACCEPTED', requestId: request.requestId, revision: this.#state.revision,
      events: cloneValue(transition.events), violations: [], pendingDecision: this.#state.pendingDecision === null
        ? null : pendingFor(this.#state, this.#state.pendingDecision.ownerId), warnings,
      randomUsed: JSON.stringify(before.rng) !== JSON.stringify(transition.state.rng),
    };
    return this.#remember(request.requestId, result);
  }

  #reject(
    requestId: DispatchResult['requestId'],
    code: string,
    message: string,
    violations: readonly RuleViolation[] = [gameplayViolation(code, message)],
  ): DispatchResult {
    this.#metrics = { ...this.#metrics, rejectedDispatches: this.#metrics.rejectedDispatches + 1 };
    this.#rejections.push({ requestId, code, revision: this.#state.revision, recordedAtMs: this.#ports.clock.nowMs() });
    this.#log('INFO', code);
    return {
      status: 'REJECTED', requestId, revision: this.#state.revision,
      events: [], violations, pendingDecision: null, warnings: [],
    };
  }

  #remember(requestId: DispatchResult['requestId'], result: DispatchResult): DispatchResult {
    const stored = cloneValue(result);
    this.#requests.set(String(requestId), stored);
    return cloneValue(stored);
  }

  #fault(requestId: DispatchResult['requestId'], code: string): DispatchResult {
    this.#lifecycle = 'FAULTED';
    this.#fatalCode = code;
    this.#log('ERROR', code);
    this.#notify({ kind: 'FAULTED', code, revision: this.#state.revision });
    return this.#remember(requestId, {
      status: 'FATAL', requestId, revision: this.#state.revision, events: [],
      violations: [gameplayViolation(code, 'Gameplay session entered fault isolation.')],
      pendingDecision: null, warnings: [],
    });
  }

  #notify(notification: SessionNotification) {
    const warnings: Array<{ code: 'SUBSCRIBER_FAILURE'; message: string }> = [];
    for (const listener of [...this.#listeners]) {
      try { listener(cloneValue(notification)); }
      catch {
        this.#metrics = { ...this.#metrics, subscriberFailures: this.#metrics.subscriberFailures + 1 };
        warnings.push({ code: 'SUBSCRIBER_FAILURE', message: 'A subscriber failed; committed state was preserved.' });
        this.#log('WARN', 'SUBSCRIBER_FAILURE');
      }
    }
    return warnings;
  }

  #log(level: 'INFO' | 'WARN' | 'ERROR', code: string): void {
    try {
      this.#ports.logger.write({
        level, code, sessionId: this.#id, revision: this.#state.revision,
        recordedAtMs: this.#ports.clock.nowMs(),
      });
    } catch { /* Logging is observational and cannot affect session behavior. */ }
  }

  subscribe = (listener: SessionListener): Unsubscribe => {
    this.#listeners.add(listener);
    let active = true;
    return () => {
      if (active) this.#listeners.delete(listener);
      active = false;
    };
  };

  getHistory = (query: HistoryQuery): HistoryPage => cloneValue(queryHistory(this.#history, query));

  getDiagnostics = (): SessionDiagnostics => ({
    lifecycle: this.#lifecycle, revision: this.#state.revision, stateHash: this.#stateHash,
    pendingDecisionKind: this.#state.pendingDecision?.kind ?? null,
    historyLength: this.#history.length, rejections: this.#rejections.map((entry) => ({ ...entry })),
    metrics: { ...this.#metrics }, fatalCode: this.#fatalCode,
  });

  #lifecycleOperation(expected: SessionLifecycle, next: SessionLifecycle, code: string): GameplayOperationResult {
    if (this.#lifecycle !== expected) return { ok: false, code: 'INVALID_LIFECYCLE_TRANSITION', lifecycle: this.#lifecycle, revision: this.#state.revision };
    this.#lifecycle = next;
    this.#notify({ kind: 'LIFECYCLE_CHANGED', lifecycle: next, revision: this.#state.revision });
    return { ok: true, code, lifecycle: next, revision: this.#state.revision };
  }

  start = () => this.#lifecycleOperation('READY', 'ACTIVE', 'SESSION_STARTED');
  pause = () => this.#lifecycleOperation('ACTIVE', 'PAUSED', 'SESSION_PAUSED');
  resume = () => this.#lifecycleOperation('PAUSED', 'ACTIVE', 'SESSION_RESUMED');

  beginHandoff = (fromSeatId: SeatId, toSeatId: SeatId): HandoffToken => {
    this.#binding(fromSeatId);
    this.#binding(toSeatId);
    if (this.#handoff !== null || fromSeatId !== this.#activeSeatId || fromSeatId === toSeatId) {
      throw new GameplayFailure({ code: 'HANDOFF_INVALID', message: 'Hot-seat handoff request is invalid.', path: [] });
    }
    const parsed = parseHandoffToken(`handoff:${this.#id}:${this.#state.revision}:${toSeatId}`);
    if (!parsed.ok) throw new GameplayFailure(parsed.error);
    this.#handoff = { token: parsed.value, toSeatId };
    this.#notify({ kind: 'PRIVACY_HANDOFF', locked: true, activeSeatId: this.#activeSeatId, revision: this.#state.revision });
    return parsed.value;
  };

  completeHandoff = (token: HandoffToken): GameplayOperationResult => {
    if (!this.#handoff || this.#handoff.token !== token) {
      return { ok: false, code: 'HANDOFF_INVALID', lifecycle: this.#lifecycle, revision: this.#state.revision };
    }
    this.#activeSeatId = this.#handoff.toSeatId;
    this.#handoff = null;
    this.#notify({ kind: 'PRIVACY_HANDOFF', locked: false, activeSeatId: this.#activeSeatId, revision: this.#state.revision });
    return { ok: true, code: 'HANDOFF_COMPLETED', lifecycle: this.#lifecycle, revision: this.#state.revision };
  };

  createCheckpoint = (label = ''): CheckpointDescriptor => {
    if (this.#lifecycle === 'FAULTED' || this.#lifecycle === 'CLOSED') {
      throw new GameplayFailure({ code: 'SESSION_NOT_AVAILABLE', message: 'Session cannot create a checkpoint.', path: [] });
    }
    const snapshot = serializeGameState(this.#state);
    if (!snapshot.ok) throw new GameplayFailure({ code: 'SAVE_INVALID', message: 'Current state cannot be serialized.', path: [] });
    const parsed = parseCheckpointId(`checkpoint:${this.#id}:${String(++this.#checkpointSequence).padStart(4, '0')}`);
    if (!parsed.ok) throw new GameplayFailure(parsed.error);
    const checkpoint: GameplaySaveCheckpoint = {
      id: parsed.value, label, actionIndex: this.#history.length,
      revision: this.#state.revision, stateHash: this.#stateHash, snapshot: snapshot.value,
    };
    this.#checkpoints.push(checkpoint);
    const { snapshot: _, ...descriptor } = checkpoint;
    return descriptor;
  };

  listCheckpoints = (): readonly CheckpointDescriptor[] => this.#checkpoints.map(({ snapshot: _, ...checkpoint }) => ({ ...checkpoint }));

  removeCheckpoint = (checkpointId: CheckpointDescriptor['id']): boolean => {
    const before = this.#checkpoints.length;
    this.#checkpoints = this.#checkpoints.filter(({ id }) => id !== checkpointId);
    return this.#checkpoints.length !== before;
  };

  undoTo = (checkpointId: CheckpointDescriptor['id']): Promise<GameplayOperationResult> => this.#enqueue(async () => {
    const checkpoint = this.#checkpoints.find(({ id }) => id === checkpointId);
    if (!checkpoint) return { ok: false, code: 'CHECKPOINT_NOT_FOUND', lifecycle: this.#lifecycle, revision: this.#state.revision };
    const parsed = parseGameStateJson(checkpoint.snapshot);
    if (!parsed.ok) return { ok: false, code: 'CHECKPOINT_CORRUPTED', lifecycle: this.#lifecycle, revision: this.#state.revision };
    const hash = await hashGameState(parsed.value);
    if (!hash.ok || hash.value !== checkpoint.stateHash) return { ok: false, code: 'CHECKPOINT_HASH_MISMATCH', lifecycle: this.#lifecycle, revision: this.#state.revision };
    this.#state = parsed.value;
    this.#stateHash = hash.value;
    this.#history = this.#history.slice(0, checkpoint.actionIndex);
    this.#checkpoints = this.#checkpoints.filter(({ actionIndex }) => actionIndex <= checkpoint.actionIndex);
    this.#acceptedActionIds = new Set(this.#history.map(({ action }) => String(action.actionId)));
    this.#requests.clear();
    this.#handoff = null;
    this.#lifecycle = this.#state.sequence.phase === 'COMPLETE' ? 'FINISHED' : 'PAUSED';
    this.#notify({ kind: 'CHECKPOINT_RESTORED', checkpointId, revision: this.#state.revision });
    return { ok: true, code: 'CHECKPOINT_RESTORED', lifecycle: this.#lifecycle, revision: this.#state.revision };
  });

  save = (): GameplaySaveEnvelope => {
    if (this.#lifecycle === 'FAULTED' || this.#lifecycle === 'CLOSED') {
      throw new GameplayFailure({ code: 'SESSION_NOT_AVAILABLE', message: 'Faulted or closed session cannot be saved.', path: [] });
    }
    const initial = serializeGameState(this.#initialState);
    const current = serializeGameState(this.#state);
    if (!initial.ok || !current.ok) throw new GameplayFailure({ code: 'SAVE_INVALID', message: 'Authoritative state cannot be serialized.', path: [] });
    return {
      schemaVersion: 1, gameplayVersion: GAMEPLAY_SAVE_VERSION, sessionId: this.#id,
      label: this.#label, createdAtMs: this.#createdAtMs,
      lifecycle: this.#lifecycle, activeSeatId: this.#activeSeatId,
      bindings: this.#bindings.map((binding) => ({ ...binding })),
      scenarioHash: this.#scenarioHash, initialStateHash: this.#initialStateHash,
      finalStateHash: this.#stateHash, initialSnapshot: initial.value, currentSnapshot: current.value,
      acceptedActions: this.#history.map(({ action }) => cloneAction(action)),
      acceptedActionMetadata: this.#history.map(({ requestId, seatId, acceptedAtMs, durationMs }) => ({
        requestId, seatId, acceptedAtMs, durationMs,
      })),
      checkpoints: this.#checkpoints.map((checkpoint) => ({ ...checkpoint })),
    };
  };

  serializeSave = (): string => {
    const serialized = serializeGameplaySave(this.save());
    if (!serialized.ok) throw new GameplayFailure(serialized.error[0] ?? { code: 'SAVE_INVALID', message: 'Save serialization failed.', path: [] });
    return serialized.value;
  };

  exportReplay = (): GameplayReplayEnvelope => {
    const saved = this.save();
    return {
      schemaVersion: 1, scenarioHash: saved.scenarioHash,
      initialStateHash: saved.initialStateHash, finalStateHash: saved.finalStateHash,
      initialSnapshot: saved.initialSnapshot, actions: saved.acceptedActions,
    };
  };

  close = async (): Promise<GameplayOperationResult> => {
    await this.#dispatchTail;
    if (this.#lifecycle === 'CLOSED') return { ok: true, code: 'SESSION_ALREADY_CLOSED', lifecycle: 'CLOSED', revision: this.#state.revision };
    this.#lifecycle = 'CLOSED';
    this.#handoff = null;
    this.#listeners.clear();
    return { ok: true, code: 'SESSION_CLOSED', lifecycle: 'CLOSED', revision: this.#state.revision };
  };
}
