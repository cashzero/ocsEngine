import type { PlayerId } from '../core/index.js';
import {
  createGameplayEngine,
  createManualClock,
  createMemorySaveRepository,
  createMemoryScenarioRepository,
  createMemorySessionLogger,
  parseDispatchRequestId,
  parseSeatId,
  type DefaultGameplayEngine,
  type GameSession,
  type GameplayPorts,
  type MemorySaveRepository,
  type MemorySessionLogger,
  type SeatId,
} from '../gameplay/index.js';
import { ruleEngine } from '../rules/index.js';
import { createRuleConfigurationFixture, createRuleGameStateFixture } from './rule-fixtures.js';

const seat = (value: string): SeatId => {
  const parsed = parseSeatId(value);
  if (!parsed.ok) throw new Error('Invalid Gameplay fixture Seat ID.');
  return parsed.value;
};

export interface GameplayFixture {
  readonly engine: ReturnType<typeof createGameplayEngine>;
  readonly session: GameSession;
  readonly ports: GameplayPorts;
  readonly saves: MemorySaveRepository;
  readonly logger: MemorySessionLogger;
  readonly seats: readonly [SeatId, SeatId];
  readonly players: readonly [PlayerId, PlayerId];
}

export const createGameplayFixture = async (): Promise<GameplayFixture> => {
  const scenario = createRuleGameStateFixture().scenario;
  const players = [scenario.players[0]!.id, scenario.players[1]!.id] as const;
  const seats = [seat('seat:one'), seat('seat:two')] as const;
  const saves = createMemorySaveRepository();
  const logger = createMemorySessionLogger();
  const ports: GameplayPorts = {
    rules: ruleEngine,
    scenarios: createMemoryScenarioRepository([scenario]),
    saves,
    clock: createManualClock(1_000),
    logger,
  };
  const engine = createGameplayEngine(ports);
  const session = await engine.createSession({
    scenario, configuration: createRuleConfigurationFixture(), rulesSeed: 6,
    bindings: [
      { seatId: seats[0], playerId: players[0], label: 'First seat' },
      { seatId: seats[1], playerId: players[1], label: 'Second seat' },
    ],
    label: 'Synthetic Gameplay fixture',
  });
  return { engine, session, ports, saves, logger, seats, players };
};

export const gameplayRequestId = (value: string) => {
  const parsed = parseDispatchRequestId(`request:${value}`);
  if (!parsed.ok) throw new Error('Invalid Gameplay fixture request ID.');
  return parsed.value;
};
