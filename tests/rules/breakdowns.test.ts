import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  absorbBreakdowns,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  generateRandomOob,
  generatedPieceId,
  nextBreakdownName,
  projectRuleState,
  queryMovementPath,
  ruleEngine,
  type GameState,
  type HexId,
  type NewGameRequest,
  type TransitionResult,
} from '../../src/index.js';
import { reTicksOf } from '../../src/rules/pieces.js';

/** Four formations per side: every archetype appears, so each side has an infantry and an airborne division. */
const REQUEST: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { scale: 'COMPACT', formationsPerSide: 4 } };
const id = (fragment: string) => generatedPieceId(fragment, REQUEST);
const U = {
  inf: id('allied:f4-combat-1'), abn: id('allied:f2-combat-1'),
  vg: id('axis:f4-combat-1'), fj: id('axis:f2-combat-1'),
  armor: id('allied:f1-combat-1'),
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((candidate) => candidate.id === pieceId)!;
const nameOf = (state: GameState, pieceId: string) => {
  const value = piece(state, pieceId).statuses.find(({ statusDefinitionId }) => statusDefinitionId === 'status:unit-name')?.value;
  return value?.kind === 'TEXT' ? value.value : null;
};
const newPieces = (before: GameState, after: GameState) => after.pieceState.pieces.filter(({ id: pieceId }) => !before.pieceState.pieces.some((old) => old.id === pieceId));
const named = (before: GameState, after: GameState, name: string) => newPieces(before, after).find((entry) => nameOf(after, entry.id) === name)!;
const movement = (placement: Parameters<typeof buildGeneratedRuleState>[0], actor = ALLIED) =>
  atStep(buildGeneratedRuleState(placement, {}, { request: REQUEST }), 'MOVEMENT', 'MOVEMENT', actor);
const detach = (state: GameState, pieceId: string, actor = ALLIED) =>
  applyRuleAction(state, actor, { kind: 'CREATE_BREAKDOWN', pieceId: pieceId as never });

describe('generated Breakdown pools (20.0, 20.0g)', () => {
  it('gives each single-counter division the BTR Breakdown its Action Rating allows', () => {
    const generated = generateRandomOob({ seed: REQUEST.seeds.oob, scale: 'COMPACT', formationsPerSide: 4 });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const definitions = generated.value.pieceDefinitionCatalog.definitions;
    const pool = (fragment: string) => {
      const division = definitions.find(({ id: definitionId }) => definitionId.endsWith(fragment))!;
      const parameter = division.capabilities.find(({ id: capability }) => capability === 'BREAKDOWN')!.parameters.find(({ key }) => key === 'definitionId');
      return definitions.find(({ id: definitionId }) => parameter?.kind === 'TEXT' && definitionId === parameter.value)!.name;
    };
    expect(pool('allied:f4-combat-1')).toBe('US Brkdwn 5-4-3');
    expect(pool('axis:f4-combat-1')).toBe('Ge Brkdwn 3-3-2');
    // Fallschirmjäger are Luftwaffe: the LW pool.
    expect(pool('axis:f2-combat-1')).toBe('Ge LW Brkdwn 4-3-2');
    // Armor/Mech units and multi-unit formations have no pool.
    expect(definitions.find(({ id: definitionId }) => definitionId.endsWith('allied:f1-combat-1'))!.capabilities.some(({ id: capability }) => capability === 'BREAKDOWN')).toBe(false);
  });
});

describe('creating Breakdowns (20.0, 20.0a-c, 20.0e-f)', () => {
  it('detaches a numbered 1 RE, one-step Breakdown in the same mode; the division loses a step and can still move', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'] });
    expect(ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'CREATE_BREAKDOWN', pieceId: U.inf, budget: 10 }).actions).toHaveLength(1);
    const result = detach(state, U.inf);
    expect(result.ok).toBe(true);
    const [breakdown] = newPieces(state, result.state);
    expect(breakdown).toMatchObject({ ownerId: ALLIED, remainingSteps: 1, mode: 'MOVE', currentFaceId: 'move', location: { kind: 'ON_MAP', hexId: '5,5' } });
    expect(nameOf(result.state, breakdown!.id)).toBe('1/99.Inf');
    expect(piece(result.state, U.inf).remainingSteps).toBe(3);
    // 20.0f and 3.2d: one RE moves from the division to the Breakdown.
    expect(reTicksOf(result.state, breakdown!)).toBe(4);
    expect(reTicksOf(result.state, piece(result.state, U.inf))).toBe(12);
    expect(result.state.pieceState.relations).toContainEqual({ kind: 'PARENT', childId: breakdown!.id, parentId: U.inf });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_CREATED', pieceId: U.inf, name: '1/99.Inf' }));
    // 20.0e: no MP cost, and both may move this phase; detaching does not end another unit's move.
    expect(queryMovementPath(result.state, ALLIED, breakdown!.id, ['5,5', '6,5'] as HexId[]).allowed).toBe(true);
    expect(queryMovementPath(result.state, ALLIED, U.inf, ['5,5', '5,6'] as HexId[]).allowed).toBe(true);
    expect(result.state.currentMoverId).toBe(state.currentMoverId);
  });

  it('numbers Breakdowns 1, 2, 3 and never detaches the last step; a number frees up when its Breakdown leaves play', () => {
    let state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'] });
    for (const expected of ['1/99.Inf', '2/99.Inf', '3/99.Inf']) {
      const before = state;
      state = detach(state, U.inf).state;
      expect(named(before, state, expected)).toBeDefined();
    }
    expect(piece(state, U.inf).remainingSteps).toBe(1);
    expect(codes(detach(state, U.inf))).toContain('BREAKDOWN_LAST_STEP');
    // With 2/99.Inf gone, the next Breakdown takes number 2 again.
    const second = state.pieceState.pieces.find((entry) => nameOf(state, entry.id) === '2/99.Inf')!;
    const freed: GameState = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) =>
      entry.id === second.id ? { ...entry, location: { kind: 'ELIMINATED' } } : entry.id === U.inf ? { ...entry, remainingSteps: 2 } : entry) } };
    expect(nextBreakdownName(freed, piece(freed, U.inf))).toBe('2/99.Inf');
  });

  it('only as the unit begins to move, in its own Movement Segment, for eligible movers (20.0a)', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'], [U.vg]: ['12,5', 'MOVE', 'move'] });
    const moved = applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.inf, path: ['5,5', '6,5'] as HexId[] });
    expect(codes(detach(moved.state, U.inf))).toContain('BREAKDOWN_AFTER_MOVE_BEGAN');
    expect(codes(detach(state, U.vg))).toContain('NOT_PIECE_OWNER');
    expect(codes(detach(atStep(state, 'COMBAT', 'COMBAT', ALLIED), U.inf))).toContain('INVALID_MOVEMENT_PHASE');
    expect(codes(detach(atStep(state, 'EXPLOITATION', 'MOVEMENT', ALLIED), U.inf))).toContain('BREAKDOWN_NOT_MOVING');
  });

  it('is unavailable to units without a Breakdown pool (Armor/Mech, one-step units)', () => {
    const state = movement({ [U.armor]: ['5,5', 'MOVE', 'move'] });
    expect(codes(detach(state, U.armor))).toContain('BREAKDOWN_NOT_CAPABLE');
    expect(ruleEngine.getActionCandidates(state, { actorId: ALLIED, kind: 'CREATE_BREAKDOWN', pieceId: U.armor, budget: 5 }).actions).toHaveLength(0);
  });

  it('shows the Breakdown name to the enemy, as printed on the counter', () => {
    const state = movement({ [U.inf]: ['5,5', 'COMBAT', 'combat'] });
    const result = detach(state, U.inf);
    const breakdown = newPieces(state, result.state)[0]!;
    // Move the division off so the Breakdown is the visible top unit of its hex.
    const alone: GameState = { ...result.state, pieceState: { ...result.state.pieceState, pieces: result.state.pieceState.pieces.map((entry) => entry.id === U.inf ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,6' as HexId } } : entry) } };
    const seen = projectRuleState(alone, AXIS).stacks.flatMap(({ pieces }) => pieces).find(({ id: pieceId }) => pieceId === breakdown.id)!;
    expect(seen.redacted).toBe(true);
    expect(seen.statusValues).toContainEqual({ statusDefinitionId: 'status:unit-name', value: '1/99.Inf' });
  });
});

describe('absorbing Breakdowns at the end of a phase (20.0b-d, 20.0g)', () => {
  it('returns a Breakdown left with its reduced division when the phase ends', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'], [U.vg]: ['14,2', 'MOVE', 'move'] });
    const created = detach(state, U.inf);
    const breakdown = newPieces(state, created.state)[0]!;
    const advanced = applyRuleAction(created.state, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    expect(advanced.ok).toBe(true);
    expect(advanced.state.sequence.phase).not.toBe('MOVEMENT');
    expect(piece(advanced.state, U.inf).remainingSteps).toBe(4);
    // Back to the pool: out of play, not in the dead pile.
    expect(advanced.state.pieceState.pieces.some(({ id: pieceId }) => pieceId === breakdown.id)).toBe(false);
    expect(advanced.state.pieceState.relations.some((relation) => relation.kind === 'PARENT' && relation.childId === breakdown.id)).toBe(false);
    expect(advanced.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_ABSORBED', pieceId: U.inf, breakdownId: breakdown.id, name: '1/99.Inf' }));
    // Its number is free again.
    expect(nextBreakdownName(advanced.state, piece(advanced.state, U.inf))).toBe('1/99.Inf');
  });

  it('leaves Breakdowns that moved away, or differ in mode or markers (20.0c)', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'] });
    let next = detach(state, U.inf).state;
    const away = named(state, next, '1/99.Inf');
    next = applyRuleAction(next, ALLIED, { kind: 'MOVE_PIECE', pieceId: away.id, path: ['5,5', '6,5'] as HexId[] }).state;
    next = detach(next, U.inf).state;
    const otherMode = named(state, next, '2/99.Inf');
    next = { ...next, pieceState: { ...next.pieceState, pieces: next.pieceState.pieces.map((entry) => entry.id === otherMode.id ? { ...entry, mode: 'COMBAT', currentFaceId: 'combat' as never } : entry) } };
    const absorbed = absorbBreakdowns(next);
    expect(absorbed.events).toHaveLength(0);
    expect(piece(absorbed.state, U.inf).remainingSteps).toBe(2);
  });

  it('prefers the parent, otherwise any reduced unit of the same pool, never another pool (20.0g)', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'], [U.abn]: ['5,5', 'MOVE', 'move'] });
    let next = detach(state, U.inf).state;
    next = detach(next, U.abn).state;
    const fromInf = named(state, next, '1/99.Inf');
    const fromAbn = named(state, next, '1/17.Abn');
    // Both divisions are reduced and share the US pool: each Breakdown goes back to its own division.
    const both = absorbBreakdowns(next);
    expect(both.events.map((event) => event.kind === 'BREAKDOWN_ABSORBED' ? [event.breakdownId, event.pieceId] : [])).toEqual(expect.arrayContaining([[fromInf.id, U.inf], [fromAbn.id, U.abn]]));
    // Without its parent in the hex, the 99.Inf Breakdown joins the reduced 17.Abn.
    const parentAway: GameState = { ...next, pieceState: { ...next.pieceState, pieces: next.pieceState.pieces.map((entry) => entry.id === U.inf ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,7' as HexId } } : entry.id === fromAbn.id ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,8' as HexId } } : entry) } };
    expect(absorbBreakdowns(parentAway).events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_ABSORBED', pieceId: U.abn, breakdownId: fromInf.id }));
    // A German army Breakdown never joins a Fallschirmjäger division (Luftwaffe pool).
    const axis = atStep(buildGeneratedRuleState({ [U.vg]: ['10,5', 'MOVE', 'move'], [U.fj]: ['10,5', 'MOVE', 'move'] }, {}, { request: REQUEST }), 'MOVEMENT', 'MOVEMENT', AXIS);
    let axisNext = detach(axis, U.vg, AXIS).state;
    axisNext = detach(axisNext, U.fj, AXIS).state;
    const vgBreakdown = named(axis, axisNext, '1/79.VG');
    const vgAway: GameState = { ...axisNext, pieceState: { ...axisNext.pieceState, pieces: axisNext.pieceState.pieces.map((entry) => entry.id === U.vg ? { ...entry, location: { kind: 'ON_MAP', hexId: '10,7' as HexId } } : entry) } };
    expect(absorbBreakdowns(vgAway).events.some((event) => event.kind === 'BREAKDOWN_ABSORBED' && event.breakdownId === vgBreakdown.id)).toBe(false);
  });
});
