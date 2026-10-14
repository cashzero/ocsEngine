import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  createRulesRng,
  declareTestCombat,
  generatedPieceId,
  queryReachableHexes,
  queryStackMovementPath,
  queryStackReachableHexes,
  ruleEngine,
  settleDecisions,
  type GameState,
  type HexId,
  type PieceId,
  type Placement,
  type TransitionResult,
} from '../../src/index.js';
import { combatCandidatesFor } from '../../src/rules/query/candidates.js';

const U = {
  trk: generatedPieceId('allied:f1-combat-1'), trk2: generatedPieceId('allied:f1-combat-2'),
  leg: generatedPieceId('allied:f2-combat-1'), sup: generatedPieceId('allied:independent-supply-1'),
  axTrk: generatedPieceId('axis:f1-combat-1'), axTruck: generatedPieceId('axis:f2-combat-1'),
};
const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const hexOf = (state: GameState, id: PieceId) => {
  const location = state.pieceState.pieces.find((piece) => piece.id === id)!.location;
  return location.kind === 'ON_MAP' ? location.hexId : null;
};
const spent = (state: GameState, id: PieceId) => state.usage.find(({ pieceId }) => pieceId === id)?.movementSpentTicks ?? 0;
const path = (...hexes: string[]) => hexes as HexId[];
const move = (state: GameState, pieceId: PieceId, route: readonly HexId[], companionIds?: readonly PieceId[]) =>
  applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId, path: route, ...(companionIds ? { companionIds } : {}) });

const stackAt = (hexId: string, extra: Placement = {}) => atStep(buildGeneratedRuleState({
  [U.trk]: [hexId, 'MOVE', 'move'], [U.trk2]: [hexId, 'MOVE', 'move'], [U.axTrk]: ['14,5', 'COMBAT', 'combat'], ...extra,
}), 'MOVEMENT', 'MOVEMENT', ALLIED);

