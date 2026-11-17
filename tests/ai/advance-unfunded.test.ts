import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type GameAction, type GameState } from '../../src/index.js';

// 2800204 of heuristic@88's independent batch, Game Turn 4: the attacker has emptied the objective 0,7 (5 points), which
// lies out of its trace, and no attacker's advance is funded (supply.advanceFunded false). The bot answered advance:done
// and left the objective empty.
const fixture = () => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', 'advance-unfunded-2800204.state.json.gz'))).toString()) as {
    snapshot: string; action: Extract<GameAction, { kind: 'RESPOND_DECISION' }>;
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error('Invalid advance fixture');
  return { state: parsed.value, recorded: stored.action };
};
const contextOf = (state: GameState): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:advance' as BotDecisionContext['seatId'], playerId: actorId, memory: { stepKey: 'advance', actions: 0, notes: new Map() },
    rng: createBotRng(7, 'advance', 0),
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
const answer = (state: GameState, advanceUnfunded: number): string => {
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
    { weights: heuristicWeights({ advanceUnfunded }) });
  const chosen = policy.decide(contextOf(state));
  if (!chosen || chosen.action.kind !== 'RESPOND_DECISION') throw new Error('No answer');
  return chosen.action.choiceId;
};

describe('an advance whose next ration is not in hand (advanceUnfunded, S8.1)', () => {
  it('leaves an emptied objective out of trace alone, unless advanceUnfunded is on', () => {
    const { state, recorded } = fixture();
    expect(state.pendingDecision?.kind).toBe('ADVANCE_HEX');
    expect(recorded.choiceId).toBe('advance:done');
    expect(answer(state, 0)).toBe('advance:done');
    const taken = answer(state, 1);
    expect(taken).toMatch(/^advance:generated-oob:/u);
    const action = ruleEngine.getActionCandidates(state, { actorId: state.pendingDecision!.ownerId, kind: 'RESPOND_DECISION', pieceId: null, budget: 50 }).actions
      .find((candidate) => candidate.kind === 'RESPOND_DECISION' && candidate.choiceId === taken)!;
    const facts = ruleEngine.explain(state, action).facts;
    expect(facts.find(({ key }) => key === 'supply.advanceFunded')?.value).toBe(false);
    expect(facts.find(({ key }) => key === 'supply.advanceFeedLost')?.value).toBe(0);
  });
});
