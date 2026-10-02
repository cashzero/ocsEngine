import {
  HEX_DIRECTIONS,
  formatHexId,
  neighbor,
  parseHexCoordinateId,
  type HexId,
} from '../core/index.js';
import {
  canonicalizeHexside,
  createMapDefinitionIndex,
  directedHexside,
  type MapDefinition,
} from '../domain/map/index.js';
import type {
  ClassCombatMultipliers,
  CombatClass,
  CombatLine,
  CombatMultiplier,
  GameState,
  GroundCondition,
  MobilityMovementCosts,
  MobilityType,
  WeatherMovementCost,
} from './kernel/model.js';

export interface MovementStepCost {
  readonly fromHexId: HexId;
  readonly toHexId: HexId;
  readonly terrainTicks: number;
  readonly hexsideTicks: number;
  readonly totalTicks: number;
  readonly road: boolean;
}

export type StepEvaluation =
  | { readonly kind: 'NON_ADJACENT' }
  | { readonly kind: 'PROHIBITED'; readonly reverse: boolean }
  | { readonly kind: 'COST'; readonly cost: MovementStepCost; readonly all: boolean };

type HexCost = { readonly kind: 'MP'; readonly ticks: number } | { readonly kind: 'ALL' } | { readonly kind: 'PROHIBITED' };

export interface MovementCostModel {
  readonly evaluate: (fromHexId: HexId, toHexId: HexId) => StepEvaluation;
}

const mapIndexes = new WeakMap<MapDefinition, ReturnType<typeof createMapDefinitionIndex>>();

/**
 * The slice of a game that movement cost depends on. A full GameState satisfies it, and so does a
 * map plus TEC before any game exists (deployment checks supply reach with it).
 */
export interface MovementCostContext {
  readonly scenario: { readonly mapDefinition: MapDefinition };
  readonly configuration: Pick<GameState['configuration'],
    'terrainMovementCosts' | 'hexsideMovementCosts' | 'roadMovementCosts' | 'defaultTerrainCostTicks'>;
  readonly weather: { readonly groundCondition: GroundCondition };
}

export const mapIndexOf = (state: Pick<MovementCostContext, 'scenario'>) => {
  let index = mapIndexes.get(state.scenario.mapDefinition);
  if (!index) {
    index = createMapDefinitionIndex(state.scenario.mapDefinition);
    mapIndexes.set(state.scenario.mapDefinition, index);
  }
  return index;
};

/** Every terrain and printed feature Definition in a Hex. */
export const hexTerrainIds = (state: GameState, hexId: HexId): readonly string[] => {
  const hex = mapIndexOf(state).getHex(hexId);
  return hex ? [...hex.terrainDefinitionIds.map(String), ...hex.features.map(({ definitionId }) => String(definitionId))] : [];
};

export const hexsideFeatureIds = (state: Pick<MovementCostContext, 'scenario'>, fromHexId: HexId, toHexId: HexId): readonly string[] => {
  const from = parseHexCoordinateId(fromHexId);
  if (!from.ok) return [];
  const direction = HEX_DIRECTIONS.find((candidate) => formatHexId(neighbor(from.value, candidate)) === toHexId);
  if (!direction) return [];
  const canonical = canonicalizeHexside(directedHexside(from.value, direction));
  return canonical.ok ? (mapIndexOf(state).getHexside(canonical.value.id)?.featureDefinitionIds ?? []).map(String) : [];
};

/** Cost models per map and configuration object (both are immutable for a game). */
const modelCache = new WeakMap<MapDefinition, WeakMap<MovementCostContext['configuration'], Map<string, MovementCostModel>>>();

/** TEC column for the ground condition (17.0a); the normal column applies when none is listed. */
const columnFor = (
  entry: { readonly costs: MobilityMovementCosts; readonly weather: readonly WeatherMovementCost[] },
  condition: GroundCondition,
): MobilityMovementCosts => condition === 'DRY' ? entry.costs
  : entry.weather.find((column) => column.condition === condition)?.costs ?? entry.costs;

