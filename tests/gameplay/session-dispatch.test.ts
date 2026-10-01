import { describe, expect, it } from 'vitest';
import {
  createGameplayFixture,
  createGameplayEngine,
  createMemoryGameplayPorts,
  createRuleConfigurationFixture,
  createRuleGameStateFixture,
  gameplayRequestId,
  parseRuleActionId,
  type GameAction,
} from '../../src/index.js';

const advance = (fixture: Awaited<ReturnType<typeof createGameplayFixture>>, suffix: string): GameAction => {
  const parsed = parseRuleActionId(`gameplay:test:advance:${suffix}`);
  if (!parsed.ok) throw new Error('Invalid test action ID.');
  return {
    actionId: parsed.value, actorId: fixture.players[0],
    expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE',
  };
};

describe('G1-G2 Gameplay lifecycle and dispatch', () => {
  it('bootstraps READY, exposes metadata, and enforces lifecycle idempotently', async () => {
    const fixture = await createGameplayFixture();
    expect(fixture.session.getMetadata()).toMatchObject({
      label: 'Generated duel Gameplay fixture', lifecycle: 'READY', rulesVersion: 'OCS 4.3 generated ground duel 0.3.0',
    });
    expect(fixture.session.getRevision()).toBe(0);
    expect(fixture.session.start()).toMatchObject({ ok: true, lifecycle: 'ACTIVE' });
    expect(fixture.session.start()).toMatchObject({ ok: false, lifecycle: 'ACTIVE' });
    expect(fixture.session.pause()).toMatchObject({ ok: true, lifecycle: 'PAUSED' });
    expect(fixture.session.resume()).toMatchObject({ ok: true, lifecycle: 'ACTIVE' });
    expect((await fixture.session.close()).lifecycle).toBe('CLOSED');
    expect((await fixture.session.close()).code).toBe('SESSION_ALREADY_CLOSED');
  });

  it('serializes concurrent requests so only the first same-revision action commits', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const first = advance(fixture, 'first');
    const second = { ...advance(fixture, 'second'), actionId: (() => {
      const parsed = parseRuleActionId('gameplay:test:advance:second-distinct');
      if (!parsed.ok) throw new Error('Invalid test action ID.');
      return parsed.value;
    })() };
    const [accepted, stale] = await Promise.all([
      fixture.session.dispatch({ requestId: gameplayRequestId('parallel-one'), seatId: fixture.seats[0], action: first }),
      fixture.session.dispatch({ requestId: gameplayRequestId('parallel-two'), seatId: fixture.seats[0], action: second }),
    ]);

    expect(accepted.status).toBe('ACCEPTED');
    expect(stale.status).toBe('REJECTED');
    expect(stale.violations[0]?.code).toBe('STALE_REVISION');
    expect(fixture.session.getRevision()).toBe(1);
    expect(fixture.session.getHistory({ offset: 0, limit: 10, actionKind: null }).total).toBe(1);
  });

  it('deduplicates request/action IDs and isolates subscriber and persistence failures', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const requestId = gameplayRequestId('idempotent');
    const unsubscribe = fixture.session.subscribe(() => { throw new Error('listener failure'); });
    fixture.saves.failNextSave();
    const first = await fixture.session.dispatch({
      requestId, seatId: fixture.seats[0], action: advance(fixture, 'idempotent'),
    });
    const duplicate = await fixture.session.dispatch({
      requestId, seatId: fixture.seats[0], action: advance(fixture, 'ignored-copy'),
    });
    unsubscribe();

    expect(first.status).toBe('ACCEPTED');
    expect(first.warnings.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'SUBSCRIBER_FAILURE', 'PERSISTENCE_FAILURE',
    ]));
    expect(duplicate.status).toBe('DUPLICATE');
    expect(fixture.session.getRevision()).toBe(1);
    expect(fixture.session.getDiagnostics().metrics).toMatchObject({
      acceptedDispatches: 1, duplicateRequests: 1, subscriberFailures: 2, persistenceFailures: 1,
    });
    expect(fixture.logger.entries().map(({ code }) => code)).toEqual(expect.arrayContaining([
      'SUBSCRIBER_FAILURE', 'PERSISTENCE_FAILURE',
    ]));
  });

  it('bootstraps through the Scenario repository and reloads automatic memory saves', async () => {
    const fixture = await createGameplayFixture();
    const stored = await fixture.engine.createStoredSession({
      scenarioId: fixture.session.getMetadata().scenarioId,
      configuration: createRuleConfigurationFixture(),
      rulesSeed: 6,
      bindings: [
        { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'One' },
        { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Two' },
      ],
      label: 'Repository bootstrap',
    });
    stored.start();
    const parsed = parseRuleActionId('gameplay:test:stored:advance');
    if (!parsed.ok) return;
    expect((await stored.dispatch({
      requestId: gameplayRequestId('stored-advance'), seatId: fixture.seats[0],
      action: {
        actionId: parsed.value, actorId: fixture.players[0],
        expectedRevision: stored.getRevision(), kind: 'ADVANCE_SEQUENCE',
      },
    })).status).toBe('ACCEPTED');
    const reloaded = await fixture.engine.loadStoredSession(stored.getMetadata().id);
    expect(reloaded.getMetadata().stateHash).toBe(stored.getMetadata().stateHash);
  });

  it('canonically detaches Scenario and Rule configuration inputs from caller mutation', async () => {
    const source = createRuleGameStateFixture();
    const scenario = source.scenario;
    const configuration = createRuleConfigurationFixture();
    const engine = createGameplayEngine(createMemoryGameplayPorts([scenario]));
    const fixture = await createGameplayFixture();
    const session = await engine.createSession({
      scenario, configuration, rulesSeed: 6,
      bindings: [
        { seatId: fixture.seats[0], playerId: scenario.players[0]!.id, label: 'One' },
        { seatId: fixture.seats[1], playerId: scenario.players[1]!.id, label: 'Two' },
      ],
      label: 'Detached input',
    });
    const originalHash = session.getMetadata().stateHash;
    (scenario.players[0] as { name: string }).name = 'caller mutation';
    (configuration as { rulesVersion: string }).rulesVersion = 'caller mutation';

    expect(session.getMetadata()).toMatchObject({
      stateHash: originalHash, rulesVersion: 'OCS 4.3 ground/logistics MVP',
    });
  });
});
