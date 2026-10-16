import { describe, expect, it } from 'vitest';
import { ALLIED, buildGeneratedRuleState, hexDistanceBetween, ruleEngine, type HexId } from '../../src/index.js';

const ORIGIN = '6,6' as HexId;

describe('draw reach (12.3a, 12.3c)', () => {
  it('reaches 5 Truck MP along a supply path, plus the Hexes adjacent to where it reaches', () => {
    const clear = buildGeneratedRuleState({});
    const hexes = clear.scenario.mapDefinition.hexes.map(({ id }) => id);
    const reach = new Set(ruleEngine.queryDrawReach(clear, ALLIED, ORIGIN).value);
    // Clear terrain costs a truck 1 MP a Hex: five Hexes out, and the Hexes next to them.
    expect(hexes.filter((hexId) => reach.has(hexId)).sort()).toEqual(hexes.filter((hexId) => hexDistanceBetween(ORIGIN, hexId) <= 6).sort());

    const woods = buildGeneratedRuleState({}, Object.fromEntries(hexes.map((hexId) => [hexId, 'terrain:woods'])));
    const close = new Set(ruleEngine.queryDrawReach(woods, ALLIED, ORIGIN).value);
    // Woods cost 3 MP: one Hex out, and the Hexes next to it.
    expect(hexes.filter((hexId) => close.has(hexId)).sort()).toEqual(hexes.filter((hexId) => hexDistanceBetween(ORIGIN, hexId) <= 2).sort());
  });
});
