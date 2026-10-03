import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  RULE_FIXTURE_NEW_GAME_REQUEST,
  absorbBreakdowns,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  declareTestCombat,
  generateRandomOob,
  processQueue,
  settleDecisions,
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

/** Five formations per side: each side has two infantry divisions and an airborne division (13.Abn, 9.Inf, 35.Inf; 6.FJ, 12.VG, 340.VG). */
const REQUEST: NewGameRequest = { ...RULE_FIXTURE_NEW_GAME_REQUEST, oob: { scale: 'COMPACT', divisionsPerSide: 5, armoredDivisionsPerSide: 1 } };
const id = (fragment: string) => generatedPieceId(fragment, REQUEST);
const U = {
  inf: id('allied:f4-combat-1'), abn: id('allied:f2-combat-1'), inf2: id('allied:f5-combat-1'),
  vg: id('axis:f4-combat-1'), fj: id('axis:f2-combat-1'),
  armor: id('allied:f1-combat-1'),
};
const withPieces = (state: GameState, change: (entry: GameState['pieceState']['pieces'][number]) => GameState['pieceState']['pieces'][number]): GameState =>
  ({ ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map(change) } });
const respond = (state: GameState, choiceId: string) =>
  applyRuleAction(state, state.pendingDecision!.ownerId, { kind: 'RESPOND_DECISION', decisionId: state.pendingDecision!.id, choiceId });
