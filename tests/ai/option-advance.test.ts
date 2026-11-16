import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, parseGameStateJson, ruleEngine,
  type BotDecisionContext, type GameAction, type GameState } from '../../src/index.js';

// Positions of 2100411 (artifacts/ai-theater-untraced-games, the theater policy attacking as the Axis), each at the
// attacker's option split after a regular attack on an Allied-held objective with the result Ao1/DL1o1 against one
// defending unit. The bot retreated both times (the recorded answer), forfeiting the advance:
// - option-advance-2100411-67 (Game Turn 1, objective 11,13): taking the step leaves the attackers 1 step.
// - option-advance-2100411-356 (Game Turn 3, objective -4,20): taking the step eliminates the only attacker.
const fixture = (revision: number) => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `option-advance-2100411-${revision}.state.json.gz`))).toString()) as {
    snapshot: string; action: Extract<GameAction, { kind: 'RESPOND_DECISION' }>;
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error(`Invalid fixture ${revision}`);
  return { state: parsed.value, recorded: stored.action };
};
const contextOf = (state: GameState): BotDecisionContext => {
  const actorId = state.pendingDecision?.ownerId ?? state.sequence.actingPlayerId;
  return { seatId: 'seat:option' as BotDecisionContext['seatId'], playerId: actorId, memory: { stepKey: 'option', actions: 0, notes: new Map() },
    rng: createBotRng(7, 'option', 0),
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
const answer = (state: GameState, optionAdvance: number): string => {
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
    // heuristic@86's weights apart from optionAdvance, whatever the defaults are.
    { weights: heuristicWeights({ optionAdvance, approachAttack: 0, arrivalRailForward: 0, hqBridge: 0, defenderCut: 0 }) });
  const chosen = policy.decide(contextOf(state));
  if (!chosen || chosen.action.kind !== 'RESPOND_DECISION') throw new Error('No answer');
  return chosen.action.choiceId;
};
const stepsLeft = (state: GameState, choiceId: string) => {
  const ownerId = state.pendingDecision!.ownerId;
  const action = ruleEngine.getActionCandidates(state, { actorId: ownerId, kind: 'RESPOND_DECISION', pieceId: null, budget: 50 }).actions
    .find((candidate) => candidate.kind === 'RESPOND_DECISION' && candidate.choiceId === choiceId)!;
  return ruleEngine.explain(state, action).facts.find(({ key }) => key === 'combat.optionStepsLeft');
};

describe('an attacker option on an objective (bot-option-retreat-advance)', () => {
  it('tells the attacker, and only it, the steps its attacking units keep after each answer', () => {
    const { state } = fixture(67);
    expect(state.pendingDecision?.kind).toBe('OPTION_SPLIT');
    expect(stepsLeft(state, 'option:1:0')).toMatchObject({ value: 1, visibility: 'OWNER_ONLY', ownerId: state.pendingDecision!.ownerId });
    expect(stepsLeft(state, 'option:0:1')?.value).toBe(2);
    expect(stepsLeft(fixture(356).state, 'option:1:0')?.value).toBe(0);
  });

  it('takes the option as a step loss to keep the advance only when optionAdvance is on', () => {
    const { state, recorded } = fixture(67);
    expect(recorded.choiceId).toBe('option:0:1');
    expect(answer(state, 0)).toBe('option:0:1');
    expect(answer(state, 1)).toBe('option:1:0');
  });

  it('still retreats when the step loss would eliminate every attacker', () => {
    const { state, recorded } = fixture(356);
    expect(recorded.choiceId).toBe('option:0:1');
    expect(answer(state, 0)).toBe('option:0:1');
    expect(answer(state, 1)).toBe('option:0:1');
  });
});
