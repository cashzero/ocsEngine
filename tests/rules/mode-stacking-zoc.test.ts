import { describe, expect, it } from 'vitest';
import {
  createRuleGameStateFixture,
  formatHexId,
  hex,
  queryStacking,
  queryZoc,
  ruleActionBase,
  ruleEngine,
  setRuleSequenceFixture,
  type GameAction,
} from '../../src/index.js';

describe('R4 mode, stacking, and purpose-specific ZOC', () => {
  it('blocks Reserve/Strat entry in enemy ZOC and permits a legal voluntary change', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'MOVEMENT', 'MOVEMENT', actor);
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const blocked: GameAction = {
      ...ruleActionBase(state, actor, 'reserve-blocked'),
      kind: 'CHANGE_MODE', pieceId: piece.id, mode: 'RESERVE',
    };
    const result = ruleEngine.applyAction(state, blocked);
    expect(!result.ok && result.violations.map(({ code }) => code)).toContain('MODE_CHANGE_IN_ENEMY_ZOC');

    const legal: GameAction = { ...blocked, actionId: ruleActionBase(state, actor, 'move-legal').actionId, mode: 'MOVE' };
    const changed = ruleEngine.applyAction(state, legal);
    expect(changed.ok && changed.state.pieceState.pieces.find(({ id }) => id === piece.id)?.mode).toBe('MOVE');
    expect(state.pieceState.pieces.find(({ id }) => id === piece.id)?.mode).toBe('MOVE');
  });

  it('derives exact RE stacking and reports a configured overflow', () => {
    const source = createRuleGameStateFixture();
    const strict = {
      ...source,
      configuration: { ...source.configuration, stackingLimitReTicks: 3 },
    };
    const result = queryStacking(strict, formatHexId(hex(2, 1)));
    expect(result.allowed).toBe(false);
    expect(result.value).toMatchObject({ usedReTicks: 4, limitReTicks: 3 });
    expect(result.reasons[0]?.code).toBe('STACKING_LIMIT_EXCEEDED');
  });

  it('distinguishes movement ZOC from supply-path negation', () => {
    const state = createRuleGameStateFixture();
    const actor = state.scenario.players[0]!.id;
    const occupied = formatHexId(hex(2, 1));
    const movement = queryZoc(state, actor, occupied, 'MOVEMENT');
    const supply = queryZoc(state, actor, occupied, 'SUPPLY');

    expect(movement.allowed).toBe(false);
    expect(movement.value?.sourcePieceIds).toContain('piece:ground');
    expect(supply.allowed).toBe(true);
    expect(supply.value?.negated).toBe(true);
  });
});
