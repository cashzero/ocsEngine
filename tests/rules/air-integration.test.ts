import { describe, expect, it } from 'vitest';
import {
  CONTACT_NEW_GAME_REQUEST,
  createInitialGameState,
  hashGameState,
  hexDistanceBetween,
  parseRuleActionId,
  prepareNewGame,
  projectRuleState,
  replayRuleActions,
  ruleEngine,
  validateGameState,
  type GameAction,
  type GameState,
  type HexId,
  type RuleEvent,
} from '../../src/index.js';

let sequence = 0;
const action = (state: GameState, actorId: GameState['sequence']['actingPlayerId'], body: object): GameAction => {
  const id = parseRuleActionId(`action:air-integration:${sequence += 1}`);
  if (!id.ok) throw new Error('Invalid action ID.');
  return { actionId: id.value, actorId, expectedRevision: state.revision, ...body } as GameAction;
};

/**
 * An aggressive policy over public candidates only: refit, fly every legal air mission (accepting
 * interceptions), barrage and attack, then close with the enemy.
 */
const nextAction = (state: GameState, movedThisPhase: Set<string>): GameAction => {
  if (state.pendingDecision) {
    const decision = state.pendingDecision;
    const choice = decision.options.find(({ id }) => id.startsWith('intercept:') || id === 'advance:all' || id.startsWith('pay:'))?.id ?? decision.options[0]!.id;
    return action(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: choice });
  }
  const actor = state.sequence.actingPlayerId;
  const candidates = (kind: GameAction['kind'], budget = 20) => ruleEngine.getActionCandidates(state, { actorId: actor, kind, pieceId: null, budget }).actions;
  for (const kind of ['REFIT_AIRCRAFT', 'PLACE_REINFORCEMENT', 'RECOVER_INTERNALS', 'CHECK_SUPPLY', 'DECLARE_AIR_MISSION', 'DECLARE_BARRAGE', 'DECLARE_COMBAT'] as const) {
    const [first] = candidates(kind, 1);
    if (first) return first;
  }
  const enemyHexes = state.pieceState.pieces.filter((piece) => piece.ownerId !== actor && piece.location.kind === 'ON_MAP')
    .map((piece) => (piece.location as { hexId: HexId }).hexId);
  for (const piece of state.pieceState.pieces.filter((candidate) => candidate.ownerId === actor && !movedThisPhase.has(candidate.id))) {
    const moves = ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'MOVE_PIECE', pieceId: piece.id, budget: 400 }).actions;
    const [fuel] = moves.length === 0 ? ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'PAY_FUEL', pieceId: piece.id, budget: 1 }).actions : [];
    if (fuel) return fuel;
    movedThisPhase.add(piece.id);
    const scored = moves.flatMap((move) => move.kind === 'MOVE_PIECE'
      ? [{ move, distance: Math.min(...enemyHexes.map((hexId) => hexDistanceBetween(move.path.at(-1)!, hexId))) }] : []);
    const best = scored.sort((left, right) => left.distance - right.distance)[0];
    if (best && best.distance >= 1) return best.move;
  }
  return action(state, actor, { kind: 'ADVANCE_SEQUENCE' });
};

describe('Air power integration over a generated game (A9)', () => {
  it('plays a whole generated game with air forces through public actions and reproduces it by replay', async () => {
    const request = { ...CONTACT_NEW_GAME_REQUEST, map: { ...CONTACT_NEW_GAME_REQUEST.map, width: 14, height: 10 }, oob: { ...CONTACT_NEW_GAME_REQUEST.oob, air: 'STANDARD' as const }, turnLimit: 3 };
    const prepared = prepareNewGame(request);
    expect(prepared.ok, prepared.ok ? '' : JSON.stringify(prepared.error)).toBe(true);
    if (!prepared.ok) return;
    const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, request.seeds.rules);
    expect(created.ok, created.ok ? '' : JSON.stringify(created.error)).toBe(true);
    if (!created.ok) return;
    let state = created.value;
    const actions: GameAction[] = [];
    const kinds = new Set<string>();
    const decisions = new Set<string>();
    const events = new Set<RuleEvent['kind']>();
    const missions = new Set<string>();
    let phaseKey = '';
    const moved = new Set<string>();
    for (let guard = 0; state.sequence.phase !== 'COMPLETE' && guard < 3000; guard += 1) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (key !== phaseKey) { moved.clear(); phaseKey = key; }
      const next = nextAction(state, moved);
      if (state.pendingDecision) decisions.add(state.pendingDecision.kind);
      if (next.kind === 'DECLARE_AIR_MISSION') missions.add(next.mission);
      const result = ruleEngine.applyAction(state, next);
      expect(result.ok, result.ok ? '' : `${next.kind} ${JSON.stringify(next).slice(0, 300)} ${result.violations.map(({ code, message }) => `${code}:${message}`).join(',')}`).toBe(true);
      if (!result.ok) return;
      expect(validateGameState(result.state)).toEqual([]);
      // Each player's projection always builds (air visibility 4.8e/4.9a).
      for (const { id } of result.state.scenario.players) projectRuleState(result.state, id);
      for (const event of result.events) events.add(event.kind);
      kinds.add(next.kind);
      actions.push(next);
      state = result.state;
    }
    expect(state.sequence.phase).toBe('COMPLETE');
    expect([...kinds]).toEqual(expect.arrayContaining(['DECLARE_AIR_MISSION', 'REFIT_AIRCRAFT', 'RESPOND_DECISION']));
    expect([...missions]).toEqual(expect.arrayContaining(['BARRAGE', 'FIGHTER_SWEEP']));
    expect([...events]).toEqual(expect.arrayContaining(['AIR_COMBAT_ROUND', 'FLAK_ROLLED', 'AIRCRAFT_STATUS_CHANGED']));
    expect([...decisions]).toEqual(expect.arrayContaining(['AIR_ABORT', 'AIR_COMBAT_PICK']));
    const replay = replayRuleActions(created.value, actions);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(await hashGameState(replay.state)).toEqual(await hashGameState(state));
  }, 120_000);
});
