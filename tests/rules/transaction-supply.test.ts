import { describe, expect, it } from 'vitest';
import {
  createPieceStateIndex,
  createRuleGameStateFixture,
  queryResourceSources,
  querySupply,
  ruleActionBase,
  ruleEngine,
  setRuleSequenceFixture,
  type GameAction,
} from '../../src/index.js';

describe('R7 trace and on-map supply', () => {
  it('finds deterministic direct/HQ trace supply with explanation data', () => {
    const state = createRuleGameStateFixture();
    const actor = state.scenario.players[0]!.id;
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const result = querySupply(state, actor, piece.id, 'TRACE');

    expect(result.allowed).toBe(true);
    expect(['SOURCE', 'HQ']).toContain(result.value?.method);
    expect(result.value?.path.length).toBeGreaterThan(0);
    expect(result.reasons[0]?.rule).toMatch(/^12\./);
  });

  it('spends exact on-map supply only when trace is absent', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture({
      ...source,
      scenario: { ...source.scenario, sources: [] },
    }, 'SUPPLY', 'NONE', actor);
    const piece = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const supply = state.pieceState.pieces.find(({ id }) => id === 'piece:supply-dump')!;
    expect(querySupply(state, actor, piece.id, 'TRACE')).toMatchObject({
      allowed: true,
      value: { method: 'DUMP', requiresPayment: true },
    });
    expect(queryResourceSources(state, actor, '2,1' as never, 1)[0]?.pieceId).toBe(supply.id);

    const action: GameAction = {
      ...ruleActionBase(state, actor, 'supply-check'),
      kind: 'CHECK_SUPPLY', pieceIds: [piece.id], sourcePieceId: supply.id,
    };
    const result = ruleEngine.applyAction(state, action);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createPieceStateIndex(result.state.pieceState).get(supply.id)?.resourceQuantity).toBe(3);
    expect(createPieceStateIndex(state.pieceState).get(supply.id)?.resourceQuantity).toBe(4);
    expect(result.events.map(({ kind }) => kind)).toEqual(['SUPPLY_SPENT', 'SUPPLY_STATUS_CHANGED']);
  });
});

describe('R6 transaction reservation and cancellation', () => {
  it('persists a resource decision, reserves without spending, and cancels cleanly', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'COMBAT', 'COMBAT', actor);
    const attacker = state.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
    const defender = state.pieceState.pieces.find(({ id }) => id === 'piece:ground')!;
    const supply = state.pieceState.pieces.find(({ id }) => id === 'piece:supply-dump')!;
    const declare: GameAction = {
      ...ruleActionBase(state, actor, 'declare-combat'),
      kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: [attacker.id], defenderIds: [defender.id], targetHexId: '3,1' as never,
    };
    const declared = ruleEngine.applyAction(state, declare);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    expect(declared.state.pendingDecision).toMatchObject({ kind: 'RESOURCE_SOURCE', ownerId: actor });
    expect(JSON.parse(JSON.stringify(declared.state))).toEqual(declared.state);

    const respond: GameAction = {
      ...ruleActionBase(declared.state, actor, 'choose-supply'),
      kind: 'RESPOND_DECISION',
      decisionId: declared.state.pendingDecision!.id,
      choiceId: `resource:${supply.id}`,
    };
    const reserved = ruleEngine.applyAction(declared.state, respond);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.state.activeTransaction).toMatchObject({ step: 'READY', reservations: [{ resourcePieceId: supply.id, quantity: 1 }] });
    expect(createPieceStateIndex(reserved.state.pieceState).get(supply.id)?.resourceQuantity).toBe(4);
    expect(reserved.state.rng.draws).toBe(0);

    const cancel: GameAction = {
      ...ruleActionBase(reserved.state, actor, 'cancel'),
      kind: 'CANCEL_TRANSACTION', transactionId: reserved.state.activeTransaction!.id,
    };
    const cancelled = ruleEngine.applyAction(reserved.state, cancel);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.state.activeTransaction).toBeNull();
    expect(cancelled.state.pendingDecision).toBeNull();
    expect(createPieceStateIndex(cancelled.state.pieceState).get(supply.id)?.resourceQuantity).toBe(4);
    expect(cancelled.state.rng.draws).toBe(0);
  });

  it('rejects non-owner, invalid choice, and advancement across a pending boundary', () => {
    const source = createRuleGameStateFixture();
    const actor = source.scenario.players[0]!.id;
    const state = setRuleSequenceFixture(source, 'COMBAT', 'COMBAT', actor);
    const declare: GameAction = {
      ...ruleActionBase(state, actor, 'declare-pending'),
      kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: ['piece:multi-step' as never], defenderIds: ['piece:ground' as never],
      targetHexId: '3,1' as never,
    };
    const declared = ruleEngine.applyAction(state, declare);
    expect(declared.ok).toBe(true);
    if (!declared.ok) return;
    const invalidAdvance: GameAction = {
      ...ruleActionBase(declared.state, actor, 'advance-pending'), kind: 'ADVANCE_SEQUENCE',
    };
    const invalidChoice: GameAction = {
      ...ruleActionBase(declared.state, actor, 'bad-choice'), kind: 'RESPOND_DECISION',
      decisionId: declared.state.pendingDecision!.id, choiceId: 'not-an-option',
    };
    expect(!ruleEngine.applyAction(declared.state, invalidAdvance).ok).toBe(true);
    const choiceResult = ruleEngine.applyAction(declared.state, invalidChoice);
    expect(!choiceResult.ok && choiceResult.violations.map(({ code }) => code))
      .toContain('INVALID_DECISION_CHOICE');
  });
});
