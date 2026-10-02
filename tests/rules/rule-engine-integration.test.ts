import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  CONTACT_NEW_GAME_REQUEST,
  RULE_FEATURE_MANIFEST,
  atStep,
  buildGeneratedRuleState,
  createInitialGameState,
  createRuleQueryCache,
  declareTestCombat,
  generatedPieceId,
  hashGameState,
  hexDistanceBetween,
  parseGameStateJson,
  parseRuleActionId,
  prepareNewGame,
  projectRuleState,
  replayRuleActions,
  ruleEngine,
  ruleQueryCacheKey,
  serializeGameState,
  validateGameState,
  type GameAction,
  type GameState,
  type HexId,
} from '../../src/index.js';

const sourceFiles = (directory: string): readonly string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });

let sequence = 0;
const action = (state: GameState, actorId: GameState['sequence']['actingPlayerId'], body: object): GameAction => {
  const id = parseRuleActionId(`action:integration:${sequence += 1}`);
  if (!id.ok) throw new Error('Invalid action ID.');
  return { actionId: id.value, actorId, expectedRevision: state.revision, ...body } as GameAction;
};

/** A simple aggressive policy that only uses public candidates, used to exercise a whole game. */
const nextAction = (state: GameState, movedThisPhase: Set<string>): GameAction => {
  if (state.pendingDecision) {
    const decision = state.pendingDecision;
    const choice = decision.options.find(({ id }) => id === 'advance:all' || id.startsWith('pay:'))?.id ?? decision.options[0]!.id;
    return action(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: choice });
  }
  const actor = state.sequence.actingPlayerId;
  const candidates = (kind: GameAction['kind'], budget = 20) => ruleEngine.getActionCandidates(state, { actorId: actor, kind, pieceId: null, budget }).actions;
  for (const kind of ['PLACE_REINFORCEMENT', 'RECOVER_INTERNALS', 'CHECK_SUPPLY', 'DECLARE_BARRAGE', 'DECLARE_COMBAT'] as const) {
    const [first] = candidates(kind, 1);
    if (first) return first;
  }
  const enemyHexes = state.pieceState.pieces.filter((piece) => piece.ownerId !== actor && piece.location.kind === 'ON_MAP')
    .map((piece) => (piece.location as { hexId: HexId }).hexId);
  for (const piece of state.pieceState.pieces.filter((candidate) => candidate.ownerId === actor && !movedThisPhase.has(candidate.id))) {
    const moves = ruleEngine.getActionCandidates(state, { actorId: actor, kind: 'MOVE_PIECE', pieceId: piece.id, budget: 400 }).actions;
    // 12.5: a Truck or Track unit must be fueled before it can move.
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

describe('Rule Engine integration over the generated contact scenario', () => {
  it('plays a whole generated game with public actions, then reproduces it by replay', async () => {
    const prepared = prepareNewGame({ ...CONTACT_NEW_GAME_REQUEST, turnLimit: 3 });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const created = createInitialGameState(prepared.value.scenario, prepared.value.configuration, CONTACT_NEW_GAME_REQUEST.seeds.rules);
    expect(created.ok, created.ok ? '' : JSON.stringify(created.error)).toBe(true);
    if (!created.ok) return;
    let state = created.value;
    const actions: GameAction[] = [];
    const kinds = new Set<string>();
    let phaseKey = '';
    const moved = new Set<string>();
    for (let guard = 0; state.sequence.phase !== 'COMPLETE' && guard < 1500; guard += 1) {
      const key = `${state.sequence.gameTurn}:${state.sequence.playerTurnIndex}:${state.sequence.phase}:${state.sequence.segment}`;
      if (key !== phaseKey) { moved.clear(); phaseKey = key; }
      const next = nextAction(state, moved);
      const result = ruleEngine.applyAction(state, next);
      expect(result.ok, result.ok ? '' : `${next.kind} ${JSON.stringify(next).slice(0, 300)} ${result.violations.map(({ code, message }) => code + ':' + message).join(',')}`).toBe(true);
      if (!result.ok) return;
      expect(result.state.revision).toBe(state.revision + 1);
      expect(validateGameState(result.state)).toEqual([]);
      kinds.add(next.kind);
      actions.push(next);
      state = result.state;
    }
    expect(state.sequence.phase).toBe('COMPLETE');
    expect(state.victory.reason).toBe('TURN_LIMIT');
    expect([...kinds]).toEqual(expect.arrayContaining(['ADVANCE_SEQUENCE', 'MOVE_PIECE', 'DECLARE_COMBAT', 'RESPOND_DECISION']));
    const replay = replayRuleActions(created.value, actions);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(await hashGameState(replay.state)).toEqual(await hashGameState(state));
  });

  it('strictly snapshots a combat waiting on the defender and rejects unknown fields', async () => {
    const attacker = generatedPieceId('allied:f1-combat-1');
    const defender = generatedPieceId('axis:f1-combat-1');
    const second = generatedPieceId('axis:f1-combat-2');
    const state = atStep(buildGeneratedRuleState({
      [attacker]: ['5,5', 'COMBAT', 'combat'], [defender]: ['6,5', 'COMBAT', 'combat'], [second]: ['6,5', 'COMBAT', 'combat'],
      [generatedPieceId('allied:independent-supply-1')]: ['4,5', null], [generatedPieceId('axis:independent-supply-1')]: ['7,5', null],
    }), 'COMBAT', 'COMBAT', ALLIED);
    const declared = declareTestCombat(state, ALLIED, 'REGULAR', [attacker], '6,5');
    expect(declared.ok).toBe(true);
    // The attacker's only dump pays automatically; the defender chooses to pay or withhold (9.2 step 2).
    expect(declared.state.pendingDecision).toMatchObject({ kind: 'SUPPLY_SOURCE', ownerId: AXIS });
    const serialized = serializeGameState(declared.state);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const parsed = parseGameStateJson(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(serializeGameState(parsed.value)).toEqual(serialized);
    expect(await hashGameState(parsed.value)).toEqual(await hashGameState(declared.state));
    const unknownTop = parseGameStateJson(JSON.stringify({ ...(JSON.parse(serialized.value) as object), unexpected: true }));
    expect(unknownTop.ok).toBe(false);
    const nested = JSON.parse(serialized.value) as { activeTransaction: Record<string, unknown> };
    nested.activeTransaction.unexpected = true;
    const nestedResult = parseGameStateJson(JSON.stringify(nested));
    expect(nestedResult.ok).toBe(false);
  });

  it('shows the enemy only the top unit of each stack, without steps lost (4.9a)', () => {
    const top = generatedPieceId('axis:f1-combat-1');
    const hidden = generatedPieceId('axis:f1-combat-2');
    const state = buildGeneratedRuleState({ [top]: ['6,5', 'COMBAT', 'combat'], [hidden]: ['6,5', 'MOVE', 'move'] });
    const stack = projectRuleState(state, ALLIED).stacks.find(({ location }) => location.kind === 'ON_MAP' && location.hexId === '6,5')!;
    expect(stack.pieces.map(({ id }) => id)).toEqual([top]);
    expect(stack.pieces[0]).toMatchObject({ redacted: true, remainingSteps: null });
    expect(stack.hiddenCount).toBe(1);
  });

  it('enumerates bounded legal candidates and keeps optional query caching semantic-free', () => {
    const state = atStep(buildGeneratedRuleState({ [generatedPieceId('allied:f1-combat-1')]: ['5,5', 'MOVE', 'move'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const all = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'MOVE_PIECE', pieceId: null, budget: 500 });
    const bounded = ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'MOVE_PIECE', pieceId: null, budget: 1 });
    expect(all.actions.length).toBeGreaterThan(1);
    expect(all.actions.every((candidate) => ruleEngine.validateAction(state, candidate).allowed)).toBe(true);
    expect(bounded.truncated).toBe(true);
    expect(ruleEngine.getActionFamilies(state, ALLIED)).toHaveLength(28);
    const key = ruleQueryCacheKey(state, ALLIED, 'candidate-proof');
    const enabled = createRuleQueryCache(true);
    let computations = 0;
    const compute = () => ({ value: ++computations });
    expect(enabled.getOrCompute(key, compute)).toEqual(enabled.getOrCompute(key, compute));
    expect(createRuleQueryCache(false).size()).toBe(0);
  });

  it('keeps the Rule package headless and every available manifest row evidenced', () => {
    const prohibited = /from\s+['"][^'"]*(?:react|gameplay|generator|generation|(?:^|\/)ai(?:\/|['"])|ui)/giu;
    const leaks = sourceFiles(join(process.cwd(), 'src', 'rules')).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(prohibited)].map((match) => ({ path, text: match[0] })));
    expect(leaks).toEqual([]);
    const available = RULE_FEATURE_MANIFEST.filter(({ status }) => status === 'IMPLEMENTED' || status === 'PARTIAL');
    expect(available.flatMap(({ id, tests }) => tests.length === 0 ? [id] : [])).toEqual([]);
    expect(available.flatMap(({ id, tests }) => tests.filter((test) => !existsSync(join(process.cwd(), 'tests', 'rules', test))).map((test) => `${id}:${test}`))).toEqual([]);
    expect(RULE_FEATURE_MANIFEST.filter(({ status }) => status === 'PARTIAL').every(({ note }) => note.includes('GAP:'))).toBe(true);
  });
});
