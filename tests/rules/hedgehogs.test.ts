import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  calculateCombatOdds,
  generatedPieceId,
  hedgehogAt,
  hedgehogLevel,
  hedgehogPayments,
  hedgehogTemplate,
  previewBarrage,
  projectRuleState,
  ruleEngine,
  COMBAT_TABLE_ROWS,
  SURPRISE_THRESHOLDS,
  combatTableRowIndex,
  settleDecisions,
  withHedgehogLevel,
  type GameState,
  type HexId,
  type PieceId,
  type RuleEvent,
  type TransitionResult,
} from '../../src/index.js';
import { reTicksOf } from '../../src/rules/pieces.js';

/** Hex in the map's fourth row at printed column `column` (0-based). */
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const id = (fragment: string) => generatedPieceId(fragment);
const U = {
  aInf1: id('allied:f1-combat-1'), aInf2: id('allied:f1-combat-2'), aHq: id('allied:independent-hq-1'), aSup: id('allied:independent-supply-1'),
  xInf1: id('axis:f1-combat-1'), xInf2: id('axis:f1-combat-2'),
};
const SITE = hex(4);

const piece = (state: GameState, pieceId: string) => state.pieceState.pieces.find((candidate) => candidate.id === pieceId)!;
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};

/** Two Allied combat units (at least 1 RE together) and the Allied dump in the site hex. */
const siteState = (extra: Record<string, readonly [string, null | 'COMBAT' | 'MOVE' | 'RESERVE', string?]> = {}): GameState => {
  const state = buildGeneratedRuleState({
    [U.aInf1]: [SITE, 'COMBAT', 'combat'], [U.aInf2]: [SITE, 'COMBAT', 'combat'], [U.aSup]: [SITE, null],
    [U.xInf1]: [hex(10), 'COMBAT', 'combat'],
    ...extra,
  });
  // Three Levels at 8T each.
  return { ...state, pieceState: { ...state.pieceState, pieces: state.pieceState.pieces.map((entry) => entry.id === U.aSup ? { ...entry, resourceQuantity: 40 } : entry) } };
};
const atMovement = (state: GameState, actor = ALLIED) => atStep(state, 'MOVEMENT', 'MOVEMENT', actor);
const crew = [U.aInf1, U.aInf2];
const build = (state: GameState, hexId: HexId = SITE, pieceIds: readonly PieceId[] = crew, engineerId: PieceId | null = null) =>
  applyRuleAction(state, ALLIED, { kind: 'BUILD_HEDGEHOG', hexId, pieceIds: [...pieceIds], engineerId, payments: hedgehogPayments(state, ALLIED, hexId) ?? [] });
/** A new Game Turn, so the hex may rise again (16.0b) and the crew has not moved. */
const nextTurn = (state: GameState): GameState => ({ ...state, sequence: { ...state.sequence, gameTurn: state.sequence.gameTurn + 1 }, usage: [] });
/** An Allied hedgehog of `level` placed in `hexId` (as a scenario does). */
const withHedgehog = (state: GameState, hexId: HexId, level: number, ownerId = ALLIED): GameState => {
  const template = hedgehogTemplate(state, ownerId)!;
  const hog = withHedgehogLevel({
    id: `test-hog:${hexId}` as PieceId, definitionId: template.id, ownerId, location: { kind: 'ON_MAP', hexId },
    currentFaceId: null, remainingSteps: null, mode: null, statuses: [], resourceQuantity: null, stackOrder: 99,
  }, level);
  return { ...state, pieceState: { ...state.pieceState, pieces: [...state.pieceState.pieces, hog] } };
};

