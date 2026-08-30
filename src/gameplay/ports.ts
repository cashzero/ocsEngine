import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { ScenarioId } from '../core/index.js';
import type { RuleEngine } from '../rules/index.js';
import type { SessionId } from './model.js';

export type RuleEnginePort = RuleEngine;

export interface ScenarioRepositoryPort {
  readonly load: (scenarioId: ScenarioId) => Promise<ScenarioDefinition | null>;
}

export interface SaveRepositoryPort {
  readonly save: (sessionId: SessionId, serializedSave: string) => Promise<void>;
  readonly load: (sessionId: SessionId) => Promise<string | null>;
}

export interface ClockPort {
  readonly nowMs: () => number;
}

export interface SessionLogEntry {
  readonly level: 'INFO' | 'WARN' | 'ERROR';
  readonly code: string;
  readonly sessionId: SessionId;
  readonly revision: number;
  readonly recordedAtMs: number;
}

export interface SessionLoggerPort {
  readonly write: (entry: SessionLogEntry) => void;
}

export interface GameplayPorts {
  readonly rules: RuleEnginePort;
  readonly scenarios: ScenarioRepositoryPort;
  readonly saves: SaveRepositoryPort;
  readonly clock: ClockPort;
  readonly logger: SessionLoggerPort;
}
