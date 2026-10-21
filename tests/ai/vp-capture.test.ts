import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  createBotRng, createHeuristicPolicy, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameAction, type GameState,
} from '../../src/index.js';

const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return {
    seatId: 'seat:vp-regression' as BotDecisionContext['seatId'],
    playerId: actorId, memory, rng: createBotRng(7, 'vp-regression', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      movementRange: pieceId => ruleEngine.queryMovementRange(state, actorId, pieceId).value!,
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (pieceId = null) => ruleEngine.queryTraceCoverage(state, actorId, pieceId).value!,
      feedCoverage: (pieceId = null) => ruleEngine.queryFeedCoverage(state, actorId, pieceId).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
    },
  };
};

describe('VP capture in recorded bot positions', () => {
  it.each([
    // Final-turn hunting previously left 2,7 to the opponent: the real final score was 9 vs 1.
    [1210201, 10],
    // An apparent earlier capture opportunity must not override the existing stay/risk comparison. The final score is
    // left to the match batches: one dice trajectory moves with any unrelated change (12 rules seeds: v75 80, v78 83 VP).
    [1210002, null],
  ])('finishes %i (VP %s) while retaining supply protection', (match, expectedVp) => {
    const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `vp-capture-${match}.state.json.gz`))).toString()) as {
      snapshot: string; target: string; action: GameAction;
    };
    const parsed = parseGameStateJson(stored.snapshot);
    if (!parsed.ok) throw new Error('Invalid fixture');
    let state = parsed.value;
    const actorId = stored.action.actorId;
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memories = new Map<string, BotPhaseMemory>();
    let captured = false, decisions = 0;
    for (; decisions < 2000 && state.sequence.phase !== 'COMPLETE'; decisions++) {
      const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
      const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
      const chosen = policy.decide(context(state, memories.get(key)!));
      if (!chosen) throw new Error('Bot stalled');
      if (chosen.action.kind === 'MOVE_PIECE' || chosen.action.kind === 'CHANGE_MODE') {
        const facts = ruleEngine.explain(state, chosen.action).facts;
        for (const name of ['supply.relocationTraceLost', 'supply.relocationFeedLost']) {
          expect(facts.find(f => f.key === name)?.value).toBe(0);
        }
      }
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error(`Rejected ${chosen.action.kind}`);
      state = next.state;
      captured ||= ruleEngine.projectForViewer(state, actorId).objectives.some(o => o.hexId === stored.target && o.controllerId === actorId);
    }
    expect(state.sequence.phase).toBe('COMPLETE');
    expect(state.pendingDecision).toBeNull();
    expect(captured).toBe(true);
    if (expectedVp !== null) expect(state.victory?.scores.find(s => s.playerId === actorId)?.points).toBe(expectedVp);
  }, 60_000);
});
