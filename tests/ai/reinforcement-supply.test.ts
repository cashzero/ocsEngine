import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameAction, type GameState } from '../../src/index.js';
import { hexesBetween } from '../../src/ai/knowledge.js';
import { createHeuristicPolicy as referencePolicy } from './baselines/v35-main-45e700a/policies/heuristic.js';

const fixture = () => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'vp-placement-1235002.state.json.gz'))).toString()) as {
    snapshot: string; action: Extract<GameAction, { kind: 'PLACE_REINFORCEMENT' }>; baselineAction: GameAction;
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid placement fixture');
  return { ...stored, state: parsed.value };
};
const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:placement' as BotDecisionContext['seatId'], playerId: actorId, memory,
    rng: createBotRng(7, 'placement', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    } };
};

describe('replacement arrivals in recorded bot positions', () => {
  it('places Eq in real trace while retaining the two-hex HQ reach', () => {
    const { state, action, baselineAction } = fixture();
    const old = ruleEngine.applyAction(state, baselineAction);
    if (!old.ok) throw new Error('Historical placement rejected');
    expect(pieceHasTrace(old.state, old.state.pieceState.pieces.find(p => p.id === action.pieceId)!)).toBe(false);
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const chosen = policy.decide(context(state, { stepKey: 'placement', actions: 0, notes: new Map() }))!;
    expect(chosen.action.kind).toBe('PLACE_REINFORCEMENT');
    if (chosen.action.kind !== 'PLACE_REINFORCEMENT') throw new Error('No replacement placement');
    expect(chosen.action.pieceId).toBe(action.pieceId);
    const result = ruleEngine.applyAction(state, chosen.action);
    if (!result.ok) throw new Error('Replacement placement rejected');
    const placed = result.state.pieceState.pieces.find(p => p.id === action.pieceId)!;
    expect(pieceHasTrace(result.state, placed)).toBe(true);
    expect(placed.resourceQuantity).toBe(1);
    expect(placed.location.kind).toBe('ON_MAP');
    const destination = chosen.action.hexId;
    expect(ruleEngine.projectForViewer(state, action.actorId).stacks.flatMap(s => s.pieces)
      .some(p => p.ownerId === action.actorId && p.role === 'HQ' && p.location.kind === 'ON_MAP' && hexesBetween(p.location.hexId, destination) <= 2)).toBe(true);
  });

  it.each(['same-policy', 'reference-opponent'] as const)('keeps the arrival supplied and completes the %s continuation', opponent => {
    const stored = fixture();
    let state = stored.state, supplied = false;
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const opposing = opponent === 'reference-opponent' ? referencePolicy({ scenario: state.scenario, turnLimit: 8 }) : policy;
    const memories = new Map<string, BotPhaseMemory>();
    for (let i = 0; i < 2000 && state.sequence.phase !== 'COMPLETE'; i++) {
      const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
      const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
      const chosen = (owner === stored.action.actorId ? policy : opposing).decide(context(state, memories.get(key)!));
      if (!chosen) throw new Error('Bot stalled');
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error('Bot action rejected');
      if (!supplied && next.events.some(e => e.kind === 'SEQUENCE_ADVANCED' && e.from.phase === 'SUPPLY' && e.from.phasingPlayerId === stored.action.actorId)) {
        const arrival = next.state.pieceState.pieces.find(p => p.id === stored.action.pieceId)!;
        expect(arrival.statuses.some(s => s.statusDefinitionId === 'status:out-of-supply')).toBe(false);
        supplied = true;
      }
      state = next.state;
    }
    expect(supplied).toBe(true);
    expect(state.sequence.phase).toBe('COMPLETE');
    expect(state.pendingDecision).toBeNull();
  }, 60_000);
});
