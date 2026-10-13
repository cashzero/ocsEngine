import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameAction, type GameState } from '../../src/index.js';
import { isCombatUnit } from '../../src/rules/pieces.js';
import { availableRationTokens } from '../../src/rules/supply/relocation-impact.js';

const fixture = (name = 'vp-advance-1258101') => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as {
    snapshot: string; actor: BotDecisionContext['playerId']; point: { hexId: string }; baselineAction: GameAction;
    alternatives: readonly { action: GameAction; lost: readonly string[] }[];
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid advance fixture');
  return { ...stored, state: parsed.value };
};
const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:vp-advance' as BotDecisionContext['seatId'], playerId: actorId, memory, rng: createBotRng(7, 'vp-advance', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
    } };
};

describe('reinforcing a captured VP in recorded combat', () => {
  it('uses a real legal advance to reinforce the weak garrison without taking friendly food or trace', () => {
    const stored = fixture(), state = stored.state;
    expect(state.pendingDecision?.kind).toBe('ADVANCE_HEX');
    const old = ruleEngine.applyAction(state, stored.baselineAction);
    if (!old.ok) throw new Error('Historical stop rejected');
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const chosen = policy.decide(context(state, { stepKey: 'advance', actions: 0, notes: new Map() }))!;
    expect(chosen.action.kind).toBe('RESPOND_DECISION');
    if (chosen.action.kind !== 'RESPOND_DECISION') throw new Error('No advance answer');
    expect(chosen.action.choiceId).not.toBe('advance:done');
    const snapshot = JSON.stringify(state), explanation = ruleEngine.explain(state, chosen.action);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(explanation.allowed).toBe(true);
    expect(explanation.facts.find(f => f.key === 'supply.advanceTraceLost')?.value).toBe(0);
    expect(explanation.facts.find(f => f.key === 'supply.advanceFeedLost')?.value).toBe(0);
    expect(explanation.facts.find(f => f.key === 'supply.advanceMoverHasTrace')?.value).toBe(true);
    const next = ruleEngine.applyAction(state, chosen.action);
    if (!next.ok) throw new Error('Reinforcement rejected');
    const moverId = chosen.action.choiceId.slice('advance:'.length);
    expect(next.state.pieceState.pieces.find(p => p.id === moverId)?.location).toEqual({ kind: 'ON_MAP', hexId: stored.point.hexId });
    for (const piece of state.pieceState.pieces.filter(p => p.ownerId === stored.actor && p.location.kind === 'ON_MAP' && isCombatUnit(state, p))) {
      const after = next.state.pieceState.pieces.find(p => p.id === piece.id)!;
      if (pieceHasTrace(state, piece)) expect(pieceHasTrace(next.state, after)).toBe(true);
      else expect(availableRationTokens(next.state, after)).toBeGreaterThanOrEqual(availableRationTokens(state, piece));
    }
    // The recorded stop left one unit. The integrated reducer must put actual additional defenders on the VP.
    const defenders = (value: GameState) => value.pieceState.pieces.filter(p => p.ownerId === stored.actor && p.location.kind === 'ON_MAP'
      && p.location.hexId === stored.point.hexId && isCombatUnit(value, p)).length;
    expect(defenders(next.state)).toBeGreaterThan(defenders(old.state));
  });
  it('rejects the recorded stronger advance that cuts a friendly combat unit off, and uses a supplied reinforcement', () => {
    const stored = fixture('vp-advance-supply-1258101'), state = stored.state;
    const unsafe = stored.alternatives.find(a => a.lost.length > 0)!;
    const explanation = ruleEngine.explain(state, unsafe.action);
    expect(explanation.allowed).toBe(true);
    const previewLoss = explanation.facts.find(f => f.key === 'supply.advanceTraceLost')?.value;
    expect(previewLoss).toBe(1);
    const bad = ruleEngine.applyAction(state, unsafe.action);
    if (!bad.ok) throw new Error('Recorded unsafe advance rejected');
    const own = state.pieceState.pieces.filter(p => p.ownerId === stored.actor && p.location.kind === 'ON_MAP' && isCombatUnit(state, p));
    const lost = own.filter(p => pieceHasTrace(state, p) && !pieceHasTrace(bad.state, bad.state.pieceState.pieces.find(q => q.id === p.id)!));
    expect(lost).toHaveLength(1);
    // The diagnostic counted every piece: its other two entries are a truck and a hedgehog.
    const allLost = state.pieceState.pieces.filter(p => p.ownerId === stored.actor && p.location.kind === 'ON_MAP'
      && pieceHasTrace(state, p) && !pieceHasTrace(bad.state, bad.state.pieceState.pieces.find(q => q.id === p.id)!));
    expect(allLost).toHaveLength(3);
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const chosen = policy.decide(context(state, { stepKey: 'advance-supply', actions: 0, notes: new Map() }))!;
    expect(chosen.action).not.toMatchObject({ choiceId: 'advance:done' });
    expect(chosen.action).not.toMatchObject({ choiceId: (unsafe.action as Extract<GameAction, { kind: 'RESPOND_DECISION' }>).choiceId });
    const next = ruleEngine.applyAction(state, chosen.action);
    if (!next.ok) throw new Error('Supplied reinforcement rejected');
    for (const p of own) {
      const after = next.state.pieceState.pieces.find(q => q.id === p.id)!;
      if (pieceHasTrace(state, p)) expect(pieceHasTrace(next.state, after)).toBe(true);
      else expect(availableRationTokens(next.state, after)).toBeGreaterThanOrEqual(availableRationTokens(state, p));
    }
  });
});
