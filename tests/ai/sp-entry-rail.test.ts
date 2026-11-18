import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type GameAction, type GameState, type HexId } from '../../src/index.js';

// Game Turn 3 of a rollout of 2100474 (the theater attacker with the rail fix), at the Reinforcement Phase before the
// attacker places its arriving SP. Enemy units and ZOC cut the rail line out of the entry hex 20,22; from 25,12 rail runs
// on (docs/quality/evidence/ai-supply-gap-attribution-2026-11-13/README.md).
// sp-entry-meeting-2400002: Game Turn 3 of a meeting engagement of heuristic@87's independent batch, before heuristic@86
// placed the Axis SP on the railroad entry hex 25,12; heuristic@87 (no engagement condition) placed it at 20,22 (S4.8).
const fixture = (name = 'sp-entry-rail-2100474') => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as {
    snapshot: string; action: Extract<GameAction, { kind: 'PLACE_REINFORCEMENT' }>;
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid SP entry fixture');
  return { state: parsed.value, recorded: stored.action };
};
const contextOf = (state: GameState): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:entry' as BotDecisionContext['seatId'], playerId: actorId, memory: { stepKey: 'entry', actions: 0, notes: new Map() },
    rng: createBotRng(7, 'entry', 0),
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
      extenderSite: (hexId) => ruleEngine.queryExtenderSite(state, actorId, hexId).value ?? { linked: false, drawHexIds: [] },
      traceCut: (pieceId, hexId, mode) => ruleEngine.queryTraceCut(state, actorId, pieceId, hexId, mode).value?.cutIds ?? [],
    } };
};
/** Where the policy places the arriving SP: other arrivals it places first are applied on the way. */
const spEntry = (state: GameState, weights: Parameters<typeof heuristicWeights>[0], spId: string): HexId => {
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: 8 }, { weights: heuristicWeights(weights) });
  let current = state;
  for (let step = 0; step < 6; step += 1) {
    const chosen = policy.decide(contextOf(current));
    if (!chosen || chosen.action.kind !== 'PLACE_REINFORCEMENT') throw new Error('The policy stopped placing arrivals');
    if (String(chosen.action.pieceId) === spId) return chosen.action.hexId;
    const next = ruleEngine.applyAction(current, chosen.action);
    if (!next.ok) throw new Error('Placement rejected');
    current = next.state;
  }
  throw new Error('The SP was not placed');
};

describe('where arriving SP enters (bot-sp-entry-rail)', () => {
  it('reports the stations rail reaches from an entry hex as the map stands', () => {
    const { state } = fixture();
    const attackerId = state.configuration.attackVictory!.attackerId;
    const reach = (hexId: string) => (ruleEngine.queryRailArrivalReach(state, attackerId, hexId as HexId).value ?? []).map(({ hexId: station }) => String(station));
    expect(reach('20,22')).toEqual(['19,21']);
    expect(reach('25,12')).toEqual(expect.arrayContaining(['20,16', '19,5', '23,11']));
    expect(reach('28,6')).toEqual([]);
    // Not a phase for rail moves: the planning query answers anyway, the move query does not.
    expect(ruleEngine.queryRailMoveOptions(state, attackerId, '25,12' as HexId).value?.destinations ?? []).toEqual([]);
  });

  it('places the SP where rail can carry it forward only when arrivalRailForward is on', () => {
    const { state, recorded } = fixture();
    expect(String(recorded.hexId)).toBe('20,22');
    expect(String(spEntry(state, { arrivalRailForward: 0 }, String(recorded.pieceId)))).toBe('20,22');
    expect(String(spEntry(state, { arrivalRailForward: 1 }, String(recorded.pieceId)))).toBe('25,12');
  });

  it('leaves a meeting engagement\'s entry hex as heuristic@86 chooses it', () => {
    const { state, recorded } = fixture('sp-entry-meeting-2400002');
    expect(state.configuration.attackVictory).toBeUndefined();
    expect(String(recorded.hexId)).toBe('25,12');
    expect(String(spEntry(state, { arrivalRailForward: 0 }, String(recorded.pieceId)))).toBe('25,12');
    expect(String(spEntry(state, { arrivalRailForward: 1 }, String(recorded.pieceId)))).toBe('25,12');
  });
});
