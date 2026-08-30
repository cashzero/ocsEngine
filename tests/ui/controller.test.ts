import { describe, expect, it } from 'vitest';
import {
  createGameplayFixture,
  createUiController,
} from '../../src/index.js';

describe('U2, U5-U8 UI controller', () => {
  it('discovers, explains, and dispatches a legal action through Gameplay only', async () => {
    const fixture = await createGameplayFixture();
    const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
    const controller = createUiController({
      engine: fixture.engine,
      session: fixture.session,
      scenario,
      bindings: [
        { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'One' },
        { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Two' },
      ],
    });

    controller.start();
    controller.selectActionKind('ADVANCE_SEQUENCE');
    const before = controller.getSnapshot();
    expect(before.selectedAction).toMatchObject({ kind: 'ADVANCE_SEQUENCE' });
    expect(before.explanation).toMatchObject({ allowed: true });

    await controller.executeSelected();
    const after = controller.getSnapshot();
    expect(after.view.stateRevision).toBe(1);
    expect(after.history).toHaveLength(1);
    expect(after.notice).toContain('accepted');
    controller.dispose();
  });

  it('supports checkpoint recovery, save/load, and privacy-safe handoff', async () => {
    const fixture = await createGameplayFixture();
    const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
    const controller = createUiController({
      engine: fixture.engine, session: fixture.session, scenario,
      bindings: [
        { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'One' },
        { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Two' },
      ],
    });
    controller.start();
    controller.createCheckpoint();
    const save = controller.serializeSave();
    controller.beginHandoff();
    expect(controller.getSnapshot().view).toMatchObject({ privacyLocked: true, projection: null });
    controller.completeHandoff();
    expect(controller.getSnapshot().view.privacyLocked).toBe(false);

    await controller.loadSave(save);
    expect(controller.getSnapshot()).toMatchObject({
      view: { stateRevision: 0, metadata: { lifecycle: 'ACTIVE' } },
      checkpoints: [{ revision: 0 }],
    });
    controller.dispose();
  });

  it('drives the synthetic scenario to completion and resolves UI-visible decisions', async () => {
    const fixture = await createGameplayFixture();
    const scenario = (await fixture.ports.scenarios.load(fixture.session.getMetadata().scenarioId))!;
    const controller = createUiController({
      engine: fixture.engine, session: fixture.session, scenario,
      bindings: [
        { seatId: fixture.seats[0], playerId: fixture.players[0], label: 'One' },
        { seatId: fixture.seats[1], playerId: fixture.players[1], label: 'Two' },
      ],
    });
    controller.start();
    let decisionCount = 0;
    let dispatched = 0;
    for (let index = 0; index < 120; index += 1) {
      let snapshot = controller.getSnapshot();
      if (snapshot.view.metadata.lifecycle === 'FINISHED') break;
      const pending = snapshot.view.pendingDecision;
      if (pending) {
        decisionCount += 1;
        await controller.respondToDecision(pending.options[0]!.id);
        dispatched += 1;
        continue;
      }
      const projection = snapshot.view.projection!;
      if (projection.sequence.actingPlayerId !== snapshot.view.playerId) {
        controller.beginHandoff();
        expect(controller.getSnapshot().view.projection).toBeNull();
        controller.completeHandoff();
        snapshot = controller.getSnapshot();
      }
      const enabled = snapshot.families.filter(({ enabled }) => enabled).map(({ kind }) => kind);
      if (enabled.length === 0) {
        controller.beginHandoff();
        controller.completeHandoff();
        continue;
      }
      const kind = enabled.includes('COMMIT_TRANSACTION') ? 'COMMIT_TRANSACTION'
        : decisionCount === 0 && enabled.includes('DECLARE_BARRAGE') ? 'DECLARE_BARRAGE'
          : decisionCount === 0 && enabled.includes('DECLARE_COMBAT') ? 'DECLARE_COMBAT'
            : 'ADVANCE_SEQUENCE';
      controller.selectActionKind(kind);
      const selected = controller.getSnapshot();
      expect(selected.selectedAction, JSON.stringify({
        iteration: index,
        lifecycle: selected.view.metadata.lifecycle,
        phase: selected.view.projection?.sequence.phase,
        segment: selected.view.projection?.sequence.segment,
        viewer: selected.view.playerId,
        actor: selected.view.projection?.sequence.actingPlayerId,
        enabled,
        kind,
        notice: selected.notice,
      })).not.toBeNull();
      await controller.executeSelected();
      dispatched += 1;
    }
    const final = controller.getSnapshot();
    expect(final.view.metadata.lifecycle, JSON.stringify({
      revision: final.view.stateRevision,
      phase: final.view.projection?.sequence.phase,
      segment: final.view.projection?.sequence.segment,
      viewer: final.view.playerId,
      actor: final.view.projection?.sequence.actingPlayerId,
      enabled: final.families.filter(({ enabled }) => enabled).map(({ kind }) => kind),
      history: final.history.length,
      decisions: decisionCount,
      notice: final.notice,
    })).toBe('FINISHED');
    expect(final.history.length).toBe(dispatched);
    expect(decisionCount).toBeGreaterThan(0);
    controller.dispose();
  }, 30_000);
});
