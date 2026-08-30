import type { ScenarioId } from '../../core/index.js';
import type { ScenarioDefinition } from '../../domain/scenario/index.js';
import { ruleEngine } from '../../rules/index.js';
import type { SessionId } from '../model.js';
import type {
  ClockPort,
  GameplayPorts,
  SaveRepositoryPort,
  ScenarioRepositoryPort,
  SessionLogEntry,
  SessionLoggerPort,
} from '../ports.js';

export interface MemoryScenarioRepository extends ScenarioRepositoryPort {
  readonly put: (scenario: ScenarioDefinition) => void;
}

export interface MemorySaveRepository extends SaveRepositoryPort {
  readonly entries: () => readonly { readonly sessionId: SessionId; readonly serializedSave: string }[];
  readonly failNextSave: (message?: string) => void;
}

export interface MemorySessionLogger extends SessionLoggerPort {
  readonly entries: () => readonly SessionLogEntry[];
}

export interface ManualClock extends ClockPort {
  readonly advance: (milliseconds: number) => void;
}

export const createMemoryScenarioRepository = (
  scenarios: readonly ScenarioDefinition[] = [],
): MemoryScenarioRepository => {
  const values = new Map<ScenarioId, ScenarioDefinition>(scenarios.map((scenario) => [scenario.id, scenario]));
  return Object.freeze({
    load: async (scenarioId: ScenarioId) => values.get(scenarioId) ?? null,
    put: (scenario: ScenarioDefinition) => { values.set(scenario.id, scenario); },
  });
};

export const createMemorySaveRepository = (): MemorySaveRepository => {
  const values = new Map<SessionId, string>();
  let failure: string | null = null;
  return Object.freeze({
    save: async (sessionId: SessionId, serializedSave: string) => {
      if (failure !== null) {
        const message = failure;
        failure = null;
        throw new Error(message);
      }
      values.set(sessionId, serializedSave);
    },
    load: async (sessionId: SessionId) => values.get(sessionId) ?? null,
    entries: () => [...values].map(([sessionId, serializedSave]) => ({ sessionId, serializedSave })),
    failNextSave: (message = 'Injected memory-save failure.') => { failure = message; },
  });
};

export const createManualClock = (initialMs = 0): ManualClock => {
  let current = initialMs;
  return Object.freeze({
    nowMs: () => current,
    advance: (milliseconds: number) => { current += milliseconds; },
  });
};

export const createMemorySessionLogger = (): MemorySessionLogger => {
  const values: SessionLogEntry[] = [];
  return Object.freeze({
    write: (entry: SessionLogEntry) => { values.push({ ...entry }); },
    entries: () => values.map((entry) => ({ ...entry })),
  });
};

export const createMemoryGameplayPorts = (
  scenarios: readonly ScenarioDefinition[] = [],
  clock: ClockPort = createManualClock(),
): GameplayPorts => ({
  rules: ruleEngine,
  scenarios: createMemoryScenarioRepository(scenarios),
  saves: createMemorySaveRepository(),
  clock,
  logger: createMemorySessionLogger(),
});
