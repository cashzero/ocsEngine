import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createBotRng, createHeuristicPolicy, heuristicWeights, hexDistanceBetween, parseGameStateJson, ruleEngine,
  type BotDecision, type BotDecisionContext, type GameAction, type GameState, type HexId } from '../../src/index.js';

// Positions of heuristic@87's independent batch (docs/quality/evidence/ai-s4-v87-independent-2026-11-15/README.md), each
// before a move heuristic@86 made in the game (the recorded action):
// - approach-attack-2400201: Game Turn 1, the defender's (Allied) Movement Segment of an attack engagement. Its unit
//   f2-combat-1 heads for the Axis-held objective 15,11 and, at weight 0, walks past it to 13,12, two hexes short.
// - approach-meeting-2400000: Game Turn 1, the Axis Exploitation Movement of a meeting engagement. Its recon heads for
//   15,4 and stops at 13,6, two hexes short; heuristic@87 (no engagement condition) moved it beside 15,4, to 14,5 (S4.8).
const fixture = (name: string) => {
  const stored = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures', `${name}.state.json.gz`))).toString()) as {
    snapshot: string; action: Extract<GameAction, { kind: 'MOVE_PIECE' }>;
  };
  const parsed = parseGameStateJson(stored.snapshot);
  if (!parsed.ok) throw new Error(`Invalid fixture ${name}`);
  return { state: parsed.value, recorded: stored.action };
};
const contextOf = (state: GameState): BotDecisionContext => {
  const actorId = state.sequence.actingPlayerId;
  return { seatId: 'seat:approach' as BotDecisionContext['seatId'], playerId: actorId, memory: { stepKey: 'approach', actions: 0, notes: new Map() },
    rng: createBotRng(7, 'approach', 0),
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
const decide = (state: GameState, approachAttack: number): BotDecision => {
  const policy = createHeuristicPolicy({ scenario: state.scenario, turnLimit: state.configuration.turnLimit },
    { weights: heuristicWeights({ approachAttack }) });
  const chosen = policy.decide(contextOf(state));
  if (!chosen) throw new Error('No decision');
  return chosen;
};
const destination = ({ action }: BotDecision): string => {
  if (action.kind !== 'MOVE_PIECE') throw new Error(`Not a move: ${action.kind}`);
  return String(action.path.at(-1));
};
/** An enemy combat unit the acting player sees in the hex. */
const defended = (state: GameState, hexId: string): boolean => {
  const actorId = state.sequence.actingPlayerId;
  return ruleEngine.projectForViewer(state, actorId).stacks.some((stack) => stack.location.kind === 'ON_MAP' && String(stack.location.hexId) === hexId
    && stack.pieces.some((piece) => piece.ownerId !== actorId && piece.role === 'COMBAT'));
};

describe('closing in beside a defended target (approachAttack, error list E6)', () => {
  it('in an attack engagement, moves a unit of no theater group beside its defended target only when approachAttack is on', () => {
    const { state, recorded } = fixture('approach-attack-2400201');
    expect(state.configuration.attackVictory?.attackerId).toBe('player:axis');
    expect(defended(state, '15,11')).toBe(true);
    const off = decide(state, 0);
    const on = decide(state, 1);
    expect(off.action).toMatchObject({ kind: 'MOVE_PIECE', pieceId: recorded.pieceId, path: recorded.path });
    expect(off.intent).toContain('(capture 15,11)');
    expect(hexDistanceBetween(destination(off) as HexId, '15,11' as HexId)).toBe(2);
    expect(on.action).toMatchObject({ kind: 'MOVE_PIECE', pieceId: recorded.pieceId });
    expect(hexDistanceBetween(destination(on) as HexId, '15,11' as HexId)).toBe(1);
  });

  it('in a meeting engagement, leaves the decision as heuristic@86 makes it', () => {
    const { state, recorded } = fixture('approach-meeting-2400000');
    expect(state.configuration.attackVictory).toBeUndefined();
    expect(defended(state, '15,4')).toBe(true);
    const off = decide(state, 0);
    const on = decide(state, 1);
    expect(off.action).toMatchObject({ kind: 'MOVE_PIECE', pieceId: recorded.pieceId, path: recorded.path });
    expect(off.intent).toContain('(capture 15,4)');
    expect(destination(off)).toBe('13,6');
    expect(on.action).toEqual(off.action);
  });
});
