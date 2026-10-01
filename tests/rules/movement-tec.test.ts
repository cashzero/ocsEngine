import { describe, expect, it } from 'vitest';
import {
  GENERATED_HEXSIDE_MOVEMENT_COSTS,
  GENERATED_ROAD_MOVEMENT_COSTS,
  GENERATED_TERRAIN_MOVEMENT_COSTS,
  createRuleGameStateFixture,
  parseDefinitionId,
  queryMovementPath,
  queryReachableHexes,
  setRuleSequenceFixture,
  type GameState,
  type HexId,
} from '../../src/index.js';

const definitionId = (value: string) => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(value);
  return parsed.value;
};

/** Rule fixture using the BTR TEC tables, with Hex terrain, hexsides, and mover mobility overridden. */
const tecState = (options: {
  readonly terrain?: Readonly<Record<string, string>>;
  readonly hexsides?: Readonly<Record<string, readonly string[]>>;
  readonly mobility?: 'leg' | 'truck' | 'tracked';
  readonly spentTicks?: number;
}): GameState => {
  const source = createRuleGameStateFixture();
  const mover = source.pieceState.pieces.find(({ id }) => id === 'piece:multi-step')!;
  const mapDefinition = {
    ...source.scenario.mapDefinition,
    hexes: source.scenario.mapDefinition.hexes.map((hex) => ({
      ...hex,
      terrainDefinitionIds: [definitionId(options.terrain?.[hex.id] ?? 'terrain:clear')],
    })),
    hexsides: Object.entries(options.hexsides ?? {}).map(([hexsideId, features]) => ({
      hexsideId: hexsideId as never, featureDefinitionIds: features.map(definitionId),
    })),
  } as GameState['scenario']['mapDefinition'];
  const pieceCatalog = {
    ...source.scenario.pieceCatalog,
    definitions: source.scenario.pieceCatalog.definitions.map((definition) => definition.id !== mover.definitionId ? definition : {
      ...definition,
      faces: definition.faces.map((face) => ({ ...face, mobilityClassDefinitionId: definitionId(`mobility:${options.mobility ?? 'leg'}`) })),
    }),
  };
  const state: GameState = {
    ...source,
    scenario: { ...source.scenario, mapDefinition, pieceCatalog },
    configuration: {
      ...source.configuration,
      terrainMovementCosts: GENERATED_TERRAIN_MOVEMENT_COSTS,
      hexsideMovementCosts: GENERATED_HEXSIDE_MOVEMENT_COSTS,
      roadMovementCosts: GENERATED_ROAD_MOVEMENT_COSTS,
    },
    usage: options.spentTicks === undefined ? source.usage : [{
      pieceId: mover.id, movementSpentTicks: options.spentTicks, moved: true,
      phaseStartHexId: null, attacked: false, barraged: false, reserveReleased: false,
      negationLocked: false, supplyPaid: false, fueled: false, fuelThrowHexId: null, recovered: false,
      breakoutAttempted: false, blown: false, unloadedTokens: 0,
    }],
    // Fuel (12.5) is paid so these tests isolate terrain costs.
    fuel: { hqIds: [], formations: [{ playerId: mover.ownerId, formationId: definitionId('formation:test-fuel'), coveredPieceIds: [mover.id] }] },
  };
  return setRuleSequenceFixture(state, 'MOVEMENT', 'MOVEMENT', source.scenario.players[0]!.id);
};

const actor = (state: GameState) => state.scenario.players[0]!.id;
const move = (state: GameState, path: readonly string[]) =>
  queryMovementPath(state, actor(state), 'piece:multi-step' as never, path as readonly HexId[]);
const reachable = (state: GameState) =>
  new Map(queryReachableHexes(state, actor(state), 'piece:multi-step' as never).value!.map((entry) => [entry.hexId, entry]));

describe('BTR TEC movement (6.1c, 6.1d, 6.2a-d)', () => {
  it('forbids prohibited terrain even as a minimum move', () => {
    const state = tecState({ terrain: { '1,1': 'terrain:water' } });
    const result = move(state, ['2,1', '1,1']);

    expect(result.allowed).toBe(false);
    expect(result.reasons.map(({ code }) => code)).toContain('PROHIBITED_TERRAIN');
    expect(reachable(state).has('1,1' as HexId)).toBe(false);
  });

  it('forbids leaving prohibited terrain where the unit could not have entered', () => {
    const state = tecState({ terrain: { '2,1': 'terrain:marsh' }, mobility: 'truck' });

    expect(move(state, ['2,1', '1,1']).reasons.map(({ code }) => code)).toContain('PROHIBITED_REVERSE_MOVE');
    expect(reachable(state).size).toBe(0);
  });

  it('charges the road cost and ignores Hex terrain and hexside features along a road', () => {
    const terrain = { '1,1': 'terrain:woods' };
    const offRoad = move(tecState({ terrain, hexsides: { '1,1|2,1': ['edge:river'] }, mobility: 'truck' }), ['2,1', '1,1']);
    const onRoad = move(tecState({ terrain, hexsides: { '1,1|2,1': ['edge:river', 'edge:primary-road'] }, mobility: 'truck' }), ['2,1', '1,1']);

    expect(offRoad.value?.totalTicks).toBe(12 + 20);
    expect(onRoad.allowed).toBe(true);
    expect(onRoad.value?.totalTicks).toBe(2);
  });

  it('uses the mover mobility type and the most costly terrain in the Hex', () => {
    const terrain = { '1,1': 'terrain:woods' };
    const cost = (mobility: 'leg' | 'truck' | 'tracked') => move(tecState({ terrain, mobility }), ['2,1', '1,1']).value?.steps[0]?.totalTicks;

    expect([cost('leg'), cost('tracked'), cost('truck')]).toEqual([4, 8, 12]);
  });

  it('lets road movement cross a prohibited hexside', () => {
    const blocked = move(tecState({ hexsides: { '1,1|2,1': ['edge:major-river'] }, mobility: 'truck' }), ['2,1', '1,1']);
    const bridged = move(tecState({ hexsides: { '1,1|2,1': ['edge:major-river', 'edge:road'] }, mobility: 'truck' }), ['2,1', '1,1']);

    expect(blocked.reasons.map(({ code }) => code)).toContain('PROHIBITED_TERRAIN');
    expect(bridged.allowed).toBe(true);
  });

  it('allows "All" terrain only for an unmoved unit, consuming its whole MA', () => {
    const terrain = { '1,1': 'terrain:mountain' };
    const fresh = move(tecState({ terrain }), ['2,1', '1,1']);
    const moved = move(tecState({ terrain, spentTicks: 4 }), ['2,1', '1,1']);
    const second = move(tecState({ terrain }), ['2,1', '1,2', '1,1']);

    expect(fresh.allowed).toBe(true);
    expect(fresh.value?.totalTicks).toBe(fresh.value?.allowanceTicks);
    expect(moved.allowed).toBe(false);
    expect(second.allowed).toBe(false);
  });

  it('returns only destinations whose least-cost path validates at the same cost', () => {
    const state = tecState({
      terrain: { '1,1': 'terrain:woods', '1,2': 'terrain:water', '0,2': 'terrain:mountain' },
      hexsides: { '0,1|1,1': ['edge:river'], '0,3|1,3': ['edge:road'] },
      mobility: 'tracked',
    });
    const entries = [...reachable(state).values()];

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const result = move(state, entry.path);
      expect(result.allowed, entry.path.join('>')).toBe(true);
      expect(result.value?.totalTicks).toBe(entry.costTicks);
    }
    expect(entries.some(({ hexId }) => hexId === '1,2')).toBe(false);
  });
});