/** A declared combat whose resolution queue is replaced by `queue`, then run (9.12 steps without dice). */
const resolving = (
  state: GameState, attackerIds: readonly string[], targetHexId: string, queue: NonNullable<GameState['activeTransaction']>['queue'],
  prepare: (declared: GameState) => GameState = (declared) => declared,
): GameState => {
  const declared = declareTestCombat(atStep(state, 'COMBAT', 'COMBAT', ALLIED), ALLIED, 'REGULAR', attackerIds as never, targetHexId);
  expect(declared.ok, declared.ok ? '' : declared.violations.map(({ code }) => code).join(',')).toBe(true);
  const ready = prepare(declared.state);
  return processQueue({ ...ready, pendingDecision: null, activeTransaction: { ...ready.activeTransaction!, step: 'RESOLVING', queue } }).state;
};
const hexOfPiece = (state: GameState, pieceId: string) => { const location = piece(state, pieceId).location; return location.kind === 'ON_MAP' ? location.hexId : null; };
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
    const generated = generateRandomOob({ seed: REQUEST.seeds.oob, scale: 'COMPACT', divisionsPerSide: 4, armoredDivisionsPerSide: 1 });
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
    expect(nameOf(result.state, breakdown!.id)).toBe('1/9.Inf');
    expect(piece(result.state, U.inf).remainingSteps).toBe(3);
    // 20.0f and 3.2d: one RE moves from the division to the Breakdown.
    expect(reTicksOf(result.state, breakdown!)).toBe(4);
    expect(reTicksOf(result.state, piece(result.state, U.inf))).toBe(12);
    expect(result.state.pieceState.relations).toContainEqual({ kind: 'PARENT', childId: breakdown!.id, parentId: U.inf });
    expect(result.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_CREATED', pieceId: U.inf, name: '1/9.Inf' }));
    // 20.0e: no MP cost, and both may move this phase; detaching does not end another unit's move.
    expect(queryMovementPath(result.state, ALLIED, breakdown!.id, ['5,5', '6,5'] as HexId[]).allowed).toBe(true);
    expect(queryMovementPath(result.state, ALLIED, U.inf, ['5,5', '5,6'] as HexId[]).allowed).toBe(true);
    expect(result.state.currentMoverId).toBe(state.currentMoverId);
  });

  it('numbers Breakdowns 1, 2, 3 and never detaches the last step; a number frees up when its Breakdown leaves play', () => {
    let state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'] });
    for (const expected of ['1/9.Inf', '2/9.Inf', '3/9.Inf']) {
      const before = state;
      state = detach(state, U.inf).state;
      expect(named(before, state, expected)).toBeDefined();
    }
    expect(piece(state, U.inf).remainingSteps).toBe(1);
    expect(codes(detach(state, U.inf))).toContain('BREAKDOWN_LAST_STEP');
    // With 2/9.Inf gone, the next Breakdown takes number 2 again.
    const second = state.pieceState.pieces.find((entry) => nameOf(state, entry.id) === '2/9.Inf')!;
    const freed: GameState = { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) =>
      entry.id === second.id ? { ...entry, location: { kind: 'ELIMINATED' } } : entry.id === U.inf ? { ...entry, remainingSteps: 2 } : entry) } };
    expect(nextBreakdownName(freed, piece(freed, U.inf))).toBe('2/9.Inf');
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
    expect(seen.statusValues).toContainEqual({ statusDefinitionId: 'status:unit-name', value: '1/9.Inf' });
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
    expect(advanced.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_ABSORBED', pieceId: U.inf, breakdownId: breakdown.id, name: '1/9.Inf' }));
    // Its number is free again.
    expect(nextBreakdownName(advanced.state, piece(advanced.state, U.inf))).toBe('1/9.Inf');
  });

  it('leaves Breakdowns that moved away, or differ in mode or markers (20.0c)', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'] });
    let next = detach(state, U.inf).state;
    const away = named(state, next, '1/9.Inf');
    next = applyRuleAction(next, ALLIED, { kind: 'MOVE_PIECE', pieceId: away.id, path: ['5,5', '6,5'] as HexId[] }).state;
    next = detach(next, U.inf).state;
    const otherMode = named(state, next, '2/9.Inf');
    next = { ...next, pieceState: { ...next.pieceState, pieces: next.pieceState.pieces.map((entry) => entry.id === otherMode.id ? { ...entry, mode: 'COMBAT', currentFaceId: 'combat' as never } : entry) } };
    const absorbed = absorbBreakdowns(next);
    expect(absorbed.events).toHaveLength(0);
    expect(piece(absorbed.state, U.inf).remainingSteps).toBe(2);
  });

  it('prefers the parent, otherwise any reduced unit of the same pool, never another pool (20.0g)', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'], [U.abn]: ['5,5', 'MOVE', 'move'] });
    let next = detach(state, U.inf).state;
    next = detach(next, U.abn).state;
    const fromInf = named(state, next, '1/9.Inf');
    const fromAbn = named(state, next, '1/13.Abn');
    // Both divisions are reduced and share the US pool: each Breakdown goes back to its own division.
    const both = absorbBreakdowns(next);
    expect(both.events.map((event) => event.kind === 'BREAKDOWN_ABSORBED' ? [event.breakdownId, event.pieceId] : [])).toEqual(expect.arrayContaining([[fromInf.id, U.inf], [fromAbn.id, U.abn]]));
    // Without its parent in the hex, the 9.Inf Breakdown joins the reduced 13.Abn.
    const parentAway: GameState = { ...next, pieceState: { ...next.pieceState, pieces: next.pieceState.pieces.map((entry) => entry.id === U.inf ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,7' as HexId } } : entry.id === fromAbn.id ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,8' as HexId } } : entry) } };
    expect(absorbBreakdowns(parentAway).events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_ABSORBED', pieceId: U.abn, breakdownId: fromInf.id }));
    // A German army Breakdown never joins a Fallschirmjäger division (Luftwaffe pool).
    const axis = atStep(buildGeneratedRuleState({ [U.vg]: ['10,5', 'MOVE', 'move'], [U.fj]: ['10,5', 'MOVE', 'move'] }, {}, { request: REQUEST }), 'MOVEMENT', 'MOVEMENT', AXIS);
    let axisNext = detach(axis, U.vg, AXIS).state;
    axisNext = detach(axisNext, U.fj, AXIS).state;
    const vgBreakdown = named(axis, axisNext, '1/12.VG');
    const vgAway: GameState = { ...axisNext, pieceState: { ...axisNext.pieceState, pieces: axisNext.pieceState.pieces.map((entry) => entry.id === U.vg ? { ...entry, location: { kind: 'ON_MAP', hexId: '10,7' as HexId } } : entry) } };
    expect(absorbBreakdowns(vgAway).events.some((event) => event.kind === 'BREAKDOWN_ABSORBED' && event.breakdownId === vgBreakdown.id)).toBe(false);
  });
});

