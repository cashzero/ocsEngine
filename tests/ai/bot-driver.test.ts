import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  createBotRng,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createRandomLegalPolicy,
  prepareNewGame,
  runBotMatch,
  type BotDecisionTrace,
  type GameSession,
  type SeatBinding,
} from '../../src/index.js';

const startGame = async (turnLimit: number) => {
  const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit });
  if (!prepared.ok) throw new Error('game did not generate');
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const session = await engine.createSession({
    scenario: prepared.value.scenario, configuration: prepared.value.configuration,
    rulesSeed: DEFAULT_NEW_GAME_REQUEST.seeds.rules, bindings: prepared.value.bindings, label: 'bot test', persistence: 'MANUAL',
  });
  session.start();
  return { engine, session, bindings: prepared.value.bindings };
};

const botMatch = async (session: GameSession, bindings: readonly SeatBinding[], traces?: BotDecisionTrace[]) =>
  runBotMatch({
    session,
    seats: bindings.map(({ seatId, playerId }, index) => ({ seatId, playerId, policy: createRandomLegalPolicy(), seed: 1000 + index })),
    maxActions: 2_000,
    ...(traces ? { onDecision: (trace: BotDecisionTrace) => { traces.push(trace); } } : {}),
  });

describe('bot match driver', () => {
  it('plays both seats of a generated game to the end through legal actions only, and the save replays', async () => {
    const { engine, session, bindings } = await startGame(2);
    const traces: BotDecisionTrace[] = [];
    const result = await botMatch(session, bindings, traces);

    expect(result.stopReason).toBe('FINISHED');
    expect(result.errors).toEqual([]);
    expect(result.rejected).toBe(0);
    expect(session.getMetadata().lifecycle).toBe('FINISHED');
    // Defending and sequence decisions are answered by their owner, whoever is phasing.
    expect(new Set(traces.filter(({ kind }) => kind === 'DECISION').map(({ seatId }) => seatId)).size).toBeGreaterThan(0);
    const loaded = await engine.loadSession(session.serializeSave());
    expect(loaded.getMetadata().stateHash).toBe(session.getMetadata().stateHash);
  }, 120_000);

  it('makes the same choices from the same seeds', async () => {
    const first = await startGame(1);
    const second = await startGame(1);
    await botMatch(first.session, first.bindings);
    await botMatch(second.session, second.bindings);
    expect(second.session.getMetadata().stateHash).toBe(first.session.getMetadata().stateHash);
  }, 120_000);
});

describe('bot random numbers', () => {
  it('derive from seed, state and ordinal only', () => {
    const draw = (seed: number, hash: string, ordinal: number) => {
      const rng = createBotRng(seed, hash, ordinal);
      return [rng.next(), rng.next(), rng.index(7)];
    };
    expect(draw(1, 'sha256:a', 0)).toEqual(draw(1, 'sha256:a', 0));
    expect(draw(1, 'sha256:a', 0)).not.toEqual(draw(2, 'sha256:a', 0));
    expect(draw(1, 'sha256:a', 0)).not.toEqual(draw(1, 'sha256:b', 0));
    expect(draw(1, 'sha256:a', 0)).not.toEqual(draw(1, 'sha256:a', 1));
    const rng = createBotRng(3, 'sha256:c', 0);
    for (let index = 0; index < 1_000; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(rng.weighted([{ value: 'a', weight: 0 }, { value: 'b', weight: 1 }])).toBe('b');
    expect(rng.weighted([{ value: 'a', weight: 0 }])).toBeNull();
  });
});
