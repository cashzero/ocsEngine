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
      attackerIds: [fixture.units.attacker], defenderIds: [fixture.units.defender, fixture.units.secondDefender],
      targetHexId: '6,5' as never, leadAttackerId: fixture.units.attacker,
      // 9.5: the attacker declares its supply with the attack, as the session offers it.
      attackerSupply: [fixture.session.getAttackerSupplyOptions(fixture.seats[0], [], fixture.units.attacker).value!.options[0]!.choice],
    };
    const declared = await fixture.session.dispatch({
      requestId: gameplayRequestId('declare-combat'), seatId: fixture.seats[0], action: declare,
    });
    expect(declared.status).toBe('ACCEPTED');
    // The defender owns the supply choice (9.2 step 2); the attacker sees nothing pending.
    const pending = fixture.session.getPendingDecision(fixture.seats[1]);
    expect(pending).toMatchObject({ kind: 'SUPPLY_SOURCE' });
    expect(fixture.session.getPendingDecision(fixture.seats[0])).toBeNull();
    const wrongSeat = await fixture.session.respondToPendingDecision(
      gameplayRequestId('wrong-owner'), fixture.seats[0], pending!.options[0]!.id,
    );
    expect(wrongSeat).toMatchObject({ status: 'REJECTED', violations: [{ code: 'NO_VISIBLE_PENDING_DECISION' }] });

    const choice = pending!.options.find(({ id: choiceId }) => choiceId.startsWith('pay:'))!;
    const responseRequestId = gameplayRequestId('defender-choice');
    const [responded, duplicateResponse] = await Promise.all([
      fixture.session.respondToPendingDecision(responseRequestId, fixture.seats[1], choice.id),
      fixture.session.respondToPendingDecision(responseRequestId, fixture.seats[1], choice.id),
    ]);
    expect(responded.status).toBe('ACCEPTED');
    expect(duplicateResponse.status).toBe('DUPLICATE');
    // Next the defender names his Action Rating unit (9.2 step 3); then the dice are rolled.
    const lead = fixture.session.getPendingDecision(fixture.seats[1]);
    expect(lead?.kind).toBe('DEFENDER_LEAD');
    expect((await fixture.session.respondToPendingDecision(gameplayRequestId('defender-lead'), fixture.seats[1], lead!.options[0]!.id)).status).toBe('ACCEPTED');
    const history = fixture.session.getHistory({ offset: 0, limit: 200, actionKind: null }).records;
    expect(history.at(-1)!.events.some(({ kind }) => kind === 'DICE_ROLLED')).toBe(true);
  });

  it('redacts enemy stacks and enforces a privacy screen during hot-seat handoff', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const firstView = fixture.session.getView(fixture.seats[0]);
    const enemyStack = firstView.projection!.stacks.find(({ location }) => location.kind === 'ON_MAP' && location.hexId === '6,5')!;
    // 4.9a: only the top unit is visible to the enemy, without steps lost; the rest is a count.
    expect(enemyStack.pieces).toHaveLength(1);
    expect(enemyStack.hiddenCount).toBe(1);
    const enemyForFirst = enemyStack.pieces[0]!;
    expect(enemyForFirst).toMatchObject({ redacted: true, remainingSteps: null });
    const ownForSecond = fixture.session.getView(fixture.seats[1]).projection!.stacks
      .flatMap(({ pieces }) => pieces).find(({ id: pieceId }) => pieceId === enemyForFirst.id);
    expect(ownForSecond).toMatchObject({ redacted: false, remainingSteps: 1 });
    (firstView.projection!.victory.scores[0] as { points: number }).points = 999;
    (enemyForFirst as { remainingSteps: number | null }).remainingSteps = 999;
    const detachedView = fixture.session.getView(fixture.seats[0]);
    expect(detachedView.projection!.victory.scores[0]?.points).toBe(0);
    expect(detachedView.projection!.stacks.flatMap(({ pieces }) => pieces)
      .find(({ id: pieceId }) => pieceId === enemyForFirst.id)?.remainingSteps).toBeNull();

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
