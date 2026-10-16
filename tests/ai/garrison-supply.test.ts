import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createBotRng, createHeuristicPolicy, parseGameStateJson, pieceHasTrace, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameState } from '../../src/index.js';
import { usageOf } from '../../src/rules/pieces.js';

const context = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return {
    seatId: 'seat:regression' as BotDecisionContext['seatId'], playerId: actorId, memory,
    rng: createBotRng(7, 'garrison-supply', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
    },
  };
};

describe('AI supplies stationary garrisons', () => {
  it('rescues a recorded garrison when shared forward SP cannot cover its ration', () => {
    const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures/garrison-ration-shortfall.state.json.gz'))).toString()) as { snapshot: string };
    const parsed = parseGameStateJson(fixture.snapshot);
    if (!parsed.ok) throw new Error('Invalid recorded game');
    let state = parsed.value;
    const target = state.pieceState.pieces.find(p => p.location.kind === 'ON_MAP' && p.location.hexId === '8,5' && String(p.definitionId).endsWith(':garrison'))!;
    expect(pieceHasTrace(state, target)).toBe(false);
    expect(ruleEngine.projectForViewer(state, target.ownerId).unfundedRationPieceIds).toContain(target.id);
    const enemy = state.scenario.players.find(p => p.id !== target.ownerId)!.id;
    expect(ruleEngine.projectForViewer(state, enemy).unfundedRationPieceIds).toBeUndefined();
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit });
    let memory: BotPhaseMemory = { stepKey: '', actions: 0, notes: new Map() };
    const intents: string[] = [];
    let fed = false;
    for (let guard = 0; guard < 150; guard++) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (memory.stepKey !== key) memory = { stepKey: key, actions: 0, notes: new Map() };
      const ctx = context(state, memory);
      const choice = policy.decide(ctx);
      expect(choice).not.toBeNull();
      if (!choice) break;
      intents.push(choice.intent);
      const next = ruleEngine.applyAction(state, choice.action);
      expect(next.ok, JSON.stringify(choice.action)).toBe(true);
      if (!next.ok) break;
      state = next.state;
      const garrison = state.pieceState.pieces.find(p => p.id === target.id)!;
      if (usageOf(state, garrison).supplyPaid) { fed = true; break; }
      if (state.sequence.phase === 'REACTION') break;
    }
    expect(intents.some(i => /load .*T for the front|cut-off units/.test(i)), intents.join('\n')).toBe(true);
    expect(fed, intents.join('\n')).toBe(true);
  });
});
