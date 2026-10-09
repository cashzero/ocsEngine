import { describe, expect, it } from 'vitest';
import {
  ALLIED,
  AXIS,
  applyRuleAction,
  atStep,
  bridgeHexes,
  buildGeneratedRuleState,
  createInitialGameState,
  declareTestCombat,
  featuresAlong,
  generatedPieceId,
  parseGameStateJson,
  projectRuleState,
  queryMovementPath,
  queryReachableHexes,
  serializeGameState,
  supplyPathCosts,
  type GameState,
  type HexId,
  type PieceId,
  type Placement,
  type TransitionResult,
} from '../../src/index.js';

/** Hex in the map's fourth row at printed column `column` (0-based). */
const hex = (column: number, row = 4): HexId => `${column - Math.floor(row / 2)},${row}` as HexId;
const id = (fragment: string) => generatedPieceId(fragment);
const U = {
  tank: id('allied:f1-combat-1'), leg: id('allied:f2-combat-1'), engineer: id('allied:independent-engineer-1'),
  hq: id('allied:independent-hq-1'), xInf: id('axis:f1-combat-1'), xEngineer: id('axis:independent-engineer-1'),
};
const WEST = hex(4);
const EAST = hex(5);

const codes = (result: TransitionResult): readonly string[] => result.ok ? [] : result.violations.map(({ code }) => code);
const ok = (result: TransitionResult): GameState => {
  expect(result.ok, result.ok ? '' : result.violations.map(({ code, message }) => `${code}: ${message}`).join('; ')).toBe(true);
  return result.state;
};

/** A river (`edge:river` or `edge:major-river`) between WEST and EAST, on clear ground, at the Allied Movement Segment. */
const riverState = (placement: Placement, river = 'edge:river'): GameState =>
  atStep(buildGeneratedRuleState({ [U.xInf]: [hex(12), 'COMBAT', 'combat'], ...placement }, {}, { hexsides: featuresAlong([WEST, EAST], river) }), 'MOVEMENT', 'MOVEMENT', ALLIED);

/** MP the step WEST → EAST costs `pieceId`, or the violation codes when it cannot be made. */
const crossing = (state: GameState, pieceId: PieceId, path: readonly HexId[] = [WEST, EAST]): number | readonly string[] => {
  const result = queryMovementPath(state, ALLIED, pieceId, path);
  return result.allowed ? result.value!.totalTicks / 4 : result.reasons.map(({ code }) => code);
};

