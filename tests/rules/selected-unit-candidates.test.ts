import { describe, expect, it } from 'vitest';
import { createRuleGameStateFixture, ruleEngine } from '../../src/index.js';

describe('selected-unit command candidates', () => {
  const fixture = createRuleGameStateFixture();
  const state = { ...fixture, sequence: { ...fixture.sequence, phase: 'MOVEMENT' as const, segment: 'MOVEMENT' as const } };
  it('filters before applying the candidate budget, including mode changes', () => {
    const request = { actorId: state.sequence.actingPlayerId, kind: 'CHANGE_MODE' as const, pieceId: null, budget: 100 };
    const all = ruleEngine.getActionCandidates(state, request).actions;
    const unitIds = [...new Set(all.flatMap(a => a.kind === 'CHANGE_MODE' ? [a.pieceId] : []))];
    expect(unitIds.length).toBeGreaterThan(1);
    const chosen = unitIds.at(-1)!;
    const scoped = ruleEngine.getActionCandidates(state, { ...request, pieceId: chosen, budget: 1 });
    expect(scoped.actions).toEqual(all.filter(a => a.kind === 'CHANGE_MODE' && a.pieceId === chosen).slice(0, 1));
  });
  it('reports the same movement cost charged by an accepted action', () => {
    const action = ruleEngine.getActionCandidates(state, { actorId: state.sequence.actingPlayerId, kind: 'MOVE_PIECE', pieceId: null, budget: 1 }).actions[0]!;
    expect(action.kind).toBe('MOVE_PIECE');
    if (action.kind !== 'MOVE_PIECE') return;
    const explanation = ruleEngine.explain(state, action);
    const cost = explanation.facts.find(f => f.key === 'movement.totalTicks')?.value;
    expect(typeof cost).toBe('number');
    expect(Number(cost)).toBeGreaterThan(0);
    const applied = ruleEngine.applyAction(state, action);
    expect(applied.ok).toBe(true);
    const spentBefore = state.usage.find(u => u.pieceId === action.pieceId)?.movementSpentTicks ?? 0;
    const spentAfter = applied.state.usage.find(u => u.pieceId === action.pieceId)?.movementSpentTicks ?? 0;
    expect(spentAfter - spentBefore).toBe(cost);
    // Cost is supplied by the rules query, not recomputed by the browser.
    expect(explanation.facts.find(f => f.key === 'movement.remainingTicks')).toMatchObject({ visibility: 'OWNER_ONLY', ownerId: action.actorId });
  });
});
