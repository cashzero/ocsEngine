import { describe, expect, it } from 'vitest';
import {
  createPieceStateIndex,
  createRuleGameStateFixture,
  formatHexId,
  hex,
  queryMovementPath,
  queryReachableHexes,
  ruleActionBase,
  ruleEngine,
  setRuleSequenceFixture,
  uniformCosts,
  type GameAction,
} from '../../src/index.js';

describe('R5 movement query and execution', () => {
  it('enumerates deterministic reachable paths and executes one atomically', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'MOVEMENT', 'MOVEMENT', actor);
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const reachable = queryReachableHexes(state, actor, piece.id);
    expect(reachable.allowed).toBe(true);
    expect(reachable.value?.length).toBeGreaterThan(0);
    const candidate = reachable.value!.find(({ hexId }) => hexId === formatHexId(hex(1, 1)))!;
    const action: GameAction = {
      ...ruleActionBase(state, actor, 'move'),
      kind: 'MOVE_PIECE', pieceId: piece.id, path: candidate.path,
    };
    const result = ruleEngine.applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createPieceStateIndex(result.state.pieceState).get(piece.id)?.location)
      .toEqual({ kind: 'ON_MAP', hexId: '1,1' });
    expect(createPieceStateIndex(state.pieceState).get(piece.id)?.location)
      .toEqual({ kind: 'ON_MAP', hexId: '2,1' });
    expect(result.events[0]).toMatchObject({ kind: 'PIECE_MOVED', spentTicks: 4 });
  });

  it('blocks enemy occupation, non-adjacent steps, and continuation after enemy ZOC', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'MOVEMENT', 'MOVEMENT', actor);
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const enemy = queryMovementPath(state, actor, piece.id, ['2,1', '3,1'] as never);
    const nonAdjacent = queryMovementPath(state, actor, piece.id, ['2,1', '4,4'] as never);
    const zocContinue = queryMovementPath(state, actor, piece.id, ['2,1', '2,2', '1,2'] as never);

    expect(enemy.reasons.map(({ code }) => code)).toContain('ENEMY_OCCUPIED_HEX');
    expect(nonAdjacent.reasons.map(({ code }) => code)).toContain('NON_ADJACENT_PATH_STEP');
    expect(zocContinue.reasons.map(({ code }) => code)).toContain('MOVEMENT_CONTINUES_AFTER_ZOC');
  });

  it('allows exactly one minimum-move Hex while keeping costs non-negative', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture({
      ...source,
      configuration: { ...source.configuration, defaultTerrainCostTicks: 100,
        terrainMovementCosts: [{ terrainDefinitionId: source.configuration.terrainMovementCosts[0]!.terrainDefinitionId, costs: uniformCosts(100) }] },
    }, 'MOVEMENT', 'MOVEMENT', actor);
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const result = queryMovementPath(state, actor, piece.id, ['2,1', '1,1'] as never);

    expect(result.allowed).toBe(true);
    expect(result.value).toMatchObject({ totalTicks: 100, minimumMoveUsed: true });
    expect(result.value!.steps.every(({ totalTicks }) => totalTicks >= 0)).toBe(true);
  });

  it('assigns a unique top stack order when entering an occupied friendly Hex', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'MOVEMENT', 'MOVEMENT', actor);
    const action: GameAction = {
      ...ruleActionBase(state, actor, 'friendly-stack'), kind: 'MOVE_PIECE',
      pieceId: 'piece:multi-step' as never, path: ['2,1', '2,2'] as never,
    };
    const result = ruleEngine.applyAction(state, action);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stack = result.state.pieceState.pieces
      .filter(({ location }) => location.kind === 'ON_MAP' && location.hexId === '2,2');
    expect(stack).toHaveLength(2);
    expect(new Set(stack.map(({ stackOrder }) => stackOrder)).size).toBe(2);
    expect(createPieceStateIndex(result.state.pieceState).get('piece:multi-step' as never)?.stackOrder).toBe(1);
  });
});