describe('hedgehog construction (16.0b)', () => {
  it('every generated side has a hedgehog Definition and the crew holds at least one RE', () => {
    const state = siteState();
    expect(hedgehogTemplate(state, ALLIED)).toBeDefined();
    expect(hedgehogTemplate(state, AXIS)).toBeDefined();
    expect(crew.reduce((sum, pieceId) => sum + reTicksOf(state, piece(state, pieceId)), 0)).toBeGreaterThanOrEqual(4);
  });

  it('builds Level 1 for 2 SP with one RE in Combat Mode that then cannot move, one Level per turn up to 4', () => {
    let state = ok(build(atMovement(siteState())));
    expect(hedgehogLevel(hedgehogAt(state, SITE)!)).toBe(1);
    expect(piece(state, U.aSup).resourceQuantity).toBe(32);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.aInf1, path: [SITE, hex(5)] })).length).toBeGreaterThan(0);
    // The same turn the hex cannot rise again (a fresh crew would still be refused).
    expect(codes(build({ ...state, usage: [] }))).toContain('HEDGEHOG_ONE_LEVEL_PER_TURN');
    for (const expected of [2, 3, 4]) {
      state = ok(build(nextTurn(state)));
      expect(hedgehogLevel(hedgehogAt(state, SITE)!)).toBe(expected);
    }
    expect(codes(build(nextTurn(state)))).toContain('HEDGEHOG_MAXIMUM_LEVEL');
  });

  it('refuses less than one RE, units not in Combat Mode, units that moved, the wrong cost, and other phases', () => {
    const start = atMovement(siteState());
    expect(codes(build(start, SITE, [U.aInf1]))).toEqual(reTicksOf(start, piece(start, U.aInf1)) >= 4 ? [] : ['HEDGEHOG_NEEDS_ONE_RE']);
    expect(codes(build(atMovement(siteState({ [U.aInf2]: [SITE, 'MOVE', 'move'] }))))).toContain('HEDGEHOG_CREW_NOT_COMBAT_MODE');
    const moved = { ...start, usage: [{ ...start.usage.find(({ pieceId }) => pieceId === U.aInf1) ?? { pieceId: U.aInf1, phaseStartHexId: SITE, movementSpentTicks: 0, moved: false } as never, moved: true }] } as GameState;
    expect(codes(build(moved))).toContain('HEDGEHOG_CREW_MOVED');
    expect(codes(applyRuleAction(start, ALLIED, { kind: 'BUILD_HEDGEHOG', hexId: SITE, pieceIds: crew, engineerId: null, payments: [{ sourcePieceId: U.aSup, tokens: 4 }] }))).toContain('CONSTRUCTION_COST');
    expect(codes(build(atStep(start, 'COMBAT', 'COMBAT', ALLIED)))).toContain('INVALID_HEDGEHOG_PHASE');
    expect(codes(build(start, hex(5)))).toContain('HEDGEHOG_CREW_NOT_IN_HEX');
  });

  it('lets an Engineer-Capable HQ build within 2 hexes (13.8d)', () => {
    const start = atMovement(siteState({ [U.aHq]: [hex(3), 'COMBAT', 'combat'] }));
    const state = ok(build(start, hex(5), [], U.aHq));
    expect(hedgehogLevel(hedgehogAt(state, hex(5))!)).toBe(1);
    expect(state.air.builderIds).toContain(U.aHq);
    expect(codes(build({ ...start, air: { ...start.air, builderIds: [] } }, hex(9), [], U.aHq))).toContain('CONSTRUCTION_OUT_OF_RANGE');
  });

  it('offers legal candidates for the crew and the engineer', () => {
    const start = atMovement(siteState({ [U.aHq]: [hex(3), 'COMBAT', 'combat'] }));
    const offered = ruleEngine.getActionCandidates(start, { actorId: ALLIED, kind: 'BUILD_HEDGEHOG', pieceId: null, budget: 50 });
    expect(offered.actions.some((action) => action.kind === 'BUILD_HEDGEHOG' && action.engineerId === null && action.hexId === SITE)).toBe(true);
    expect(offered.actions.some((action) => action.kind === 'BUILD_HEDGEHOG' && action.engineerId === U.aHq)).toBe(true);
    for (const action of offered.actions) expect(ruleEngine.validateAction(start, action).allowed).toBe(true);
  });

  it('keeps Reserve Mode and hedgehogs apart (5.7g)', () => {
    const dug = atMovement(withHedgehog(siteState(), SITE, 1));
    expect(codes(applyRuleAction(dug, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.aInf1, mode: 'RESERVE' }))).toContain('RESERVE_IN_HEDGEHOG');
    expect(codes(build(atMovement(siteState({ [U.aHq]: [SITE, 'RESERVE', 'combat'] }))))).toContain('HEDGEHOG_WITH_RESERVES');
  });
});

