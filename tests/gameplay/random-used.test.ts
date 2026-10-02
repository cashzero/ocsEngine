import { describe, expect, it } from 'vitest';
import { createGameplayFixture, gameplayRequestId, parseRuleActionId, type GameAction } from '../../src/index.js';

describe('dispatch says when an action drew from the dice stream', () => {
  it('flags the steps that roll and leaves the rest unflagged, so Undo cannot be used to re-roll', async () => {
    const fixture = await createGameplayFixture();
    fixture.session.start();
    const flags: boolean[] = [];
    for (let index = 0; index < 80; index += 1) {
      if (fixture.session.getView(fixture.seats[0]!).projection?.sequence.phase === 'COMPLETE') break;
      const actionId = parseRuleActionId(`gameplay:test:advance:random-${index}`);
      if (!actionId.ok) throw new Error('Invalid test action ID.');
      const actor = fixture.session.getView(fixture.seats[0]!).projection!.sequence.actingPlayerId;
      const seat = fixture.seats.find((candidate) => fixture.session.getView(candidate).playerId === actor) ?? fixture.seats[0]!;
      const action: GameAction = { actionId: actionId.value, actorId: actor, expectedRevision: fixture.session.getRevision(), kind: 'ADVANCE_SEQUENCE' };
      const result = await fixture.session.dispatch({ requestId: gameplayRequestId(`random-${index}`), seatId: seat, action });
      if (result.status !== 'ACCEPTED') break;
      expect(typeof result.randomUsed).toBe('boolean');
      flags.push(result.randomUsed === true);
    }
    expect(flags.length).toBeGreaterThan(3);
    expect(flags).toContain(true);
    expect(flags).toContain(false);
  }, 60000);
});
