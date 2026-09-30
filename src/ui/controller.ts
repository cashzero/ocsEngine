import type { ScenarioDefinition } from '../domain/scenario/index.js';
import {
  parseDispatchRequestId,
  type GameSession,
  type GameplayEngine,
  type HandoffToken,
  type SeatBinding,
  type SeatId,
} from '../gameplay/index.js';
import type { GameAction } from '../rules/index.js';
import type { UiListener, UiSelection, UiSnapshot } from './model.js';

export interface UiControllerOptions {
  readonly engine: GameplayEngine;
  readonly session: GameSession;
  readonly scenario: ScenarioDefinition;
  readonly bindings: readonly SeatBinding[];
}

export interface UiController {
  readonly getSnapshot: () => UiSnapshot;
  readonly subscribe: (listener: UiListener) => () => void;
  readonly selectHex: (hexId: string | null) => void;
  readonly selectPiece: (pieceId: string | null) => void;
  readonly selectActionKind: (kind: GameAction['kind']) => void;
  readonly selectCandidate: (index: number) => void;
  readonly selectDestination: (hexId: string | null) => void;
  readonly loadMoreCandidates: () => void;
  readonly executeSelected: () => Promise<void>;
  readonly respondToDecision: (choiceId: string) => Promise<void>;
  readonly start: () => void;
  readonly togglePause: () => void;
  readonly createCheckpoint: () => void;
  readonly undoTo: (checkpointId: string) => Promise<void>;
  readonly serializeSave: () => string;
  readonly serializeReplay: () => string;
  readonly loadSave: (serialized: string) => Promise<void>;
  readonly beginHandoff: () => void;
  readonly completeHandoff: () => void;
  readonly dispose: () => void;
}

const initialSelection = (): UiSelection => ({
  hexId: null, pieceId: null, actionKind: null, candidateIndex: 0, destinationHexId: null,
});

const MOVE_KIND = 'MOVE_PIECE';

class DefaultUiController implements UiController {
  readonly #engine: GameplayEngine;
  readonly #scenario: ScenarioDefinition;
  readonly #bindings: readonly SeatBinding[];
  #session: GameSession;
  #selection = initialSelection();
  #listeners = new Set<UiListener>();
  #unsubscribeSession: (() => void) | null = null;
  #notice = 'Scenario ready. Start the session when you are ready.';
  #busy = false;
  #requestSequence = 0;
  #candidateBudget = 24;
  #handoffToken: HandoffToken | null = null;
  // Rule queries depend only on these inputs, so repeated emits (hover, list, destination
  // clicks) reuse them instead of recomputing legality for every render.
  #queryCache = new Map<string, unknown>();
  #queryCacheRevision = '';

  constructor(options: UiControllerOptions) {
    this.#engine = options.engine;
    this.#session = options.session;
    this.#scenario = options.scenario;
    this.#bindings = options.bindings.map((binding) => ({ ...binding }));
    this.#notice = options.session.getMetadata().lifecycle === 'ACTIVE'
      ? 'Generated scenario is active. Select a legal action to play.'
      : 'Scenario ready. Start the session when you are ready.';
    this.#bindSession();
  }

