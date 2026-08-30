import { describe, expect, it } from 'vitest';
import {
  createGameplayFixture,
  gameplayRequestId,
  parseRuleActionId,
  type GameAction,
} from '../../src/index.js';

const id = (value: string) => {
  const parsed = parseRuleActionId(`gameplay:test:${value}`);
  if (!parsed.ok) throw new Error('Invalid test action ID.');
  return parsed.value;
};

const dispatchAdvance = async (
  fixture: Awaited<ReturnType<typeof createGameplayFixture>>,
  sequence: number,
) => {
  const view = fixture.session.getView(fixture.seats[0]);
  const actor = view.projection!.sequence.actingPlayerId;
  const seatId = actor === fixture.players[0] ? fixture.seats[0] : fixture.seats[1];
  return fixture.session.dispatch({
    requestId: gameplayRequestId(`advance-${sequence}`), seatId,
    action: {
      actionId: id(`advance:${sequence}`), actorId: actor,
      expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE',
    },
  });
};

describe('G3-G5 discovery, pending decisions, and projection access', () => {
  it('provides bounded candidates and marks drafts stale after a commit', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const families = fixture.session.getActionFamilies(fixture.seats[0]);
    expect(families.find(({ kind }) => kind === 'ADVANCE_SEQUENCE')?.enabled).toBe(true);
    const candidates = fixture.session.getActionCandidates(fixture.seats[0], {
      kind: 'ADVANCE_SEQUENCE', pieceId: null, budget: 1,
    });
    expect(candidates.actions).toHaveLength(1);
    const draft = fixture.session.createDraft(fixture.seats[0], candidates.actions[0]!);
    expect(fixture.session.validateDraft(draft)).toMatchObject({ current: true, explanation: { allowed: true } });

    const result = await fixture.session.dispatch({
      requestId: gameplayRequestId('draft-commit'), seatId: fixture.seats[0], action: candidates.actions[0]!,
    });
    expect(result.status).toBe('ACCEPTED');
    expect(fixture.session.validateDraft(draft).current).toBe(false);
  });

  it('coordinates owner-only pending decisions and resumes through public candidates', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    let sequence = 0;
    while (true) {
      const current = fixture.session.getView(fixture.seats[0]).projection!.sequence;
      if (current.phase === 'COMBAT' && current.segment === 'COMBAT') break;
      expect((await dispatchAdvance(fixture, sequence++)).status).toBe('ACCEPTED');
    }
    const declare: GameAction = {
      actionId: id('declare-combat'), actorId: fixture.players[0],
      expectedRevision: fixture.session.getRevision(), kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: ['piece:multi-step' as never], defenderIds: ['piece:ground' as never],
      targetHexId: '3,1' as never,
    };
    const declared = await fixture.session.dispatch({
      requestId: gameplayRequestId('declare-combat'), seatId: fixture.seats[0], action: declare,
    });
    expect(declared.status).toBe('ACCEPTED');
    const pending = fixture.session.getPendingDecision(fixture.seats[0]);
    expect(pending).toMatchObject({ kind: 'RESOURCE_SOURCE' });
    expect(fixture.session.getPendingDecision(fixture.seats[1])).toBeNull();
    const wrongSeat = await fixture.session.respondToPendingDecision(
      gameplayRequestId('wrong-owner'), fixture.seats[1], 'UNSUPPLIED',
    );
    expect(wrongSeat).toMatchObject({ status: 'REJECTED', violations: [{ code: 'NO_VISIBLE_PENDING_DECISION' }] });

    const choice = pending!.options.find(({ id: choiceId }) => choiceId.startsWith('resource:'))!;
    const responseRequestId = gameplayRequestId('resource-choice');
    const [responded, duplicateResponse] = await Promise.all([
      fixture.session.respondToPendingDecision(responseRequestId, fixture.seats[0], choice.id),
      fixture.session.respondToPendingDecision(responseRequestId, fixture.seats[0], choice.id),
    ]);
    expect(responded.status).toBe('ACCEPTED');
    expect(duplicateResponse.status).toBe('DUPLICATE');
    expect(fixture.session.getPendingDecision(fixture.seats[0])).toBeNull();
    const commits = fixture.session.getActionCandidates(fixture.seats[0], {
      kind: 'COMMIT_TRANSACTION', pieceId: null, budget: 1,
    });
    expect(commits.actions).toHaveLength(1);
  });

  it('redacts enemy stacks and enforces a privacy screen during hot-seat handoff', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const firstView = fixture.session.getView(fixture.seats[0]);
    const enemyForFirst = firstView.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find(({ id: pieceId }) => pieceId === 'piece:ground');
    const ownForSecond = fixture.session.getView(fixture.seats[1]).projection!.stacks
      .flatMap(({ pieces }) => pieces).find(({ id: pieceId }) => pieceId === 'piece:ground');
    expect(enemyForFirst).toMatchObject({ redacted: true, remainingSteps: null, statuses: [] });
    expect(ownForSecond).toMatchObject({ redacted: false, remainingSteps: 1 });
    (firstView.projection!.victory.scores[0] as { points: number }).points = 999;
    (enemyForFirst as { remainingSteps: number | null }).remainingSteps = 999;
    const detachedView = fixture.session.getView(fixture.seats[0]);
    expect(detachedView.projection!.victory.scores[0]?.points).toBe(0);
    expect(detachedView.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find(({ id: pieceId }) => pieceId === 'piece:ground')?.remainingSteps).toBeNull();

    const token = fixture.session.beginHandoff(fixture.seats[0], fixture.seats[1]);
    expect(fixture.session.getView(fixture.seats[0])).toMatchObject({ privacyLocked: true, projection: null });
    expect(fixture.session.getActionCandidates(fixture.seats[1], {
      kind: 'ADVANCE_SEQUENCE', pieceId: null, budget: 1,
    }).actions).toEqual([]);
    expect(fixture.session.completeHandoff(token)).toMatchObject({ ok: true });
    expect(fixture.session.getMetadata().activeSeatId).toBe(fixture.seats[1]);
    expect(fixture.session.getView(fixture.seats[1]).privacyLocked).toBe(false);
  });
});
