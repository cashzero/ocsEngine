import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, hexDistanceBetween, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type GameState, type HexId } from '../../src/index.js';

// 2800311 of heuristic@88's independent batch (Eastern Europe), Game Turn 4, start of attacker's Movement segment.
// Axis independent-hq-1 at 13,16 is unassigned by the theater plan and moved to 11,15 under with-army; from 7,19
// (safe >= 3 from enemy, fed, keeps all dependents) its throw covers uncovered open objectives 0,19 and 0,22
// (docs/quality/evidence/ai-s15-hq-placement-2026-11-19/README.md).
const fixture = (name: string): GameState => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as { snapshot: string };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid fixture');
  return parsed.value;
};

const runFirstPlan = (state: GameState, hqAdvanceTrace: number) => {
  const actorId = state.sequence.actingPlayerId;
  const memory = { stepKey: 's15', actions: 0, notes: new Map<string, unknown>() };
  const context: BotDecisionContext = {
    seatId: 'seat:s15' as BotDecisionContext['seatId'],
    playerId: actorId,
    memory,
    rng: createBotRng(7, 's15', 0),
    view: { projection: ruleEngine.projectForViewer(state, actorId), pendingDecision: state.pendingDecision, stateRevision: state.revision } as unknown as BotDecisionContext['view'],
    actions: {
      families: () => ruleEngine.getActionFamilies(state, actorId).filter((f) => f.enabled).map((f) => f.kind),
      candidates: (kind, pieceId = null, budget = 400) => ruleEngine.getActionCandidates(state, { actorId, kind, pieceId, budget }).actions,
      movementRange: (id) => ruleEngine.queryMovementRange(state, actorId, id).value!,
      explain: (action) => ({ current: true, explanation: ruleEngine.explain(state, action) }),
      traceCoverage: (id = null) => ruleEngine.queryTraceCoverage(state, actorId, id).value!,
      feedCoverage: (id = null) => ruleEngine.queryFeedCoverage(state, actorId, id).value!,
      drawReach: (hexId) => new Set((ruleEngine.queryDrawReach(state, actorId, hexId).value ?? []).map(String)),
      attackStrength: (attackerIds, targetHexId) => ruleEngine.queryAttackStrength(state, actorId, attackerIds, targetHexId).value!,
      projectedReach: (pieceId, fromHexId, mode) => ruleEngine.queryProjectedReach(state, actorId, pieceId, fromHexId, mode).value!,
      hqThrow: (hqId, fromHexId) => ruleEngine.queryHqThrow(state, actorId, hqId, fromHexId).value!,
      railArrivalReach: (fromHexId) => (ruleEngine.queryRailArrivalReach(state, actorId, fromHexId).value ?? []).map(({ hexId }) => hexId),
      extenderSite: (hexId) => ruleEngine.queryExtenderSite(state, actorId, hexId).value ?? { linked: false, drawHexIds: [] },
      traceCut: (pieceId, hexId, mode) => ruleEngine.queryTraceCut(state, actorId, pieceId, hexId, mode).value?.cutIds ?? [],
    },
  };
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
    { weights: heuristicWeights({ hqAdvanceTrace }) });
  policy.decide(context);
  const notes = memory.notes.get('heuristic') as { hqPlan?: Map<string, { moveTo: HexId }> } | undefined;
  return notes?.hqPlan ?? new Map<string, { moveTo: HexId }>();
};

describe('hqAdvanceTrace (bot-hq-logistics-plan, S15)', () => {
  it('assigns an unused attacker HQ to throw trace onto uncovered open objectives when on, and leaves hqPlan unchanged when off', () => {
    const state = fixture('hq-advance-trace-2800311');
    const attackerId = state.configuration.attackVictory!.attackerId;
    const hq = state.pieceState.pieces.find((p) => p.ownerId === attackerId && String(p.id).includes('independent-hq-1'))!;

    const off = runFirstPlan(state, 0);
    expect(off.has(hq.id)).toBe(false);

    const on = runFirstPlan(state, 1);
    const placed = on.get(hq.id);
    expect(placed).toBeDefined();
    expect(String(placed!.moveTo)).toBe('7,19');

    const thrown = ruleEngine.queryHqThrow(state, attackerId, hq.id, placed!.moveTo).value!;
    expect(thrown.fed).toBe(true);
    expect(thrown.hexIds.some((h) => hexDistanceBetween(h, '0,19' as HexId) <= 1)).toBe(true);
    expect(thrown.hexIds.some((h) => hexDistanceBetween(h, '0,22' as HexId) <= 1)).toBe(true);
  }, 60_000);
});