/**
 * TEC movement costs (6.2) for one mobility type under a ground condition (the current weather by
 * default). `useRoads` false ignores road features, as overruns must (8.1c).
 */
export const movementCostModel = (
  state: MovementCostContext,
  mobility: MobilityType,
  useRoads = true,
  condition: GroundCondition = state.weather.groundCondition,
): MovementCostModel => {
  let perMap = modelCache.get(state.scenario.mapDefinition);
  if (!perMap) { perMap = new WeakMap(); modelCache.set(state.scenario.mapDefinition, perMap); }
  let perConfiguration = perMap.get(state.configuration);
  if (!perConfiguration) { perConfiguration = new Map(); perMap.set(state.configuration, perConfiguration); }
  const key = `${String(state.scenario.mapDefinition.id)}|${mobility}|${useRoads}|${condition}`;
  const cached = perConfiguration.get(key);
  if (cached) return cached;
  const configuration = state.configuration;
  const terrainCosts = new Map(configuration.terrainMovementCosts
    .map((entry) => [String(entry.terrainDefinitionId), columnFor(entry, condition)[mobility]]));
  const hexsideCosts = new Map(configuration.hexsideMovementCosts
    .map((entry) => [String(entry.featureDefinitionId), columnFor(entry, condition)[mobility]]));
  const roadCosts = new Map(configuration.roadMovementCosts
    .map((entry) => [String(entry.featureDefinitionId), columnFor(entry, condition)[mobility]]));
  const hexCosts = new Map<HexId, HexCost | undefined>();

  // 6.2d: the most costly terrain in the Hex; "ot" entries and unlisted features defer to it.
  const hexCost = (hexId: HexId): HexCost | undefined => {
    if (hexCosts.has(hexId)) return hexCosts.get(hexId);
    const definition = mapIndexOf(state).getHex(hexId);
    let result: HexCost | undefined;
    if (definition) {
      const listed = [
        ...definition.terrainDefinitionIds.map((id) => terrainCosts.get(String(id))
          ?? { kind: 'MP' as const, ticks: configuration.defaultTerrainCostTicks }),
        ...definition.features.flatMap(({ definitionId }) => terrainCosts.get(String(definitionId)) ?? []),
      ].filter((cost) => cost.kind !== 'OTHER_TERRAIN');
      const costs = listed.length > 0 ? listed : [{ kind: 'MP' as const, ticks: configuration.defaultTerrainCostTicks }];
      if (costs.some(({ kind }) => kind === 'PROHIBITED')) result = { kind: 'PROHIBITED' };
      else if (costs.some(({ kind }) => kind === 'ALL')) result = { kind: 'ALL' };
      else result = { kind: 'MP', ticks: Math.max(...costs.map((cost) => cost.kind === 'MP' ? cost.ticks : 0)) };
    }
    hexCosts.set(hexId, result);
    return result;
  };

  const evaluate = (fromHexId: HexId, toHexId: HexId): StepEvaluation => {
    const target = hexCost(toHexId);
    const origin = hexCost(fromHexId);
    const from = parseHexCoordinateId(fromHexId);
    if (!target || !origin || !from.ok
      || !HEX_DIRECTIONS.some((direction) => formatHexId(neighbor(from.value, direction)) === toHexId)) {
      return { kind: 'NON_ADJACENT' };
    }
    const features = hexsideFeatureIds(state, fromHexId, toHexId);
    // 6.2a: a road hexside pays the road cost and ignores Hex and hexside terrain, including
    // prohibited terrain (6.2c) in both directions.
    const roadTicks = useRoads ? features.flatMap((id) => {
      const cost = roadCosts.get(id);
      return cost?.kind === 'MP' ? [cost.ticks] : [];
    }) : [];
    if (roadTicks.length > 0) {
      const ticks = Math.min(...roadTicks);
      return { kind: 'COST', all: false, cost: { fromHexId, toHexId, terrainTicks: ticks, hexsideTicks: 0, totalTicks: ticks, road: true } };
    }
    // 6.2b: additive hexside costs; prohibited or "All" hexsides apply like Hex terrain.
    const hexside = features.flatMap((id) => {
      const cost = hexsideCosts.get(id);
      return cost ? [cost] : [];
    });
    if (target.kind === 'PROHIBITED' || hexside.some(({ kind }) => kind === 'PROHIBITED')) return { kind: 'PROHIBITED', reverse: false };
    // 6.1d: A to B is legal only if B to A would be as well.
    if (origin.kind === 'PROHIBITED') return { kind: 'PROHIBITED', reverse: true };
    const hexsideTicks = hexside.reduce((total, cost) => total + (cost.kind === 'MP' ? cost.ticks : 0), 0);
    const terrainTicks = target.kind === 'MP' ? target.ticks : 0;
    const all = target.kind === 'ALL' || hexside.some(({ kind }) => kind === 'ALL');
    return {
      kind: 'COST', all,
      cost: { fromHexId, toHexId, terrainTicks, hexsideTicks, totalTicks: Math.max(0, terrainTicks + hexsideTicks), road: false },
    };
  };
  const model = { evaluate };
  perConfiguration.set(key, model);
  return model;
};

