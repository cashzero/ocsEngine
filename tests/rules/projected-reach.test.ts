import { describe, expect, it } from 'vitest';
import {
  ALLIED, atStep, buildGeneratedRuleState, generatedPieceId, hexDistanceBetween, ruleEngine,
  type HexId,
} from '../../src/index.js';

const TANK = generatedPieceId('allied:independent-tank-1');
const ENEMY = generatedPieceId('axis:f1-combat-1');

describe('projected reach (6.1, 12.5a)', () => {
  it('gives an unfueled unit the reach it would have once fueled, from where it stands or from another hex', () => {
    const state = atStep(buildGeneratedRuleState({ [TANK]: ['4,4', 'MOVE', 'move'] }, {}, { fueled: false }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const before = JSON.stringify(state);
    expect(ruleEngine.queryMovementRange(state, ALLIED, TANK).reasons.map(({ code }) => code)).toContain('FUEL_REQUIRED');

    const here = ruleEngine.queryProjectedReach(state, ALLIED, TANK, '4,4' as HexId).value!.map(({ hexId }) => hexId);
    expect(here).toContain('5,4');
    const there = ruleEngine.queryProjectedReach(state, ALLIED, TANK, '8,4' as HexId).value!.map(({ hexId }) => hexId);
    expect(there).toContain('9,4');
    // The same allowance, measured from the other origin.
    const farthest = (hexIds: readonly HexId[], origin: string) => Math.max(...hexIds.map((hexId) => hexDistanceBetween(hexId, origin as HexId)));
    expect(farthest(there, '8,4')).toBe(farthest(here, '4,4'));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('gives nothing from a hex enemy combat units hold', () => {
    const state = atStep(buildGeneratedRuleState({ [TANK]: ['4,4', 'MOVE', 'move'], [ENEMY]: ['8,4', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED);
    const result = ruleEngine.queryProjectedReach(state, ALLIED, TANK, '8,4' as HexId);
    expect(result.allowed).toBe(false);
    expect(result.value).toEqual([]);
  });
});