  #bindSession(): void {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = this.#session.subscribe(() => this.#emit());
  }

  #activeSeat(): SeatId { return this.#session.getMetadata().activeSeatId; }

  #cached<T>(key: string, compute: () => T): T {
    const metadata = this.#session.getMetadata();
    const scope = `${this.#session.getRevision()}|${metadata.lifecycle}|${metadata.activeSeatId}|${this.#handoffToken ?? ''}`;
    if (scope !== this.#queryCacheRevision) { this.#queryCache.clear(); this.#queryCacheRevision = scope; }
    if (!this.#queryCache.has(key)) this.#queryCache.set(key, compute());
    return this.#queryCache.get(key) as T;
  }

  #candidateState() {
    const seatId = this.#activeSeat();
    const view = this.#session.getView(seatId);
    const families = this.#cached('families', () => this.#session.getActionFamilies(seatId));
    const requestedKind = this.#selection.actionKind;
    const kind = requestedKind !== null && families.some((family) => family.kind === requestedKind && family.enabled)
      ? requestedKind
      : families.find(({ enabled }) => enabled)?.kind ?? requestedKind;
    const isMove = kind === MOVE_KIND;
    const needsPieceSelection = isMove && this.#selection.pieceId === null;
    // Movement shows the complete legal range on the map, so it is never truncated.
    const budget = isMove ? Number.MAX_SAFE_INTEGER : this.#candidateBudget;
    const result = kind === null || needsPieceSelection
      ? { actions: [] as readonly GameAction[], truncated: false }
      : this.#cached(`candidates|${kind}|${this.#selection.pieceId}|${budget}`, () => this.#session.getActionCandidates(seatId, {
        kind,
        pieceId: this.#selection.pieceId as Parameters<GameSession['getActionCandidates']>[1]['pieceId'],
        budget,
      }));
    const index = isMove
      ? result.actions.findIndex((action) => action.kind === MOVE_KIND && action.path.at(-1) === this.#selection.destinationHexId)
      : Math.min(this.#selection.candidateIndex, Math.max(0, result.actions.length - 1));
    const selectedAction = result.actions[index] ?? null;
    const explanation = selectedAction === null
      ? null
      : this.#cached(`explain|${selectedAction.actionId}|${index}`, () =>
        this.#session.validateDraft(this.#session.createDraft(seatId, selectedAction)).explanation);
    return { view, families, kind, candidates: result.actions, truncated: result.truncated, index, selectedAction, explanation };
  }

  getSnapshot = (): UiSnapshot => {
    const state = this.#candidateState();
    const decisionOwner = this.#bindings.find(({ seatId }) => this.#session.getPendingDecision(seatId) !== null);
    const sequenceOwner = this.#bindings.find(({ playerId }) =>
      playerId === state.view.projection?.sequence.actingPlayerId);
    return {
      scenario: this.#scenario,
      view: state.view,
      bindings: this.#bindings,
      families: state.families,
      candidates: state.candidates,
      candidatesTruncated: state.truncated,
      selectedAction: state.selectedAction,
      explanation: state.explanation,
      selection: { ...this.#selection, actionKind: state.kind, candidateIndex: state.index },
      history: this.#session.getHistory({ offset: 0, limit: 200, actionKind: null }).records,
      checkpoints: this.#session.listCheckpoints(),
      notice: this.#notice,
      busy: this.#busy,
      handoffPending: this.#handoffToken !== null,
      requiredSeatId: decisionOwner?.seatId ?? sequenceOwner?.seatId ?? null,
    };
  };

  #emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }

  subscribe = (listener: UiListener): (() => void) => {
    this.#listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.#listeners.delete(listener);
  };

  selectHex = (hexId: string | null): void => {
    this.#selection = { ...this.#selection, hexId, pieceId: null, candidateIndex: 0, destinationHexId: null };
    this.#emit();
  };

  selectPiece = (pieceId: string | null): void => {
    this.#candidateBudget = 24;
    this.#selection = { ...this.#selection, pieceId, candidateIndex: 0, destinationHexId: null };
    this.#emit();
  };

  selectActionKind = (kind: GameAction['kind']): void => {
    this.#candidateBudget = 24;
    this.#selection = { ...this.#selection, actionKind: kind, candidateIndex: 0, destinationHexId: null };
    this.#emit();
  };

  selectCandidate = (candidateIndex: number): void => {
    this.#selection = { ...this.#selection, candidateIndex: Math.max(0, candidateIndex) };
    this.#emit();
  };

  selectDestination = (hexId: string | null): void => {
    this.#selection = { ...this.#selection, destinationHexId: hexId };
    this.#emit();
  };

  loadMoreCandidates = (): void => { this.#candidateBudget += 24; this.#emit(); };

  async #run(operation: () => Promise<string>): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.#emit();
    try { this.#notice = await operation(); }
    catch (error) { this.#notice = error instanceof Error ? error.message : 'Unexpected UI operation failure.'; }
    finally { this.#busy = false; this.#emit(); }
  }

  #requestId() {
    const parsed = parseDispatchRequestId(`ui:request:${String(++this.#requestSequence).padStart(6, '0')}`);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  }

  executeSelected = async (): Promise<void> => this.#run(async () => {
    const action = this.#candidateState().selectedAction;
    if (action === null) return 'No legal action candidate is selected.';
    const result = await this.#session.dispatch({
      requestId: this.#requestId(), seatId: this.#activeSeat(), action,
    });
    const movedTo = result.status === 'ACCEPTED' && action.kind === 'MOVE_PIECE' ? action.path.at(-1) ?? null : null;
    this.#selection = {
      ...this.#selection, candidateIndex: 0, destinationHexId: null,
      hexId: movedTo ?? this.#selection.hexId,
    };
    if (result.status === 'ACCEPTED' && result.pendingDecision !== null) {
      const owner = this.#bindings.find(({ seatId }) => this.#session.getPendingDecision(seatId) !== null);
      return `${action.kind} accepted at revision ${result.revision}. Pending decision for ${owner?.label ?? 'another seat'}; hand off control.`;
    }
    return result.status === 'ACCEPTED'
      ? `${action.kind} accepted at revision ${result.revision}.`
      : `${action.kind} ${result.status.toLowerCase()}: ${result.violations.map(({ message }) => message).join(' ')}`;
  });

  respondToDecision = async (choiceId: string): Promise<void> => this.#run(async () => {
    const result = await this.#session.respondToPendingDecision(
      this.#requestId(), this.#activeSeat(), choiceId,
    );
    return result.status === 'ACCEPTED'
      ? `Decision accepted at revision ${result.revision}.`
      : `Decision ${result.status.toLowerCase()}: ${result.violations.map(({ message }) => message).join(' ') || 'No Rule violation detail was returned.'}`;
  });

  start = (): void => {
    const result = this.#session.start();
    this.#notice = result.ok ? 'Session started.' : result.code;
    this.#emit();
  };

  togglePause = (): void => {
    const lifecycle = this.#session.getMetadata().lifecycle;
    const result = lifecycle === 'PAUSED' ? this.#session.resume() : this.#session.pause();
    this.#notice = result.ok ? result.code.replaceAll('_', ' ').toLowerCase() : result.code;
    this.#emit();
  };

  createCheckpoint = (): void => {
    const checkpoint = this.#session.createCheckpoint(`Revision ${this.#session.getRevision()}`);
    this.#notice = `Checkpoint created at revision ${checkpoint.revision}.`;
    this.#emit();
  };

  undoTo = async (checkpointId: string): Promise<void> => this.#run(async () => {
    const checkpoint = this.#session.listCheckpoints().find(({ id }) => id === checkpointId);
    if (!checkpoint) return 'Checkpoint no longer exists.';
    const result = await this.#session.undoTo(checkpoint.id);
    return result.ok ? `Restored ${checkpoint.label || checkpoint.id}. Resume to continue.` : result.code;
  });

  serializeSave = (): string => this.#session.serializeSave();

  serializeReplay = (): string => JSON.stringify(this.#session.exportReplay(), null, 2);

  loadSave = async (serialized: string): Promise<void> => this.#run(async () => {
    const loaded = await this.#engine.loadSession(serialized);
    if (loaded.getMetadata().scenarioId !== this.#scenario.id) {
      await loaded.close();
      throw new Error('This UI currently accepts saves for the loaded scenario only.');
    }
    await this.#session.close();
    this.#session = loaded;
    this.#queryCache.clear();
    this.#queryCacheRevision = '';
    this.#selection = initialSelection();
    this.#handoffToken = null;
    this.#bindSession();
    return `Save loaded at revision ${loaded.getRevision()}.`;
  });

  beginHandoff = (): void => {
    const from = this.#activeSeat();
    const to = this.#bindings.find(({ seatId }) => seatId !== from)?.seatId;
    if (!to) { this.#notice = 'No second seat is available.'; this.#emit(); return; }
    this.#handoffToken = this.#session.beginHandoff(from, to);
    this.#notice = 'Privacy screen locked. Pass control to the next player.';
    this.#emit();
  };

  completeHandoff = (): void => {
    if (this.#handoffToken === null) return;
    const result = this.#session.completeHandoff(this.#handoffToken);
    if (result.ok) this.#handoffToken = null;
    this.#notice = result.ok ? 'Hot-seat handoff completed.' : result.code;
    this.#selection = initialSelection();
    this.#emit();
  };

  dispose = (): void => {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = null;
    this.#listeners.clear();
  };
}

export const createUiController = (options: UiControllerOptions): UiController =>
  new DefaultUiController(options);