describe('moving a stack together (6.1f)', () => {
  it('moves the whole stack along one path, each unit paying from its own MA (6.1e)', () => {
    const state = stackAt('5,5');
    const moved = move(state, U.trk, path('5,5', '6,5'), [U.trk2]);
    expect(moved.ok).toBe(true);
    expect([hexOf(moved.state, U.trk), hexOf(moved.state, U.trk2)]).toEqual(['6,5', '6,5']);
    expect(spent(moved.state, U.trk)).toBeGreaterThan(0);
    expect(spent(moved.state, U.trk2)).toBe(spent(moved.state, U.trk));
    expect(moved.events.filter(({ kind }) => kind === 'PIECE_MOVED')).toHaveLength(2);
    expect(moved.state.movingStackIds).toEqual([U.trk, U.trk2]);
    expect(ruleEngine.projectForViewer(moved.state, ALLIED).movingStackIds).toEqual([U.trk, U.trk2]);
    expect(ruleEngine.projectForViewer(moved.state, AXIS).movingStackIds).toEqual([]);
    // The stack keeps moving together.
    const again = move(moved.state, U.trk, path('6,5', '7,5'), [U.trk2]);
    expect(again.ok).toBe(true);
    expect(hexOf(again.state, U.trk2)).toBe('7,5');
  });

  it('drops off units that do not go on; a dropped unit cannot move further (6.1f)', () => {
    let state = move(stackAt('5,5'), U.trk, path('5,5', '6,5'), [U.trk2]).state;
    const onward = move(state, U.trk, path('6,5', '7,5'));
    expect(onward.ok).toBe(true);
    state = onward.state;
    expect(state.movingStackIds).toBeUndefined();
    expect(state.currentMoverId).toBe(U.trk);
    expect(hexOf(state, U.trk2)).toBe('6,5');
    expect(codes(move(state, U.trk2, path('6,5', '6,6')))).toContain('MOVEMENT_ALREADY_FINISHED');
    // The unit that went on still moves.
    expect(move(state, U.trk, path('7,5', '8,5')).ok).toBe(true);
  });

  it('never picks up a unit once the stack is under way (6.1f)', () => {
    const state = move(stackAt('5,5', { [U.leg]: ['6,5', 'MOVE', 'move'] }), U.trk, path('5,5', '6,5'), [U.trk2]).state;
    expect(codes(move(state, U.trk, path('6,5', '7,5'), [U.trk2, U.leg]))).toContain('STACK_CANNOT_PICK_UP');
    expect(queryStackReachableHexes(state, ALLIED, [U.trk, U.leg]).allowed).toBe(false);
    // A separate unit starting its own move ends the stack's move (6.1g).
    const other = move(state, U.leg, path('6,5', '6,6'));
    expect(other.ok).toBe(true);
    expect(codes(move(other.state, U.trk, path('6,5', '7,5'), [U.trk2]))).toContain('MOVEMENT_ALREADY_FINISHED');
  });

  it('only moves units that share the origin Hex', () => {
    const state = stackAt('5,5', { [U.leg]: ['5,7', 'MOVE', 'move'] });
    expect(codes(move(state, U.trk, path('5,5', '6,5'), [U.leg]))).toContain('PATH_ORIGIN_MISMATCH');
    expect(codes(move(state, U.trk, path('5,5', '6,5'), [U.trk2, U.trk2]))).toContain('DUPLICATE_STACK_UNIT');
  });

  it('finishes the whole stack with one Done (6.1g)', () => {
    const state = move(stackAt('5,5'), U.trk, path('5,5', '6,5'), [U.trk2]).state;
    const ended = applyRuleAction(state, ALLIED, { kind: 'END_MOVE', pieceId: U.trk2 });
    expect(ended.ok).toBe(true);
    expect(ended.events.filter(({ kind }) => kind === 'MOVE_ENDED')).toHaveLength(2);
    expect(ended.state.currentMoverId).toBeNull();
    expect(ended.state.movingStackIds).toBeUndefined();
    for (const id of [U.trk, U.trk2]) expect(codes(move(ended.state, id, path('6,5', '7,5')))).toContain('MOVEMENT_ALREADY_FINISHED');
  });

  it('lets a stack change mode unit by unit as it begins to move, then move off together (5.4)', () => {
    let state = atStep(buildGeneratedRuleState({ [U.trk]: ['5,5', 'COMBAT', 'combat'], [U.trk2]: ['5,5', 'COMBAT', 'combat'], [U.axTrk]: ['14,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    state = applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.trk, mode: 'MOVE' }).state;
    state = applyRuleAction(state, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.trk2, mode: 'MOVE' }).state;
    expect(state.movingStackIds).toEqual([U.trk, U.trk2]);
    expect(move(state, U.trk, path('5,5', '6,5'), [U.trk2]).ok).toBe(true);
  });

  it('reaches only Hexes every unit of the stack can reach on one path', () => {
    // Tracked and leg units pay different costs from different MAs (6.1e): the stack goes only where both can.
    const state = stackAt('5,5', { [U.leg]: ['5,5', 'MOVE', 'move'], [U.axTrk]: ['9,5', 'COMBAT', 'combat'] });
    expect(queryStackReachableHexes(state, ALLIED, [U.trk, U.leg]).value!.length).toBeLessThan(queryReachableHexes(state, ALLIED, U.trk).value!.length);
    for (const ids of [[U.trk, U.leg], [U.trk, U.trk2, U.leg]]) {
      const stack = queryStackReachableHexes(state, ALLIED, ids);
      expect(stack.allowed).toBe(true);
      expect(stack.value!.length).toBeGreaterThan(0);
      const alone = ids.map((id) => new Set(queryReachableHexes(state, ALLIED, id).value!.map(({ hexId }) => hexId)));
      for (const entry of stack.value!) {
        for (const reach of alone) expect(reach.has(entry.hexId)).toBe(true);
        expect(queryStackMovementPath(state, ALLIED, ids, entry.path).allowed).toBe(true);
        expect(entry.remainingAfterTicks).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('overrunning with a moving stack (6.1f, 8.0-8.1)', () => {
  const fight = { [U.trk]: ['5,5', 'MOVE', 'move'], [U.trk2]: ['5,5', 'MOVE', 'move'], [U.axTruck]: ['7,5', 'MOVE', 'move'], [U.sup]: ['5,6', null] } as const;
  const approach = (seed = 1) => {
    const state = atStep(buildGeneratedRuleState(fight), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moved = move({ ...state, rng: createRulesRng(seed) }, U.trk, path('5,5', '6,5'), [U.trk2]);
    expect(moved.ok).toBe(true);
    return moved.state;
  };

  it('offers the moving stack as one overrun, and lets the whole stack overrun after moving', () => {
    const state = approach();
    const candidates = combatCandidatesFor(state, ALLIED, 'OVERRUN', U.trk);
    expect(candidates[0]).toMatchObject({ kind: 'DECLARE_COMBAT', attackerIds: [U.trk, U.trk2] });
    const declared = declareTestCombat(state, ALLIED, 'OVERRUN', [U.trk, U.trk2], '7,5');
    expect(declared.ok).toBe(true);
    expect(declared.state.movingStackIds).toEqual([U.trk, U.trk2]);
  });

  it('drops off the units left out of an overrun (8.1g)', () => {
    const declared = declareTestCombat(approach(), ALLIED, 'OVERRUN', [U.trk], '7,5');
    expect(declared.ok).toBe(true);
    expect(declared.state.movingStackIds).toBeUndefined();
    const settled = settleDecisions(declared.state).state;
    expect(codes(move(settled, U.trk2, path('6,5', '6,6')))).toContain('MOVEMENT_ALREADY_FINISHED');
  });

  it('cannot add a unit that was not moving with the stack to its overrun (6.1f, 8.1)', () => {
    const withLeg = atStep(buildGeneratedRuleState({ ...fight, [U.leg]: ['6,5', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const moved = move(withLeg, U.trk, path('5,5', '6,5'), [U.trk2]).state;
    expect(codes(declareTestCombat(moved, ALLIED, 'OVERRUN', [U.trk, U.trk2, U.leg], '7,5'))).toContain('STACK_CANNOT_PICK_UP');
  });

  it('keeps the surviving stack moving together after an overrun it did not retreat from (8.0, 8.1d)', () => {
    let continued = 0;
    for (let seed = 1; seed < 40; seed += 1) {
      const declared = declareTestCombat(approach(seed), ALLIED, 'OVERRUN', [U.trk, U.trk2], '7,5');
      expect(declared.ok).toBe(true);
      const settled = settleDecisions(declared.state).state;
      const movers = settled.movingStackIds ?? (settled.currentMoverId ? [settled.currentMoverId] : []);
      // Every unit still moving overran: nobody else joins the stack (8.1g).
      for (const id of movers) expect([U.trk, U.trk2]).toContain(id);
      if (movers.length !== 2) continue;
      continued += 1;
      // 8.1a: each overrun cost both units 3 MP more than the move itself.
      expect(spent(settled, U.trk)).toBeGreaterThanOrEqual(12);
      expect(spent(settled, U.trk2)).toBe(spent(settled, U.trk));
      const from = hexOf(settled, U.trk)!;
      const onward = queryStackReachableHexes(settled, ALLIED, [U.trk, U.trk2]).value ?? [];
      if (onward.length === 0) continue;
      const next = move(settled, U.trk, onward[0]!.path, [U.trk2]);
      expect(next.ok).toBe(true);
      expect(hexOf(next.state, U.trk2)).toBe(onward[0]!.hexId);
      expect(from).not.toBe(onward[0]!.hexId);
    }
    expect(continued).toBeGreaterThan(0);
  }, 30_000);
});
