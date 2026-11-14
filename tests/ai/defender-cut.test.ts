import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type BotPhaseMemory, type GameState, type HexId, type PieceId } from '../../src/index.js';

// Game Turn 2 of the registered game 2100425 (the theater policy attacking), at the defender's first Movement decision.
// One defender unit standing at 17,11 would cut seven attacker units it sees from their trace
// (docs/quality/evidence/ai-s2-defender-cut-2026-11-14/README.md).
const fixture = (): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'defender-cut-2100425.state.json.gz'))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid defender cut fixture');
  return parsed.value;
};
const contextOf = (state: GameState, memory: BotPhaseMemory): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:cut' as BotDecisionContext['seatId'], playerId: actorId, memory, rng: createBotRng(7, 'cut', memory.actions),
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
      traceCut: (pieceId, hexId, mode) => ruleEngine.queryTraceCut(state, actorId, pieceId, hexId, mode).value?.cutIds ?? [],
    } };
};
const cutsOf = (state: GameState, weights: Parameters<typeof heuristicWeights>[0]) => {
  const lines: string[] = [];
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: heuristicWeights(weights), debug: (line) => lines.push(line) });
  policy.decide(contextOf(state, { stepKey: 'cut', actions: 0, notes: new Map() }));
  const line = lines.find((entry) => entry.includes('CUT ')) ?? '';
  return [...line.matchAll(/ (\S+)>(-?\d+,-?\d+)#(\d+)/g)].map(([, unitId, hexId, cut]) => ({ unitId: unitId as PieceId, hexId: hexId as HexId, cut: Number(cut) }));
};

describe('cutting the attacker supply as the defender sees it (defenderCut)', () => {
  it('counts only enemy units the actor sees, and none cut where the unit already stands', () => {
    const state = fixture();
    const me = state.sequence.actingPlayerId;
    const unit = state.pieceState.pieces.find((piece) => piece.ownerId === me && String(piece.id).endsWith('f3-combat-1:unit'))!;
    const result = ruleEngine.queryTraceCut(state, me, unit.id, '17,11' as HexId, 'COMBAT').value!;
    expect(result.cutIds.length).toBe(7);
    // 4.9a: what the defender sees of the attacker is the projection's enemy pieces.
    const seen = new Set(ruleEngine.projectForViewer(state, me).stacks.flatMap(({ pieces }) => pieces).filter((piece) => piece.ownerId !== me).map(({ id }) => String(id)));
    expect(result.tracedIds.every((id) => seen.has(String(id)))).toBe(true);
    expect(result.cutIds.every((id) => result.tracedIds.includes(id))).toBe(true);
    const stay = unit.location.kind === 'ON_MAP' ? unit.location.hexId : ('' as HexId);
    expect(ruleEngine.queryTraceCut(state, me, unit.id, stay).value!.cutIds).toEqual([]);
  });

  it('plans cutting moves only with the weight, each cutting at least its value', () => {
    const state = fixture();
    expect(cutsOf(state, {})).toEqual([]);
    const cuts = cutsOf(state, { defenderCut: 2 });
    expect(cuts.length).toBeGreaterThan(0);
    for (const { cut } of cuts) expect(cut).toBeGreaterThanOrEqual(2);
    expect(cuts.some(({ unitId, hexId }) => String(unitId).endsWith('f3-combat-1:unit') && hexId === '17,11')).toBe(true);
  });

  it('moves the cutting unit to its hex this step', () => {
    let state = fixture();
    const [first] = cutsOf(state, { defenderCut: 2 });
    const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: heuristicWeights({ defenderCut: 2 }) });
    const memory = { stepKey: 'cut', actions: 0, notes: new Map() } as { stepKey: string; actions: number; notes: BotPhaseMemory['notes'] };
    for (let step = 0; step < 80; step += 1) {
      const chosen = policy.decide(contextOf(state, memory as BotPhaseMemory));
      if (!chosen) break;
      const next = ruleEngine.applyAction(state, chosen.action);
      if (!next.ok) throw new Error(`Rejected ${chosen.action.kind}`);
      state = next.state;
      memory.actions += 1;
      if (chosen.action.kind === 'MOVE_PIECE' && chosen.action.pieceId === first!.unitId) break;
    }
    const unit = state.pieceState.pieces.find((piece) => piece.id === first!.unitId)!;
    expect(unit.location.kind === 'ON_MAP' ? String(unit.location.hexId) : null).toBe(String(first!.hexId));
  }, 120_000);
});
