import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameAction } from '../../src/index.js';

describe('supply gained by a real VP approach', () => {
  it('uses relocation trace rather than pre-move coverage for the recorded approach', () => {
    const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'vp-trace-gain-1221000.state.json.gz'))).toString()) as {
      decisionSnapshot: string; alternative: Extract<GameAction, { kind: 'MOVE_PIECE' }>;
    };
    const parsed = parseGameStateJson(fixture.decisionSnapshot);
    if (!parsed.ok) throw new Error('Invalid recorded move');
    const state = parsed.value, action = fixture.alternative;
    const destination = action.path.at(-1)!;
    expect(ruleEngine.queryTraceCoverage(state, action.actorId, action.pieceId).value!.hexIds).not.toContain(destination);
    const snapshot = JSON.stringify(state);
    const explanation = ruleEngine.explain(state, action);
    expect(explanation.allowed).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(explanation.facts.find(f => f.key === 'supply.relocationMoverHasTrace')?.value).toBe(true);
    expect(explanation.facts.find(f => f.key === 'supply.relocationTraceLost')?.value).toBe(0);
    expect(explanation.facts.find(f => f.key === 'supply.relocationFeedLost')?.value).toBe(0);
    const result = ruleEngine.applyAction(state, action);
    if (!result.ok) throw new Error('Approach rejected');
    const mover = result.state.pieceState.pieces.find(p => p.id === action.pieceId)!;
    expect(mover.location).toEqual({ kind: 'ON_MAP', hexId: destination });
    expect(pieceHasTrace(result.state, mover)).toBe(true);
    for (const piece of state.pieceState.pieces.filter(p => p.ownerId === action.actorId && p.location.kind === 'ON_MAP')) {
      if (pieceHasTrace(state, piece)) expect(pieceHasTrace(result.state, result.state.pieceState.pieces.find(p => p.id === piece.id)!)).toBe(true);
    }
  });
  it('uses the correction in an actual policy continuation through Game End', () => {
    const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'vp-trace-gain-1221000.state.json.gz'))).toString()) as { snapshot: string };
    const parsed = parseGameStateJson(fixture.snapshot);
    if (!parsed.ok) throw new Error('Invalid recorded phase');
    let state = parsed.value, corrected = 0;
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 });
    const memories = new Map<string, BotPhaseMemory>();
    for (let i = 0; i < 3000 && state.sequence.phase !== 'COMPLETE'; i++) {
      const owner = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
      const key = `${owner}:${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (!memories.has(key)) memories.set(key, { stepKey: key, actions: 0, notes: new Map() });
      const context: BotDecisionContext = { seatId: 'seat:trace' as BotDecisionContext['seatId'], playerId: owner,
        memory: memories.get(key)!, rng: createBotRng(7, 'trace', 0),
        view: { projection: ruleEngine.projectForViewer(state, owner), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
        actions: {
          families: () => ruleEngine.getActionFamilies(state, owner).filter(f => f.enabled).map(f => f.kind),
          candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId: owner, kind, pieceId, budget }).actions,
          movementRange: id => ruleEngine.queryMovementRange(state, owner, id).value!,
          explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
          traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, owner, id).value!,
          feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, owner, id).value!,
        } };
      const chosen = policy.decide(context);
      if (!chosen) throw new Error('Bot stalled');
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error('Bot action rejected');
      if (chosen.action.kind === 'MOVE_PIECE' && !chosen.breakdown.some(t => t.term === 'out-of-supply')) {
        const move = chosen.action;
        const mover = next.state.pieceState.pieces.find(p => p.id === move.pieceId)!;
        const role = context.view.projection!.stacks.flatMap(s => s.pieces).find(p => p.id === mover.id)?.role;
        if (['COMBAT', 'ARTILLERY', 'HQ'].includes(role ?? '') && !ruleEngine.queryTraceCoverage(state, owner, mover.id).value!.hexIds.includes(move.path.at(-1)!)) {
          expect(pieceHasTrace(next.state, mover)).toBe(true);
          corrected++;
        }
      }
      state = next.state;
    }
    expect(corrected).toBeGreaterThan(0);
    expect(state.sequence.phase).toBe('COMPLETE');
    expect(state.pendingDecision).toBeNull();
    // heuristic@75 plays this continuation in more actions (about 550 against 470); the time limit is the runner's, not a requirement.
  }, 120_000);
});
