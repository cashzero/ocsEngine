import { hashScenarioDefinition } from '../serialization/index.js';
import type { ScenarioDefinition } from '../domain/scenario/index.js';
import {
  createInitialGameState,
  hashGameState,
  parseGameStateJson,
  serializeGameState,
  type GameState,
} from '../rules/index.js';
import { formatHistorySummary } from './history.js';
import { parseSessionId } from './ids.js';
import { GAMEPLAY_SAVE_VERSION, parseGameplaySave } from './persistence.js';
import { migrateLegacySave } from './migration.js';
import { GameplayFailure, GameplaySession } from './session.js';
import type { GameplayPorts } from './ports.js';
import type {
  CreateSessionRequest,
  CreateStoredSessionRequest,
  GameSession,
  GameplayEngine,
  GameplayError,
  GameplaySaveEnvelope,
  HistoryRecord,
  SeatBinding,
  SessionId,
} from './model.js';

const failure = (code: GameplayError['code'], message: string, path: readonly (string | number)[] = []) =>
  new GameplayFailure({ code, message, path });

const validateBindings = (
  scenario: ScenarioDefinition,
  bindings: readonly SeatBinding[],
): void => {
  const seats = bindings.map(({ seatId }) => seatId);
  const players = bindings.map(({ playerId }) => playerId);
  const expected = scenario.players.map(({ id }) => id);
  if (bindings.length !== expected.length
    || new Set(seats).size !== seats.length
    || new Set(players).size !== players.length
    || expected.some((id) => !players.includes(id))) {
    throw failure('INVALID_BINDINGS', 'Bindings must map every Scenario Player to one unique Seat.', ['bindings']);
  }
};

const stateHash = async (state: GameState) => {
  const hashed = await hashGameState(state);
  if (!hashed.ok) throw failure('SCENARIO_INCOMPATIBLE', 'GameState hash could not be computed.');
  return hashed.value;
};

export class DefaultGameplayEngine implements GameplayEngine {
  readonly #ports: GameplayPorts;
  #sequence = 0;

  constructor(ports: GameplayPorts) { this.#ports = ports; }

  #nextSessionId(scenario: ScenarioDefinition): SessionId {
    const parsed = parseSessionId(`session:${scenario.id}:${String(++this.#sequence).padStart(4, '0')}`);
    if (!parsed.ok) throw new GameplayFailure(parsed.error);
    return parsed.value;
  }

  createSession = async (request: CreateSessionRequest): Promise<GameSession> => {
    validateBindings(request.scenario, request.bindings);
    if (!Number.isSafeInteger(request.rulesSeed) || request.rulesSeed < 0 || request.rulesSeed > 0xffff_ffff) {
      throw failure('SCENARIO_INCOMPATIBLE', 'Rules seed must be uint32.', ['rulesSeed']);
    }
    const created = createInitialGameState(request.scenario, request.configuration, request.rulesSeed);
    if (!created.ok) throw failure(
      'SCENARIO_INCOMPATIBLE',
      `Scenario bootstrap failed: ${created.error.map(({ code }) => code).join(',')}.`,
    );
    const detachedSnapshot = serializeGameState(created.value);
    const detached = detachedSnapshot.ok ? parseGameStateJson(detachedSnapshot.value) : detachedSnapshot;
    if (!detached.ok) throw failure('SCENARIO_INCOMPATIBLE', 'Bootstrap state could not be canonically detached.');
    const scenarioHash = await hashScenarioDefinition(detached.value.scenario);
    if (!scenarioHash.ok) throw failure('SCENARIO_INCOMPATIBLE', 'Scenario hash could not be computed.');
    const initialHash = await stateHash(detached.value);
    return new GameplaySession({
      id: this.#nextSessionId(request.scenario), label: request.label,
      createdAtMs: this.#ports.clock.nowMs(), lifecycle: 'READY',
      activeSeatId: request.bindings[0]!.seatId,
      bindings: request.bindings, scenarioHash: scenarioHash.value,
      initialStateHash: initialHash, stateHash: initialHash,
      initialState: detached.value, state: detached.value, history: [], checkpoints: [],
      ports: this.#ports, persistence: request.persistence ?? 'AUTOSAVE',
    });
  };

  createStoredSession = async (request: CreateStoredSessionRequest): Promise<GameSession> => {
    const scenario = await this.#ports.scenarios.load(request.scenarioId);
    if (!scenario) throw failure('SCENARIO_NOT_FOUND', `Scenario ${request.scenarioId} was not found.`, ['scenarioId']);
    const { scenarioId: _, ...configuration } = request;
    return this.createSession({ ...configuration, scenario });
  };