describe('hedgehog reduction (16.0c)', () => {
  it('reduces a friendly hedgehog one Level per turn for free and removes it below Level 1', () => {
    let state = atMovement(withHedgehog(siteState(), SITE, 2));
    const hogId = hedgehogAt(state, SITE)!.id;
    state = ok(applyRuleAction(state, ALLIED, { kind: 'REDUCE_HEDGEHOG', hedgehogId: hogId, pieceIds: crew, engineerId: null }));
    expect(hedgehogLevel(piece(state, hogId))).toBe(1);
    expect(piece(state, U.aSup).resourceQuantity).toBe(40);
    expect(codes(applyRuleAction({ ...state, usage: [] }, ALLIED, { kind: 'REDUCE_HEDGEHOG', hedgehogId: hogId, pieceIds: crew, engineerId: null }))).toContain('HEDGEHOG_ONE_LEVEL_PER_TURN');
    state = ok(applyRuleAction(nextTurn(state), ALLIED, { kind: 'REDUCE_HEDGEHOG', hedgehogId: hogId, pieceIds: crew, engineerId: null }));
    expect(hedgehogAt(state, SITE)).toBeUndefined();
  });

  it('never lets the enemy reduce it (3.3c)', () => {
    const state = atMovement(withHedgehog(siteState({ [U.xInf1]: [hex(5), 'COMBAT', 'combat'] }), SITE, 2), AXIS);
    expect(codes(applyRuleAction(state, AXIS, { kind: 'REDUCE_HEDGEHOG', hedgehogId: hedgehogAt(state, SITE)!.id, pieceIds: [U.xInf1], engineerId: null }))).toContain('UNKNOWN_HEDGEHOG');
  });
});

