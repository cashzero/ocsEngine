import { describe, expect, it } from 'vitest';
import {
  GameplayFailure,
  createGameplayEngine,
  createGameplayFixture,
  createRuleConfigurationFixture,
  createRuleGameStateFixture,
  gameplayRequestId,
  parseGameplaySave,
  parseRuleActionId,
  serializeGameplaySave,
  type GameAction,
} from '../../src/index.js';

const actionId = (value: string) => {
  const parsed = parseRuleActionId(`gameplay:persistence:${value}`);
  if (!parsed.ok) throw new Error('Invalid persistence test Action ID.');
  return parsed.value;
};

const advance = (
  fixture: Awaited<ReturnType<typeof createGameplayFixture>>,
  suffix: string,
): GameAction => ({
  actionId: actionId(suffix), actorId: fixture.players[0],
  expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE',
});

describe('G6-G8 history, persistence, and recovery', () => {
  it('provides stable paged history, summaries, rejection diagnostics, and metrics', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    fixture.session.subscribe((notification) => {
      if (notification.kind === 'DISPATCH_ACCEPTED') {
        (notification.record.action as { kind: string }).kind = 'listener mutation';
      }
    });
    const accepted = await fixture.session.dispatch({
      requestId: gameplayRequestId('history-one'), seatId: fixture.seats[0], action: advance(fixture, 'history-one'),
    });
    expect(accepted.status).toBe('ACCEPTED');
    (accepted.events[0] as { kind: string }).kind = 'caller mutation';
    const stale = { ...advance(fixture, 'history-stale'), expectedRevision: 0 as never };
    expect((await fixture.session.dispatch({
      requestId: gameplayRequestId('history-stale'), seatId: fixture.seats[0], action: stale,
    })).status).toBe('REJECTED');
    expect((await fixture.session.dispatch({
      requestId: gameplayRequestId('history-two'), seatId: fixture.seats[0], action: advance(fixture, 'history-two'),
    })).status).toBe('ACCEPTED');

    const page = fixture.session.getHistory({ offset: 0, limit: 1, actionKind: 'ADVANCE_SEQUENCE' });
    expect(page).toMatchObject({ total: 2, truncated: true });
    expect(page.records[0]).toMatchObject({
      sequence: 0, revisionBefore: 0, revisionAfter: 1,
      summary: expect.stringContaining('SEQUENCE_ADVANCED'),
    });
    expect(page.records[0]?.action.kind).toBe('ADVANCE_SEQUENCE');
    expect(page.records[0]?.events[0]?.kind).toBe('SEQUENCE_ADVANCED');
    (page.records[0]!.action as { kind: string }).kind = 'history caller mutation';
    expect(fixture.session.getHistory({ offset: 0, limit: 1, actionKind: null }).records[0]?.action.kind)
      .toBe('ADVANCE_SEQUENCE');
    expect(fixture.session.getDiagnostics()).toMatchObject({
      historyLength: 2,
      rejections: [{ code: 'STALE_REVISION' }],
      metrics: { acceptedDispatches: 2, rejectedDispatches: 1 },
    });
  });

  it('strictly saves and reloads a pending transaction with identical history/hash', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    let sequence = 0;
    while (true) {
      const state = fixture.session.getView(fixture.seats[0]).projection!.sequence;
      if (state.phase === 'COMBAT' && state.segment === 'COMBAT') break;
      const actor = state.actingPlayerId;
      const seatId = actor === fixture.players[0] ? fixture.seats[0] : fixture.seats[1];
      const action: GameAction = {
        actionId: actionId(`pending-advance:${sequence}`), actorId: actor,
        expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE',
      };
      expect((await fixture.session.dispatch({
        requestId: gameplayRequestId(`pending-advance-${sequence++}`), seatId, action,
      })).status).toBe('ACCEPTED');
    }
    const declared: GameAction = {
      actionId: actionId('pending-combat'), actorId: fixture.players[0],
      expectedRevision: fixture.session.getRevision(), kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: ['piece:multi-step' as never], defenderIds: ['piece:ground' as never],
      targetHexId: '3,1' as never,
    };
    expect((await fixture.session.dispatch({
      requestId: gameplayRequestId('pending-combat'), seatId: fixture.seats[0], action: declared,
    })).status).toBe('ACCEPTED');
    const checkpoint = fixture.session.createCheckpoint('pending resource choice');
    const serialized = fixture.session.serializeSave();
    const parsed = parseGameplaySave(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeGameplaySave(parsed.value)).toEqual({ ok: true, value: serialized });

    const loaded = await fixture.engine.loadSession(serialized);
    expect(loaded.getMetadata().stateHash).toBe(fixture.session.getMetadata().stateHash);
    expect(loaded.getRevision()).toBe(fixture.session.getRevision());
    expect(loaded.getPendingDecision(fixture.seats[0])).toEqual(fixture.session.getPendingDecision(fixture.seats[0]));
    expect(loaded.getHistory({ offset: 0, limit: 100, actionKind: null }))
      .toEqual(fixture.session.getHistory({ offset: 0, limit: 100, actionKind: null }));
    expect(loaded.listCheckpoints()).toContainEqual(checkpoint);
    expect(loaded.exportReplay().finalStateHash).toBe(fixture.session.exportReplay().finalStateHash);
    const originalRequest = fixture.session.getHistory({ offset: 0, limit: 1, actionKind: null }).records[0]!;
    const duplicateAfterLoad = await loaded.dispatch({
      requestId: originalRequest.requestId, seatId: originalRequest.seatId,
      action: originalRequest.action,
    });
    expect(duplicateAfterLoad.status).toBe('DUPLICATE');
    expect(loaded.getRevision()).toBe(fixture.session.getRevision());
  });

  it('restores checkpoints by truncating history and pausing before alternate play', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    expect((await fixture.session.dispatch({
      requestId: gameplayRequestId('undo-one'), seatId: fixture.seats[0], action: advance(fixture, 'undo-one'),
    })).status).toBe('ACCEPTED');
    const checkpoint = fixture.session.createCheckpoint('after first action');
    expect((await fixture.session.dispatch({
      requestId: gameplayRequestId('undo-two'), seatId: fixture.seats[0], action: advance(fixture, 'undo-two'),
    })).status).toBe('ACCEPTED');

    const restored = await fixture.session.undoTo(checkpoint.id);
    expect(restored).toMatchObject({ ok: true, lifecycle: 'PAUSED', revision: checkpoint.revision });
    expect(fixture.session.getHistory({ offset: 0, limit: 10, actionKind: null }).total).toBe(1);
    expect(fixture.session.getMetadata().stateHash).toBe(checkpoint.stateHash);
    expect(fixture.session.resume().ok).toBe(true);
    expect((await fixture.engine.loadSession(fixture.session.serializeSave())).getRevision()).toBe(checkpoint.revision);
  });

  it('rejects unknown/corrupted saves and isolates an unexpected Rule Engine fault', async () => {
    const fixture = await createGameplayFixture();
    const raw = JSON.parse(fixture.session.serializeSave()) as Record<string, unknown>;
    raw.unexpected = true;
    expect(parseGameplaySave(JSON.stringify(raw))).toMatchObject({ ok: false });
    const tampered = JSON.parse(fixture.session.serializeSave()) as { finalStateHash: string };
    tampered.finalStateHash = `sha256:${'0'.repeat(64)}`;
    await expect(fixture.engine.loadSession(JSON.stringify(tampered))).rejects.toBeInstanceOf(GameplayFailure);

    const throwingEngine = createGameplayEngine({
      ...fixture.ports,
      rules: { ...fixture.ports.rules, applyAction: () => { throw new Error('injected Rule fault'); } },
    });
    const scenario = createRuleGameStateFixture().scenario;
    const faulted = await throwingEngine.createSession({
      scenario, configuration: createRuleConfigurationFixture(), rulesSeed: 6,
      bindings: [
        { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'One' },
        { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Two' },
      ],
      label: 'Fault isolation',
    });
    faulted.start();
    const result = await faulted.dispatch({
      requestId: gameplayRequestId('fatal'), seatId: fixture.seats[0],
      action: {
        actionId: actionId('fatal'), actorId: fixture.players[0],
        expectedRevision: faulted.getRevision(), kind: 'ADVANCE_SEQUENCE',
      },
    });
    expect(result.status).toBe('FATAL');
    expect(faulted.getDiagnostics()).toMatchObject({ lifecycle: 'FAULTED', fatalCode: 'RULE_ENGINE_EXCEPTION' });
    expect(() => faulted.save()).toThrow(GameplayFailure);
  });
});
