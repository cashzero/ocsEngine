import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST,
  botSeatsOf,
  createBotPolicyById,
  createBotSeatRunner,
  createGameplayEngine,
  createMemoryGameplayPorts,
  prepareNewGame,
  type BotDecisionTrace,
  type NewGameRequest,
} from '../../src/index.js';

vi.setConfig({ testTimeout: 120_000 });

const SHORT: NewGameRequest = { ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 2, oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 3, armoredDivisionsPerSide: 1 } };
const bot = (seed: number, policyId = 'heuristic') => ({ kind: 'BOT' as const, policyId, seed });

const startGame = async (seats: NewGameRequest['seats']) => {
  const prepared = prepareNewGame({ ...SHORT, ...(seats === undefined ? {} : { seats }) });
  if (!prepared.ok) throw new Error('game did not generate');
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const session = await engine.createSession({
    scenario: prepared.value.scenario, configuration: prepared.value.configuration,
    rulesSeed: SHORT.seeds.rules, bindings: prepared.value.bindings, label: 'seat runner test', persistence: 'MANUAL',
  });
  session.start();
  return { engine, session, prepared: prepared.value };
};

const runnerFor = (game: Awaited<ReturnType<typeof startGame>>, traces: BotDecisionTrace[] = []) => {
  const { seats } = botSeatsOf(game.session.getBindings(), { scenario: game.prepared.scenario, turnLimit: SHORT.turnLimit });
  return createBotSeatRunner({ session: game.session, seats, onDecision: (trace) => traces.push(trace) });
};

describe('seat runner', () => {
  it('waits when a person is to act, and acts one action at a time when a computer is', async () => {
    // Allied (a person) opens the game: the Axis computer has nothing to do yet.
    const game = await startGame({ allied: { kind: 'HUMAN' }, axis: bot(2) });
    const runner = runnerFor(game);
    expect(await runner.step()).toEqual({ kind: 'WAITING', reason: 'PERSON_TO_ACT' });

    const computerFirst = await startGame({ allied: bot(1), axis: { kind: 'HUMAN' } });
    const before = Number(computerFirst.session.getRevision());
    const step = await runnerFor(computerFirst).step();
    expect(step.kind).toBe('ACTED');
    expect(Number(computerFirst.session.getRevision())).toBe(before + 1);
  });

  it('reports a policy that finds no action as stuck and leaves the game where it stopped', async () => {
    const game = await startGame({ allied: bot(1, 'test-stall:0'), axis: { kind: 'HUMAN' } });
    const revision = game.session.getRevision();
    const step = await runnerFor(game).step();
    expect(step).toMatchObject({ kind: 'STUCK', error: { code: 'BOT_STALLED' } });
    expect(game.session.getRevision()).toBe(revision);
  });

  it('plays the same actions again from a restored checkpoint, with the step memory it had there', async () => {
    const game = await startGame({ allied: bot(5), axis: bot(6) });
    const traces: BotDecisionTrace[] = [];
    const runner = runnerFor(game, traces);
    for (let i = 0; i < 6; i += 1) expect((await runner.step()).kind).toBe('ACTED');
    // A checkpoint in the middle of a step: the policy has plans (units already handled) that must come back with it.
    const checkpoint = game.session.createCheckpoint('mid-step');
    const hashAt = game.session.getMetadata().stateHash;
    const first: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const step = await runner.step();
      if (step.kind !== 'ACTED') throw new Error(`unexpected ${step.kind}`);
      first.push(JSON.stringify(step.trace.action, (key, value) => key === 'actionId' || key === 'expectedRevision' ? undefined : value));
    }
    const hashAfter = game.session.getMetadata().stateHash;
    expect((await game.session.undoTo(checkpoint.id)).ok).toBe(true);
    game.session.resume();
    expect(game.session.getMetadata().stateHash).toBe(hashAt);
    const second: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const step = await runner.step();
      if (step.kind !== 'ACTED') throw new Error(`unexpected ${step.kind}`);
      second.push(JSON.stringify(step.trace.action, (key, value) => key === 'actionId' || key === 'expectedRevision' ? undefined : value));
    }
    expect(second).toEqual(first);
    expect(game.session.getMetadata().stateHash).toBe(hashAfter);
  });

  it('keeps its request IDs apart from an earlier runner on the same game', async () => {
    const game = await startGame({ allied: bot(1), axis: bot(2) });
    const { seats } = botSeatsOf(game.session.getBindings(), { scenario: game.prepared.scenario, turnLimit: SHORT.turnLimit });
    const first = createBotSeatRunner({ session: game.session, seats, nonce: 'a' });
    for (let i = 0; i < 3; i += 1) await first.step();
    // A page that loaded this game starts a new runner: its first request must not be refused as a repeat.
    const second = createBotSeatRunner({ session: game.session, seats, nonce: 'b' });
    expect((await second.step()).kind).toBe('ACTED');
  });
});

describe('policy registry', () => {
  it('builds the policies a save may name and refuses ones it does not know', () => {
    const prepared = prepareNewGame(SHORT);
    if (!prepared.ok) throw new Error('game did not generate');
    const facts = { scenario: prepared.value.scenario, turnLimit: 2 };
    expect(createBotPolicyById('heuristic', facts)?.id).toBe('heuristic');
    expect(createBotPolicyById('random-legal', facts)?.id).toBe('random-legal');
    expect(createBotPolicyById('test-stall:12', facts)?.id).toBe('test-stall:12');
    expect(createBotPolicyById('test-stall:x', facts)).toBeNull();
    expect(createBotPolicyById('no-such-policy', facts)).toBeNull();
  });
});