describe('Bridging (13.8b)', () => {
  it('generated games list their Minor and Major Rivers', () => {
    const state = riverState({});
    expect(state.configuration.rivers?.minorFeatureDefinitionIds).toEqual(['edge:river']);
    expect(state.configuration.rivers?.majorFeatureDefinitionIds).toEqual(['edge:major-river']);
  });

  it('an Engineer-Capable unit makes a Minor River cost nothing extra for units moving out of its hex', () => {
    const tank = { [U.tank]: [WEST, 'COMBAT', 'combat'] } as const;
    // Tracked: Clear 1 MP + Minor River +3.
    expect(crossing(riverState(tank), U.tank)).toBe(4);
    expect(crossing(riverState({ ...tank, [U.engineer]: [WEST, 'COMBAT', 'combat'] }), U.tank)).toBe(1);
    // An HQ in Combat Mode bridges as well.
    expect(crossing(riverState({ ...tank, [U.hq]: [WEST, 'COMBAT', 'combat'] }), U.tank)).toBe(1);
  });

  it('also bridges for units moving into its hex, but not for a crossing beside it', () => {
    expect(crossing(riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.engineer]: [EAST, 'COMBAT', 'combat'] }), U.tank)).toBe(1);
    // Same river, engineer one hex away from both ends.
    const besides = riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.engineer]: [hex(3), 'COMBAT', 'combat'] });
    expect(crossing(besides, U.tank)).toBe(4);
  });

  it('downgrades a Major River to a Minor River: prohibited ground becomes passable', () => {
    const tank = { [U.tank]: [WEST, 'COMBAT', 'combat'] } as const;
    expect(crossing(riverState(tank, 'edge:major-river'), U.tank)).toContain('PROHIBITED_TERRAIN');
    expect(crossing(riverState({ ...tank, [U.engineer]: [WEST, 'COMBAT', 'combat'] }, 'edge:major-river'), U.tank)).toBe(4);
    // Leg: Major River costs All; bridged it is Clear 1 + Minor River +1.
    const leg = { [U.leg]: [WEST, 'COMBAT', 'combat'], [U.engineer]: [WEST, 'COMBAT', 'combat'] } as const;
    expect(crossing(riverState(leg, 'edge:major-river'), U.leg)).toBe(2);
  });

  it('needs an Engineer-Capable unit: Move Mode does not bridge, DG oriented toward Combat Mode does (13.8a, 5.10e)', () => {
    const tank = { [U.tank]: [WEST, 'COMBAT', 'combat'] } as const;
    expect(crossing(riverState({ ...tank, [U.engineer]: [WEST, 'MOVE', 'move'] }), U.tank)).toBe(4);
    expect(crossing(riverState({ ...tank, [U.engineer]: [WEST, 'DG', 'combat'] }), U.tank)).toBe(1);
    expect(crossing(riverState({ ...tank, [U.engineer]: [WEST, 'DG', 'move'] }), U.tank)).toBe(4);
  });

  it('serves only its own side', () => {
    const state = riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.xEngineer]: [EAST, 'COMBAT', 'combat'] });
    expect(bridgeHexes(state, AXIS).has(EAST)).toBe(true);
    expect(bridgeHexes(state, ALLIED).size).toBe(0);
    expect(codes(applyRuleAction(state, ALLIED, { kind: 'MOVE_PIECE', pieceId: U.tank, path: [WEST, hex(3)] }))).toEqual([]);
    expect(crossing(riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.xEngineer]: [hex(3, 6), 'COMBAT', 'combat'] }), U.tank)).toBe(4);
  });

  it('lets reachable hexes use the bridge', () => {
    const reach = (state: GameState) => queryReachableHexes(state, ALLIED, U.tank).value?.find(({ hexId }) => hexId === EAST);
    // Unbridged, the cheapest way is around the end of the river (2 Clear hexes); bridged, straight across.
    expect(reach(riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'] }))?.costTicks).toBe(8);
    expect(reach(riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.engineer]: [WEST, 'COMBAT', 'combat'] }))).toMatchObject({ costTicks: 4, path: [WEST, EAST] });
  });

  it('an Engineer-Capable unit may leave by its own bridge after changing mode, nobody else may', () => {
    // 13.8b Exception: switching to Move Mode ends the bridge for everyone else, not for leaving by it.
    const engineerAndTank = riverState({ [U.engineer]: [WEST, 'COMBAT', 'combat'], [U.tank]: [WEST, 'COMBAT', 'combat'] }, 'edge:major-river');
    const moved = ok(applyRuleAction(engineerAndTank, ALLIED, { kind: 'CHANGE_MODE', pieceId: U.engineer, mode: 'MOVE' }));
    expect(bridgeHexes(moved, ALLIED).size).toBe(0);
    expect(moved.usage.find(({ pieceId }) => pieceId === U.engineer)?.ownBridgeHexId).toBe(WEST);
    // Truck: Major River prohibited; bridged, Clear 1 + Minor River +5.
    expect(crossing(riverState({ [U.engineer]: [WEST, 'MOVE', 'move'] }, 'edge:major-river'), U.engineer)).toContain('PROHIBITED_TERRAIN');
    expect(crossing(moved, U.engineer)).toBe(6);
    expect(crossing(moved, U.tank)).toContain('PROHIBITED_TERRAIN');
    // The record survives a save.
    const reloaded = parseGameStateJson(serializeGameState(moved).ok ? (serializeGameState(moved) as { value: string }).value : '');
    expect(reloaded.ok && reloaded.value.usage.find(({ pieceId }) => pieceId === U.engineer)?.ownBridgeHexId).toBe(WEST);
  });

  it('enables an attack across a Major River but never an overrun across a river (8.1c)', () => {
    const placement = { [U.tank]: [WEST, 'COMBAT', 'combat'], [U.xInf]: [EAST, 'COMBAT', 'combat'] } as const;
    const attack = (state: GameState, kind: 'REGULAR' | 'OVERRUN') => codes(declareTestCombat(atStep(state, kind === 'REGULAR' ? 'COMBAT' : 'MOVEMENT', kind === 'REGULAR' ? 'COMBAT' : 'MOVEMENT', ALLIED), ALLIED, kind, [U.tank], EAST));
    const unbridged = riverState(placement, 'edge:major-river');
    const bridged = riverState({ ...placement, [U.engineer]: [WEST, 'COMBAT', 'combat'] }, 'edge:major-river');
    expect(attack(unbridged, 'REGULAR')).toContain('ATTACK_INTO_PROHIBITED_TERRAIN');
    expect(attack(bridged, 'REGULAR')).not.toContain('ATTACK_INTO_PROHIBITED_TERRAIN');
    expect(attack(bridged, 'OVERRUN')).toContain('ATTACK_INTO_PROHIBITED_TERRAIN');
    // A Minor River: tracked 1 + 3 = 4 MP is too much to overrun, bridge or not.
    const minor = riverState({ ...placement, [U.engineer]: [WEST, 'COMBAT', 'combat'] });
    expect(attack(minor, 'OVERRUN')).toContain('OVERRUN_TERRAIN_TOO_COSTLY');
  });

  it('shortens friendly supply paths (12.3d) only', () => {
    const plain = riverState({});
    const allied = riverState({ [U.engineer]: [WEST, 'COMBAT', 'combat'] });
    // Truck: Clear 1 + Minor River +5 straight across, 2 MP around the end of the river.
    expect(supplyPathCosts(plain, ALLIED, WEST, 'truck', 40).get(EAST)).toBe(8);
    expect(supplyPathCosts(allied, ALLIED, WEST, 'truck', 40).get(EAST)).toBe(4);
    expect(supplyPathCosts(allied, AXIS, WEST, 'truck', 40).get(EAST)).toBe(8);
  });

  it('projects each player\'s own bridges only', () => {
    const state = riverState({ [U.engineer]: [WEST, 'COMBAT', 'combat'], [U.xEngineer]: [hex(8), 'COMBAT', 'combat'] }, 'edge:major-river');
    expect(projectRuleState(state, ALLIED).bridges).toEqual([{ hexId: WEST, acrossHexId: EAST, major: true }]);
    // The Axis engineer stands at no river, and the Allied bridge is not shown to the Axis.
    expect(projectRuleState(state, AXIS).bridges).toEqual([]);
  });

  it('does nothing in games that list no rivers, and rejects a Major River without a Minor one', () => {
    const state = riverState({ [U.tank]: [WEST, 'COMBAT', 'combat'], [U.engineer]: [WEST, 'COMBAT', 'combat'] });
    const old = { ...state, configuration: { ...state.configuration, rivers: undefined } };
    expect(crossing(old, U.tank)).toBe(4);
    const broken = createInitialGameState(state.scenario, { ...state.configuration, rivers: { minorFeatureDefinitionIds: [], majorFeatureDefinitionIds: state.configuration.rivers!.majorFeatureDefinitionIds } }, 7);
    expect(broken.ok ? [] : broken.error.map(({ code }) => code)).toContain('MAJOR_RIVER_WITHOUT_MINOR');
  });
});
