import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  buildGeneratedRuleState,
  generatedPieceId,
  projectRuleState,
  type GameState,
  type PieceId,
} from '../../src/index.js';

const U = {
  truck: generatedPieceId('allied:independent-transport-1'),
  dump: generatedPieceId('allied:independent-supply-1'),
  leg: generatedPieceId('allied:f2-combat-1'),
  hq: generatedPieceId('allied:f1-command'),
  artillery: generatedPieceId('allied:f1-artillery-1'),
};
const roles = (state: GameState, viewer = ALLIED): Map<PieceId, string> =>
  new Map(projectRuleState(state, viewer).stacks.flatMap(({ pieces }) => pieces).map(({ id, role }) => [id, role]));
const ok = (state: GameState, action: Record<string, unknown>): GameState => {
  const result = applyRuleAction(state, ALLIED, action as never);
  if (!result.ok) throw new Error(result.violations.map(({ code, message }) => `${code}: ${message}`).join('; '));
  return result.state;
};

describe('what a counter is for, in the projection', () => {
  const state = atStep(buildGeneratedRuleState({
    [U.truck]: ['1,5', null], [U.dump]: ['1,5', null],
    [U.leg]: ['4,5', 'COMBAT', 'combat'], [U.hq]: ['4,5', 'COMBAT', 'combat'], [U.artillery]: ['4,5', 'COMBAT', 'combat'],
  }), 'MOVEMENT', 'MOVEMENT', ALLIED);

  it('tells units, trucks and supply apart without looking at their fields', () => {
    const seen = roles(state);
    expect(seen.get(U.truck)).toBe('TRUCK');
    expect(seen.get(U.dump)).toBe('DUMP');
    expect(seen.get(U.leg)).toBe('COMBAT');
    expect(seen.get(U.hq)).toBe('HQ');
    expect(seen.get(U.artillery)).toBe('ARTILLERY');
  });

  it('calls supply a truck carries CARGO, and a truck on its other face an EXTENDER', () => {
    const loaded = ok(state, { kind: 'LOAD_SUPPLY', truckId: U.truck, dumpId: U.dump, tokens: 4 });
    expect(roles(loaded).get(U.dump)).toBe('CARGO');
    expect(roles(loaded).get(U.truck)).toBe('TRUCK');

    const extender = ok(atStep(buildGeneratedRuleState({ [U.truck]: ['0,6', null], [U.leg]: ['4,6', 'COMBAT', 'combat'] }), 'MOVEMENT', 'MOVEMENT', ALLIED),
      { kind: 'FORM_EXTENDER', truckId: U.truck });
    expect(roles(extender).get(U.truck)).toBe('EXTENDER');
  });

  it('gives the opponent a role for every counter it may see, and the size printed on a visible truck', () => {
    // A lone truck and dump are seen as one counter (4.9a), the rest only counted.
    const divided = ok(state, { kind: 'DIVIDE_TRANSPORT', truckId: U.truck, points: 1 });
    const everything = projectRuleState(divided, AXIS).stacks.flatMap(({ pieces }) => pieces);
    expect(everything.every(({ role }) => role !== 'OTHER')).toBe(true);
    const seen = everything.filter(({ ownerId }) => ownerId === ALLIED);
    expect(seen.length, 'the opponent sees some Allied counter').toBeGreaterThan(0);
    // The part split off is the top counter, so that is the one the opponent sees: one point, as printed on it.
    const trucks = seen.filter(({ role }) => role === 'TRUCK');
    expect(trucks.length, 'the opponent sees a truck counter').toBeGreaterThan(0);
    for (const truck of trucks) {
      const points = truck.statusValues.find(({ statusDefinitionId }) => statusDefinitionId === 'status:transport-points')?.value;
      expect([1, 4], `size shown for ${truck.id}`).toContain(points);
    }
    // Nothing private rides along with it.
    for (const piece of seen) {
      expect(piece.statusValues.every(({ statusDefinitionId }) => ['status:transport-points', 'status:air-base-level'].includes(statusDefinitionId))).toBe(true);
    }
  });
});
