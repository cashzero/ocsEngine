import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEW_GAME_REQUEST, createBotActionAccess, createBotSeatRunner, createGameplayEngine,
  createMemoryGameplayPorts, prepareNewGame, runBotMatch,
  type BotDecisionObservation, type BotPolicy,
} from '../../src/index.js';

const prepared = prepareNewGame({ ...DEFAULT_NEW_GAME_REQUEST, turnLimit: 1,
  oob: { ...DEFAULT_NEW_GAME_REQUEST.oob, divisionsPerSide: 1, armoredDivisionsPerSide: 0 } });
if (!prepared.ok) throw new Error('Observation fixture did not generate');
const gamePackage = prepared.value;
const start = async (active = true) => {
  const engine = createGameplayEngine(createMemoryGameplayPorts());
  const session = await engine.createSession({ scenario: gamePackage.scenario, configuration: gamePackage.configuration,
    bindings: gamePackage.bindings, rulesSeed: DEFAULT_NEW_GAME_REQUEST.seeds.rules,
    label: 'decision observation', persistence: 'MANUAL' });
  if (active) session.start();
  return session;
};
const firstBinding = gamePackage.bindings[0]!;
const otherBinding = gamePackage.bindings[1]!;
const seat = (policy: BotPolicy) => ({ ...firstBinding, seed: 1, policy });

const fallbackPolicy: BotPolicy = { id: 'observation-fixture', version: '1', decide: context => {
  const action = context.actions.candidates('ADVANCE_SEQUENCE')[0];
  if (!action) throw new Error('Missing legal sequence action');
  return { action: { ...action, actorId: otherBinding.playerId }, alternatives: [action],
    intent: 'first choice has its own score', score: 123, breakdown: [{ term: 'fixture', value: 123 }] };
} };

describe('passive query and dispatch observations', () => {
  it('preserves real truncation, cache reuse and zero-budget provenance even when no choice is made', async () => {
    const session = await start();
    const observations: BotDecisionObservation[] = [];
    const policy: BotPolicy = { id: 'query-only', version: '1', decide: context => {
      const first = context.actions.candidates('ADVANCE_SEQUENCE', null, 0);
      expect(context.actions.candidates('ADVANCE_SEQUENCE', null, 0)).toBe(first);
      expect(first).toEqual([]);
      expect(context.actions.candidates('ADVANCE_SEQUENCE', null, 1)).toHaveLength(1);
      return null;
    } };
    const runner = createBotSeatRunner({ session, seats: [seat(policy)],
      observation: { runId: 'queries', onDecision: value => observations.push(value) } });
    const before = session.getMetadata().stateHash;
    expect(await runner.step()).toMatchObject({ kind: 'STUCK', error: { code: 'BOT_STALLED' } });
    const report = observations[0]!;
    expect(report.coverage).toBe('QUERY_ONLY');
    expect(report.queries).toHaveLength(2);
    expect(report.queries[0]).toMatchObject({ budget: 0, truncated: true, candidates: [],
      reasons: [{ code: 'CANDIDATES_AVAILABLE', allowed: true }] });
    expect(report.queries[1]).toMatchObject({ budget: 1, truncated: false });
    expect(report.queries[1]!.candidates).toHaveLength(1);
    expect(report.queryCalls).toEqual([
      { queryId: 'query:0', cacheHit: false }, { queryId: 'query:0', cacheHit: true },
      { queryId: 'query:1', cacheHit: false },
    ]);
    expect(report.candidates[0]!.policyEvaluation).toBe('NOT_INSTRUMENTED');
    expect(report.choice).toBeNull();
    expect(report.attempts).toEqual([]);
    expect(session.getMetadata().stateHash).toBe(before);
    runner.reset();
    await runner.step();
    expect(observations.map(value => value.decisionOrdinal)).toEqual([0, 1]);
  });

  it('preserves unavailable-session reasons rather than treating them as no legal opportunity', async () => {
    const session = await start(false);
    const results: Parameters<NonNullable<Parameters<typeof createBotActionAccess>[2]>>[1][] = [];
    const access = createBotActionAccess(session, firstBinding.seatId, (_request, result) => results.push(result));
    expect(access.candidates('ADVANCE_SEQUENCE')).toEqual([]);
    expect(results[0]).toMatchObject({ truncated: false, reasons: [{ code: 'SESSION_NOT_INTERACTIVE' }] });
  });

  it('attributes the score to the rejected preference and joins the accepted fallback to save metadata', async () => {
    const session = await start();
    const observations: BotDecisionObservation[] = [];
    const runner = createBotSeatRunner({ session, seats: [seat(fallbackPolicy)],
      observation: { runId: 'fallback', onDecision: value => {
        expect(runner.totals().accepted).toBe(1);
        observations.push(value);
      } } });
    const step = await runner.step();
    expect(step.kind).toBe('ACTED');
    if (step.kind !== 'ACTED') throw new Error('Fallback did not act');
    expect(step.trace.attempts).toBe(2);
    const report = observations[0]!;
    expect(report.attempts.map(attempt => attempt.status)).toEqual(['REJECTED', 'ACCEPTED']);
    expect(report.choice).toMatchObject({ candidateId: report.attempts[0]!.candidateId, score: 123 });
    expect(report.attempts[1]!.candidateId).not.toBe(report.choice!.candidateId);
    expect(report.choice!.alternatives).toEqual([report.attempts[1]!.candidateId]);
    expect(session.save().acceptedActionMetadata[0]!.requestId).toBe(report.attempts[1]!.requestId);
    expect(session.save().acceptedActions[0]).toEqual(step.trace.action);
    expect(report.candidates.find(candidate => candidate.id === report.attempts[1]!.candidateId)!.action).toEqual(step.trace.action);
    expect(report.revision + 1).toBe(report.attempts[1]!.revision);
  });

  it('records exhausted alternatives without inventing an accepted action', async () => {
    const session = await start();
    const observations: BotDecisionObservation[] = [];
    const runner = createBotSeatRunner({ session, seats: [seat(fallbackPolicy)], retries: 0,
      observation: { runId: 'failure', onDecision: value => observations.push(value) } });
    expect(await runner.step()).toMatchObject({ kind: 'STUCK', error: { code: 'FAILED_ACTION' } });
    expect(observations[0]!.attempts.map(attempt => attempt.status)).toEqual(['REJECTED']);
    expect(session.save().acceptedActions).toEqual([]);
    expect(runner.totals().accepted).toBe(0);
  });

  it('detaches reports and accounts for accepted actions before a consumer throws', async () => {
    const session = await start();
    const runner = createBotSeatRunner({ session, seats: [seat(fallbackPolicy)],
      observation: { runId: 'sink-failure', onDecision: value => {
        for (const candidate of value.candidates) Reflect.set(candidate.action, 'actorId', otherBinding.playerId);
        throw new Error('recording failed');
      } } });
    await expect(runner.step()).rejects.toThrow('recording failed');
    expect(runner.totals().accepted).toBe(1);
    expect(session.save().acceptedActions[0]!.actorId).toBe(firstBinding.playerId);
  });

  it('forwards observation configuration through the match driver', async () => {
    const session = await start();
    const observations: BotDecisionObservation[] = [];
    const result = await runBotMatch({ session, seats: [seat(fallbackPolicy)], maxActions: 1,
      observation: { runId: 'driver', onDecision: value => observations.push(value) } });
    expect(result.accepted).toBe(1);
    expect(observations).toHaveLength(1);
    expect(observations[0]!.runId).toBe('driver');
  });
});
