import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameState, type HexId, type PieceId } from '../../src/index.js';
import { analyze } from '../../src/ai/analysis.js';

// Game Turn 3 of a rollout of 2100130 (heuristic@86 attacking), at the attacker's first Movement decision. SP rail
// brought to the rear lies where no front unit can draw it (docs/quality/evidence/ai-s1-check-2026-11-14/README.md).
const fixture = (): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'hq-bridge-2100130.state.json.gz'))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid HQ bridge fixture');
  return parsed.value;
};
const contextOf = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:bridge' as BotDecisionContext['seatId'], playerId: actorId, memory, rng: createBotRng(7, 'bridge', memory.actions),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter(f => f.enabled).map(f => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: id => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: action => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: hexId => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
      projectedReach: (pieceId, fromHexId, mode) => ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId, mode).value!,
      hqThrow: (hqId, fromHexId) => ruleEngine.queryHqThrow(state, actorId, hqId, fromHexId).value!,
      railArrivalReach: (fromHexId) => (ruleEngine.queryRailArrivalReach(state, actorId, fromHexId).value ?? []).map(({ hexId }) => hexId),
    } };
};
const bridgesOf = (state: GameState, weights: Parameters<typeof heuristicWeights>[0]) => {
  const lines: string[] = [];
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: heuristicWeights(weights), debug: (line) => lines.push(line) });
  policy.decide(contextOf(state, { stepKey: 'bridge', actions: 0, notes: new Map() }));
  const line = lines.find((entry) => entry.includes('THEATER')) ?? '';
  return [...line.matchAll(/ BRIDGE (\S+)>(-?\d+,-?\d+)#(\d+)T/g)].map(([, hqId, hexId, tokens]) => ({ hqId: hqId as PieceId, hexId: hexId as HexId, tokens: Number(tokens) }));
};

describe('HQ bridges (hqBridge)', () => {
  it('sends an HQ no group uses where it draws SP no front unit can draw and throws to the front', () => {
    const state = fixture();
    const me = state.sequence.actingPlayerId;
    expect(bridgesOf(state, {})).toEqual([]);
    const bridges = bridgesOf(state, { hqBridge: 1 });
    expect(bridges.length).toBeGreaterThan(0);
    // The front as the policy sees it: own combat units (not HQs) within 4 hexes of an enemy stack it knows of. The plan
    // also counts its groups' attack positions, so it may find fewer piles out of reach than this, never more.
    const situation = analyze(ruleEngine.projectForViewer(state, me), me, { scenario: state.scenario, turnLimit: 8 });
    const front = new Set(situation.own.filter((unit) => situation.isCombatUnit(unit) && unit.piece.role !== 'HQ'
      && situation.nearestEnemy(unit.hexId).distance <= 4).map(({ hexId }) => String(hexId)));
    const stranded = (ruleEngine.queryFeedCoverage(state, me, null).value ?? []).filter((feed) => !String(feed.dumpId).includes('-stock-')
      && !feed.hexIds.some((hexId) => front.has(String(hexId))));
    for (const { hqId, hexId, tokens } of bridges) {
      expect(tokens).toBeGreaterThanOrEqual(4);
      const thrown = ruleEngine.queryHqThrow(state, me, hqId, hexId).value!;
      expect(thrown.fed).toBe(true);
      expect(thrown.hexIds.some((hex) => front.has(String(hex)))).toBe(true);
      const drawn = stranded.filter((feed) => {
        const dump = state.pieceState.pieces.find((p) => p.id === feed.dumpId);
        return dump?.location.kind === 'ON_MAP' && (ruleEngine.queryDrawReach(state, me, dump.location.hexId).value ?? []).map(String).includes(String(hexId));
      });
      expect(drawn.reduce((sum, feed) => sum + feed.tokens, 0)).toBeGreaterThanOrEqual(tokens);
    }
  });

  it('moves the bridging HQ to its hex this step', () => {
    let state = fixture();
    const [bridge] = bridgesOf(state, { hqBridge: 1 });
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: heuristicWeights({ hqBridge: 1 }) });
    const memory = { stepKey: 'bridge', actions: 0, notes: new Map() } as { stepKey: string; actions: number; notes: BotPhaseMemory['notes'] };
    for (let step = 0; step < 40; step += 1) {
      const chosen = policy.decide(contextOf(state, memory as BotPhaseMemory));
      if (!chosen) break;
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error(`Rejected ${chosen.action.kind}`);
      state = next.state;
      memory.actions += 1;
      if (chosen.action.kind === 'MOVE_PIECE' && chosen.action.pieceId === bridge!.hqId) break;
    }
    const hq = state.pieceState.pieces.find((p) => p.id === bridge!.hqId)!;
    expect(hq.location.kind === 'ON_MAP' ? String(hq.location.hexId) : null).toBe(String(bridge!.hexId));
  }, 60_000);
});
