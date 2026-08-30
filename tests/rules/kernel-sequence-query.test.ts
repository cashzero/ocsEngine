import { describe, expect, it } from 'vitest';
import {
  createRuleGameStateFixture,
  createRulesRng,
  nextSequence,
  projectRuleState,
  rollTwoDice,
  ruleActionBase,
  ruleEngine,
  ruleQueryCacheKey,
  validateGameState,
  type GameAction,
} from '../../src/index.js';

describe('R1 reducer and deterministic RNG', () => {
  it('rejects stale actions without state, event, or RNG mutation', () => {
    const state = createRuleGameStateFixture();
    const action: GameAction = {
      ...ruleActionBase(state, state.sequence.actingPlayerId, 'stale'),
      kind: 'ADVANCE_SEQUENCE',
      expectedRevision: (state.revision + 1) as typeof state.revision,
    };
    const result = ruleEngine.applyAction(state, action);

    expect(result).toMatchObject({ ok: false, state, events: [] });
    expect(!result.ok && result.violations.map(({ code }) => code)).toContain('STALE_REVISION');
    expect(state.rng.draws).toBe(0);
  });

  it('produces the same dice stream from the same seed without mutating input', () => {
    const first = createRulesRng(1234);
    const second = createRulesRng(1234);
    const firstRoll = rollTwoDice(first);
    const secondRoll = rollTwoDice(second);

    expect(firstRoll).toEqual(secondRoll);
    expect(first.draws).toBe(0);
    expect(firstRoll.rng.draws).toBe(2);
    expect(firstRoll.roll.total).toBe(firstRoll.roll.dice[0] + firstRoll.roll.dice[1]);
  });
});

describe('R2 sequence kernel', () => {
  it('advances a complete player-turn hierarchy with explicit segments', () => {
    let state = createRuleGameStateFixture();
    const visited: string[] = [];
    for (let guard = 0; guard < 40 && state.sequence.gameTurn === 1; guard += 1) {
      visited.push(`${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`);
      const action: GameAction = {
        ...ruleActionBase(state, state.sequence.actingPlayerId, `advance:${guard}`),
        kind: 'ADVANCE_SEQUENCE',
      };
      const result = ruleEngine.applyAction(state, action);
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      state = result.state;
    }

    expect(visited).toContain('0:MOVEMENT:MOVEMENT');
    expect(visited).toContain('0:MOVEMENT:BARRAGE');
    expect(visited).toContain('0:REACTION:MOVEMENT');
    expect(visited).toContain('0:COMBAT:COMBAT');
    expect(visited).toContain('0:EXPLOITATION:COMBAT');
    expect(visited).toContain('1:CLEAN_UP:NONE');
    expect(state.sequence).toMatchObject({ gameTurn: 2, phase: 'WEATHER', playerTurnIndex: 0 });
    expect(validateGameState(state)).toEqual([]);
  });

  it('does not advance while an authoritative lock exists', () => {
    const source = createRuleGameStateFixture();
    const locked = { ...source, currentMoverId: source.pieceState.pieces[0]!.id };
    expect(nextSequence(locked).phase).not.toBe('WEATHER');
    const result = ruleEngine.applyAction(locked, {
      ...ruleActionBase(locked, locked.sequence.actingPlayerId, 'locked'),
      kind: 'ADVANCE_SEQUENCE',
    });
    expect(!result.ok && result.violations.map(({ code }) => code)).toContain('CURRENT_MOVER_LOCK');
  });
});

describe('R3 query, explanation, and visibility', () => {
  it('returns stable explanation codes and revision-scoped cache keys', () => {
    const state = createRuleGameStateFixture();
    const wrongActor = state.scenario.players[1]!.id;
    const action: GameAction = {
      ...ruleActionBase(state, wrongActor, 'wrong-actor'),
      kind: 'ADVANCE_SEQUENCE',
    };
    const explanation = ruleEngine.explain(state, action);
    expect(explanation.allowed).toBe(false);
    expect(explanation.reasons.map(({ code }) => code)).toContain('WRONG_ACTOR');
    expect(explanation.citations).toContain('2.3');
    expect(ruleQueryCacheKey(state, wrongActor, 'legal-actions'))
      .not.toBe(ruleQueryCacheKey({ ...state, revision: (state.revision + 1) as typeof state.revision }, wrongActor, 'legal-actions'));
  });

  it('shows all friendly Pieces but only a redacted top enemy Piece per stack', () => {
    const state = createRuleGameStateFixture();
    const viewer = state.scenario.players[0]!.id;
    const projection = projectRuleState(state, viewer);
    const enemy = projection.stacks.flatMap(({ pieces }) => pieces)
      .find(({ ownerId }) => ownerId !== viewer)!;

    expect(enemy.redacted).toBe(true);
    expect(enemy.remainingSteps).toBeNull();
    expect(enemy.statuses).toEqual([]);
    expect(projection.pendingDecision).toBeNull();
  });
});