  loadSession = async (serializedSave: string): Promise<GameSession> => {
    const parsedSave = parseGameplaySave(serializedSave);
    if (!parsedSave.ok) throw new GameplayFailure(parsedSave.error[0] ?? {
      code: 'SAVE_INVALID', message: 'Save parsing failed.', path: [],
    });
    const save = parsedSave.value.gameplayVersion !== GAMEPLAY_SAVE_VERSION ? await migrateLegacySave(parsedSave.value) : parsedSave.value;
    const loadedSequence = /:(\d+)$/u.exec(String(save.sessionId));
    if (loadedSequence) this.#sequence = Math.max(this.#sequence, Number(loadedSequence[1]));
    const initial = parseGameStateJson(save.initialSnapshot);
    const current = parseGameStateJson(save.currentSnapshot);
    if (!initial.ok || !current.ok) throw failure('SAVE_INVALID', 'Save contains an invalid GameState snapshot.');
    validateBindings(initial.value.scenario, save.bindings);
    if (!save.bindings.some(({ seatId }) => seatId === save.activeSeatId)) {
      throw failure('INVALID_BINDINGS', 'Active Seat is not bound.', ['activeSeatId']);
    }
    const scenarioHash = await hashScenarioDefinition(initial.value.scenario);
    const initialHash = await hashGameState(initial.value);
    if (!scenarioHash.ok || scenarioHash.value !== save.scenarioHash
      || !initialHash.ok || initialHash.value !== save.initialStateHash) {
      throw failure('SAVE_REPLAY_MISMATCH', 'Save source or initial-state hash does not match.');
    }

    let replayState = initial.value;
    const history: HistoryRecord[] = [];
    const states = new Map<number, GameState>([[0, replayState]]);
    for (const [index, action] of save.acceptedActions.entries()) {
      const transition = this.#ports.rules.applyAction(replayState, action);
      if (!transition.ok) throw failure('SAVE_REPLAY_MISMATCH', `Replay rejected action ${index}.`, ['acceptedActions', index]);
      const metadata = save.acceptedActionMetadata[index]!;
      const seat = save.bindings.find(({ seatId }) => seatId === metadata.seatId);
      if (!seat || seat.playerId !== action.actorId) {
        throw failure('SAVE_REPLAY_MISMATCH', 'Saved dispatch Seat does not match Action actor.', ['acceptedActionMetadata', index, 'seatId']);
      }
      history.push({
        sequence: index, requestId: metadata.requestId, seatId: seat.seatId,
        action, events: transition.events,
        revisionBefore: replayState.revision, revisionAfter: transition.state.revision,
        acceptedAtMs: metadata.acceptedAtMs, durationMs: metadata.durationMs,
        summary: formatHistorySummary(action, transition.events),
      });
      replayState = transition.state;
      states.set(index + 1, replayState);
    }
    const replaySerialized = serializeGameState(replayState);
    const currentSerialized = serializeGameState(current.value);
    const finalHash = await hashGameState(replayState);
    if (!replaySerialized.ok || !currentSerialized.ok
      || replaySerialized.value !== currentSerialized.value
      || !finalHash.ok || finalHash.value !== save.finalStateHash) {
      throw failure('SAVE_REPLAY_MISMATCH', 'Current snapshot does not match deterministic action replay.');
    }
    await this.#validateCheckpoints(save, states);
    if ((save.lifecycle === 'FINISHED') !== (replayState.sequence.phase === 'COMPLETE')) {
      throw failure('SAVE_REPLAY_MISMATCH', 'Saved lifecycle disagrees with Rule Engine completion.');
    }
    return new GameplaySession({
      id: save.sessionId, label: save.label, createdAtMs: save.createdAtMs,
      lifecycle: save.lifecycle, activeSeatId: save.activeSeatId,
      bindings: save.bindings, scenarioHash: save.scenarioHash,
      initialStateHash: save.initialStateHash, stateHash: save.finalStateHash,
      initialState: initial.value, state: replayState, history,
      checkpoints: save.checkpoints, ports: this.#ports,
    });
  };

  loadStoredSession = async (sessionId: SessionId): Promise<GameSession> => {
    const serialized = await this.#ports.saves.load(sessionId);
    if (serialized === null) throw failure('SAVE_NOT_FOUND', `Save ${sessionId} was not found.`, ['sessionId']);
    return this.loadSession(serialized);
  };

  async #validateCheckpoints(
    save: GameplaySaveEnvelope,
    states: ReadonlyMap<number, GameState>,
  ): Promise<void> {
    for (const [index, checkpoint] of save.checkpoints.entries()) {
      const expected = states.get(checkpoint.actionIndex);
      const parsed = parseGameStateJson(checkpoint.snapshot);
      if (!expected || !parsed.ok || parsed.value.revision !== checkpoint.revision) {
        throw failure('SAVE_REPLAY_MISMATCH', 'Checkpoint position or revision is invalid.', ['checkpoints', index]);
      }
      const expectedSnapshot = serializeGameState(expected);
      const actualSnapshot = serializeGameState(parsed.value);
      const actualHash = await hashGameState(parsed.value);
      if (!expectedSnapshot.ok || !actualSnapshot.ok
        || expectedSnapshot.value !== actualSnapshot.value
        || !actualHash.ok || actualHash.value !== checkpoint.stateHash) {
        throw failure('SAVE_REPLAY_MISMATCH', 'Checkpoint does not match replay prefix.', ['checkpoints', index]);
      }
    }
  }
}

export const createGameplayEngine = (ports: GameplayPorts): GameplayEngine =>
  new DefaultGameplayEngine(ports);