describe('the owner chooses the absorber when the division is not there (20.0d, 20.0g)', () => {
  it('asks which of two eligible units absorbs a Breakdown before the phase ends', () => {
    const state = movement({ [U.abn]: ['5,8', 'MOVE', 'move'], [U.inf]: ['5,5', 'MOVE', 'move'], [U.inf2]: ['5,5', 'MOVE', 'move'], [U.vg]: ['14,2', 'MOVE', 'move'] });
    const created = detach(state, U.abn);
    expect(codes(created)).toEqual([]);
    const fromAbn = named(state, created.state, '1/13.Abn');
    // The 13.Abn Breakdown has reached 5,5, where 9.Inf and 35.Inf (same US pool) are reduced, as if by combat.
    const next = withPieces(created.state, (entry) => entry.id === fromAbn.id ? { ...entry, location: { kind: 'ON_MAP', hexId: '5,5' as HexId }, stackOrder: 50 }
      : entry.id === U.inf || entry.id === U.inf2 ? { ...entry, remainingSteps: 3 } : entry);
    expect(projectRuleState(next, ALLIED).breakdownAbsorptions).toEqual([{ breakdownId: fromAbn.id, absorberIds: [U.inf, U.inf2] }]);
    expect(projectRuleState(next, AXIS).breakdownAbsorptions).toEqual([]);

    const asked = applyRuleAction(next, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    expect(codes(asked)).toEqual([]);
    expect(asked.state.sequence.phase).toBe('MOVEMENT');
    expect(asked.state.pendingDecision).toMatchObject({ kind: 'BREAKDOWN_ABSORPTION', ownerId: ALLIED });
    expect(asked.state.pendingDecision!.options.map(({ label }) => label)).toEqual(['9.Inf absorbs 1/13.Abn', '35.Inf absorbs 1/13.Abn']);
    const chosen = respond(asked.state, asked.state.pendingDecision!.options[1]!.id);
    expect(chosen.ok).toBe(true);
    expect(piece(chosen.state, U.inf2).remainingSteps).toBe(4);
    expect(piece(chosen.state, U.inf).remainingSteps).toBe(3);
    expect(chosen.state.pieceState.pieces.some(({ id: pieceId }) => pieceId === fromAbn.id)).toBe(false);
    expect(chosen.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_ABSORBED', pieceId: U.inf2, breakdownId: fromAbn.id }));
    expect(chosen.state.sequence.phase).not.toBe('MOVEMENT');
  });

  it('does not ask when the division is there or only one unit can take it', () => {
    const state = movement({ [U.inf]: ['5,5', 'MOVE', 'move'], [U.inf2]: ['5,5', 'MOVE', 'move'], [U.vg]: ['14,2', 'MOVE', 'move'] });
    let next = detach(state, U.inf).state;
    next = withPieces(next, (entry) => entry.id === U.inf2 ? { ...entry, remainingSteps: 3 } : entry);
    const breakdown = named(state, next, '1/9.Inf');
    expect(projectRuleState(next, ALLIED).breakdownAbsorptions).toEqual([{ breakdownId: breakdown.id, absorberIds: [U.inf] }]);
    const advanced = applyRuleAction(next, ALLIED, { kind: 'ADVANCE_SEQUENCE' });
    expect(advanced.state.pendingDecision?.kind).not.toBe('BREAKDOWN_ABSORPTION');
    expect(piece(advanced.state, U.inf).remainingSteps).toBe(4);
    expect(piece(advanced.state, U.inf2).remainingSteps).toBe(3);
  });
});

describe('Breakdowns when retreating or advancing after combat (20.0a)', () => {
  it('lets a retreating division detach a Breakdown that retreats with it or on its own', () => {
    const state = buildGeneratedRuleState({ [U.inf]: ['5,5', 'COMBAT', 'combat'], [U.vg]: ['6,5', 'COMBAT', 'combat'] }, {}, { request: REQUEST });
    const asked = resolving(state, [U.inf], '6,5', [{ kind: 'RETREAT', side: 'DEFENDER', hexes: 1, pieceIds: [U.vg] }]);
    expect(asked.pendingDecision).toMatchObject({ kind: 'RETREAT_HEX', ownerId: AXIS });
    const option = asked.pendingDecision!.options.find(({ id: optionId }) => optionId === `breakdown:${U.vg}`);
    expect(option?.label).toBe('Detach a Breakdown from 12.VG first (it retreats too)');

    const detached = respond(asked, option!.id);
    expect(detached.ok).toBe(true);
    const breakdown = named(asked, detached.state, '1/12.VG');
    expect(piece(detached.state, U.vg).remainingSteps).toBe(3);
    expect(detached.events).toContainEqual(expect.objectContaining({ kind: 'BREAKDOWN_CREATED', pieceId: U.vg, name: '1/12.VG' }));
    // Asked again with both units, which may now retreat separately.
    expect(detached.state.pendingDecision?.kind).toBe('RETREAT_HEX');
    expect(detached.state.pendingDecision!.prompt).toMatch(/the units end/u);
    const split = respond(detached.state, 'split');
    expect(split.ok).toBe(true);
    const done = settleDecisions(split.state, (decision) => decision.options.find(({ id: optionId }) => optionId.startsWith('hex:'))?.id ?? decision.options[0]!.id).state;
    expect(done.activeTransaction).toBeNull();
    expect(hexOfPiece(done, U.vg)).not.toBe('6,5');
    expect(hexOfPiece(done, breakdown.id)).not.toBe('6,5');
    expect(hexOfPiece(done, breakdown.id)).not.toBeNull();
  });

  it('lets an advancing division detach a Breakdown that advances on its own', () => {
    const state = buildGeneratedRuleState({ [U.inf]: ['5,5', 'COMBAT', 'combat'], [U.vg]: ['6,5', 'COMBAT', 'combat'] }, {}, { request: REQUEST });
    // The defender is gone, so 6,5 is vacant for the advance.
    const asked = resolving(state, [U.inf], '6,5', [{ kind: 'ADVANCE' }],
      (declared) => withPieces(declared, (entry) => entry.id === U.vg ? { ...entry, location: { kind: 'ELIMINATED' } } : entry));
    expect(asked.pendingDecision?.kind).toBe('ADVANCE_HEX');
    const option = asked.pendingDecision!.options.find(({ id: optionId }) => optionId === `advance-breakdown:${U.inf}`);
    expect(option?.label).toBe('Detach a Breakdown from 9.Inf (it may advance on its own)');

    const detached = respond(asked, option!.id);
    expect(detached.ok).toBe(true);
    const breakdown = named(asked, detached.state, '1/9.Inf');
    expect(detached.state.pendingDecision?.kind).toBe('ADVANCE_HEX');
    const advance = respond(detached.state, `advance:${breakdown.id}`);
    expect(advance.ok).toBe(true);
    expect(hexOfPiece(advance.state, breakdown.id)).toBe('6,5');
    const finished = respond(advance.state, 'advance:done');
    expect(finished.ok).toBe(true);
    expect(finished.state.activeTransaction).toBeNull();
    expect(hexOfPiece(finished.state, U.inf)).toBe('5,5');
    expect(piece(finished.state, U.inf).remainingSteps).toBe(3);
  });

  it('offers no Breakdown to a unit on its last step', () => {
    const state = withPieces(buildGeneratedRuleState({ [U.inf]: ['5,5', 'COMBAT', 'combat'], [U.vg]: ['6,5', 'COMBAT', 'combat'] }, {}, { request: REQUEST }),
      (entry) => entry.id === U.vg ? { ...entry, remainingSteps: 1 } : entry);
    const asked = resolving(state, [U.inf], '6,5', [{ kind: 'RETREAT', side: 'DEFENDER', hexes: 1, pieceIds: [U.vg] }]);
    expect((asked.pendingDecision?.options ?? []).some(({ id: optionId }) => optionId.startsWith('breakdown:'))).toBe(false);
  });
});