/**
 * Supply paths (12.3d, 17.0c) use normal costs, ignoring weather that increases them, but may use
 * costs weather temporarily reduces: each step takes the cheaper legal evaluation.
 */
export const supplyPathCostModel = (state: GameState, mobility: MobilityType): MovementCostModel => {
  const normal = movementCostModel(state, mobility, true, 'DRY');
  if (state.weather.groundCondition === 'DRY') return normal;
  const current = movementCostModel(state, mobility, true, state.weather.groundCondition);
  return {
    evaluate: (fromHexId, toHexId) => {
      const dry = normal.evaluate(fromHexId, toHexId);
      const weather = current.evaluate(fromHexId, toHexId);
      if (dry.kind !== 'COST') return weather.kind === 'COST' ? weather : dry;
      if (weather.kind !== 'COST') return dry;
      if (dry.all !== weather.all) return dry.all ? weather : dry;
      return weather.cost.totalTicks < dry.cost.totalTicks ? weather : dry;
    },
  };
};

export const UNIT_MULTIPLIER: CombatMultiplier = { numerator: 1, denominator: 1, attackOnly: false };

export const multiplierFor = (multipliers: ClassCombatMultipliers, combatClass: CombatClass): CombatMultiplier =>
  combatClass === 'ARMOR' ? multipliers.armor : combatClass === 'MECH' ? multipliers.mech : multipliers.other;

export const multiplierValue = (multiplier: CombatMultiplier): number => multiplier.numerator / multiplier.denominator;

export interface HexCombatTerrain {
  readonly terrainDefinitionId: string;
  readonly line: CombatLine;
  readonly multipliers: ClassCombatMultipliers;
}

const OPEN_DEFAULT: ClassCombatMultipliers = { armor: UNIT_MULTIPLIER, mech: UNIT_MULTIPLIER, other: UNIT_MULTIPLIER };

/**
 * Terrain choices a defender may pick in the Hex (9.3b): each listed terrain with a combat line.
 * Hexes with no listed terrain count as Open with no strength effect.
 */
export const hexCombatTerrains = (state: GameState, hexId: HexId): readonly HexCombatTerrain[] => {
  const effects = new Map(state.configuration.terrainCombatEffects.map((effect) => [String(effect.terrainDefinitionId), effect]));
  const choices = hexTerrainIds(state, hexId).flatMap((id) => {
    const effect = effects.get(id);
    return effect && effect.line !== null ? [{ terrainDefinitionId: id, line: effect.line, multipliers: effect.multipliers }] : [];
  });
  return choices.length > 0 ? choices : [{ terrainDefinitionId: 'terrain:open', line: 'OPEN', multipliers: OPEN_DEFAULT }];
};

/** Hexside terrain an attacking stack crosses (9.4b). */
export const hexsideCombatEffects = (state: GameState, fromHexId: HexId, toHexId: HexId) => {
  const effects = new Map(state.configuration.hexsideCombatEffects.map((effect) => [String(effect.featureDefinitionId), effect]));
  return hexsideFeatureIds(state, fromHexId, toHexId).flatMap((id) => effects.get(id) ?? []);
};