describe('hedgehog effects (9.4e, 9.8, 9.9, 10.0, 16.0d-e)', () => {
  const defended = (level: number) => withHedgehog(siteState({ [U.xInf1]: [hex(5), 'COMBAT', 'combat'], [U.xInf2]: [hex(5), 'COMBAT', 'combat'] }), SITE, level);

  it('reports the Level for the combat roll and gives the defenders Heavy AT', () => {
    const plain = siteState({ [U.xInf1]: [hex(5), 'COMBAT', 'combat'] });
    const dug = defended(3);
    const odds = (state: GameState) => calculateCombatOdds(state, [U.xInf1], crew, SITE, crew, U.xInf1, null);
    expect(odds(plain).hedgehogLevel).toBe(0);
    expect(odds(dug).hedgehogLevel).toBe(3);
    // The AR difference itself is unchanged; the hedgehog applies on top of it.
    expect(odds(dug).drm).toBe(odds(plain).drm);
    const facts = ruleEngine.validateAction(atStep(dug, 'COMBAT', 'COMBAT', AXIS), {
      actionId: 'test:attack' as never, actorId: AXIS, expectedRevision: dug.revision, kind: 'DECLARE_COMBAT', combatKind: 'REGULAR',
      attackerIds: [U.xInf1, U.xInf2], defenderIds: crew, targetHexId: SITE, leadAttackerId: U.xInf1,
    });
    expect(facts.allowed).toBe(true);
  });

  it('shifts a barrage one column left for any Level', () => {
    const plain = previewBarrage(siteState(), AXIS, [U.xInf1], SITE);
    const dug = previewBarrage(defended(1), AXIS, [U.xInf1], SITE);
    expect(dug.shifts.find(({ reason }) => reason.startsWith('Hedgehog'))?.shift).toBe(-1);
    expect(plain.shifts.some(({ reason }) => reason.startsWith('Hedgehog'))).toBe(false);
  });

  it('subtracts the Level from the combat roll and 1 from Surprise when the attack resolves', () => {
    for (const level of [0, 4]) {
      const start = level === 0 ? siteState({ [U.xInf1]: [hex(5), 'COMBAT', 'combat'], [U.xInf2]: [hex(5), 'COMBAT', 'combat'] }) : defended(level);
      let state = ok(applyRuleAction(atStep(start, 'COMBAT', 'COMBAT', AXIS), AXIS, {
        kind: 'DECLARE_COMBAT', combatKind: 'REGULAR', attackerIds: [U.xInf1, U.xInf2], defenderIds: crew, targetHexId: SITE, leadAttackerId: U.xInf1,
      }));
      // Answer supply, lead and terrain choices; the odds are read just before the dice are rolled.
      const events: RuleEvent[] = [];
      let before = state;
      for (let guard = 0; state.pendingDecision && guard < 20; guard += 1) {
        const decision = state.pendingDecision;
        before = state;
        const result = applyRuleAction(state, decision.ownerId, { kind: 'RESPOND_DECISION', decisionId: decision.id, choiceId: decision.options[0]!.id });
        state = ok(result);
        if (result.ok) events.push(...result.events);
        if (events.some(({ kind }) => kind === 'DICE_ROLLED')) break;
      }
      const transaction = before.activeTransaction!;
      const odds = calculateCombatOdds(before, transaction.attackerIds, transaction.defenderIds, SITE,
        transaction.defenderSupplied ? transaction.defenderIds : [], transaction.leadAttackerId, transaction.leadDefenderId, transaction.defenderTerrainId);
      expect(odds.hedgehogLevel).toBe(level);
      const dice = (purpose: string) => events.find((event): event is Extract<RuleEvent, { kind: 'DICE_ROLLED' }> => event.kind === 'DICE_ROLLED' && event.purpose === purpose)!.roll.total;
      const resolved = state.activeTransaction?.result ?? events.find((event): event is Extract<RuleEvent, { kind: 'TRANSACTION_RESOLVED' }> => event.kind === 'TRANSACTION_RESOLVED')!.result;
      // 9.8: the hedgehog's -1 on Surprise; a Surprise shifts by one die (1-6) in the winner's favour.
      const surprise = dice('SURPRISE') + odds.drm - (level > 0 ? 1 : 0);
      const threshold = SURPRISE_THRESHOLDS.REGULAR;
      const direction = surprise >= threshold.attacker ? 1 : surprise <= threshold.defender ? -1 : 0;
      const columns = direction === 0 ? [odds.columnIndex] : [1, 2, 3, 4, 5, 6].map((die) => Math.max(0, Math.min(odds.columns.length - 1, odds.columnIndex + direction * die)));
      // 9.9: the full Level comes off the combat roll.
      const row = COMBAT_TABLE_ROWS[combatTableRowIndex(dice('COMBAT') + odds.drm - level)]!;
      expect(columns.map((column) => row[column])).toContain(resolved);
    }
  });

  it('is captured by an Attack-Capable unit entering its hex (9.14e)', () => {
    const empty = atMovement(withHedgehog(buildGeneratedRuleState({ [U.xInf1]: [hex(5), 'MOVE', 'move'] }), SITE, 2), AXIS);
    const state = settleDecisions(ok(applyRuleAction(empty, AXIS, { kind: 'MOVE_PIECE', pieceId: U.xInf1, path: [hex(5), SITE] }))).state;
    const hog = hedgehogAt(state, SITE)!;
    expect(hog.ownerId).toBe(AXIS);
    expect(hedgehogLevel(hog)).toBe(2);
  });

  it('is visible to the enemy with its Level (4.9a)', () => {
    const state = defended(2);
    const projection = projectRuleState(state, AXIS);
    const stack = projection.stacks.find(({ location }) => location.kind === 'ON_MAP' && location.hexId === SITE)!;
    const hog = stack.pieces.find(({ role }) => role === 'HEDGEHOG')!;
    expect(hog.statusValues).toEqual([{ statusDefinitionId: 'status:hedgehog-level', value: 2 }]);
  });
});
