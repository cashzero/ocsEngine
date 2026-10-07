import { FOUNDATION_SCHEMA_VERSION, parseDefinitionId, type DefinitionId, type PlayerId, type Result } from '../core/index.js';
import { sideDivisions, type GeneratedOob, type OobSide } from '../generation/oob/index.js';
import type { RailroadConfiguration, RuleConfiguration } from '../rules/index.js';
import type { GeneratedDeployment, NewGameRequest } from './model.js';
import {
  GENERATED_HEXSIDE_MOVEMENT_COSTS,
  GENERATED_MULTI_TRACK_RAIL,
  GENERATED_RAIL,
  GENERATED_ROAD_MOVEMENT_COSTS,
  GENERATED_TERRAIN_MOVEMENT_COSTS,
} from './movement-tec.js';
import { GENERATED_HEXSIDE_COMBAT_EFFECTS, GENERATED_TERRAIN_COMBAT_EFFECTS } from './combat-tec.js';
import { BTR_SUPPLY_TABLE, createGeneratedWeather } from './weather-supply-tables.js';
import { GENERATED_REINFORCEMENT_BOXES } from './deployment.js';

const must = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) throw new Error('Game-flow Definition ID is invalid.');
  return result.value;
};
const id = (value: string): DefinitionId => must(parseDefinitionId(value));

/** OCS 4.8 ten-RE stacking limit in quarter-RE ticks. */
export const GENERATED_STACKING_LIMIT_RE_TICKS = 40;

/** Terrain cost in quarter-MP ticks for terrain the TEC does not list. */
export const GENERATED_DEFAULT_TERRAIN_COST_TICKS = 4;

/** 12.3a: direct draw range is 5 Truck MP, in quarter-MP ticks. */
export const GENERATED_SUPPLY_DRAW_RANGE_TICKS = 20;

/** The dump Definition each side's Supply Table arrivals use. */
const supplyDefinitionFor = (oob: GeneratedOob, side: OobSide): DefinitionId => {
  const unit = oob.sides.find((candidate) => candidate.side === side)?.independentUnits.find(({ role }) => role === 'SUPPLY');
  if (!unit) throw new Error(`Generated OOB has no ${side} supply dump Definition.`);
  return unit.definitionId;
};

/** The VP an attacker must hold at the end to win: half of all objective VP, rounded up. */
export const attackVictoryPoints = (totalPoints: number): number => Math.max(1, Math.ceil(totalPoints / 2));

/** Production-owned ground-game configuration; test fixtures are deliberately not imported. */
export const createGeneratedRuleConfiguration = (
  deployment: GeneratedDeployment,
  request: NewGameRequest,
  oob: GeneratedOob,
  players: Readonly<Record<OobSide, PlayerId>>,
): RuleConfiguration => ({
  schemaVersion: FOUNDATION_SCHEMA_VERSION,
  id: id('rules:ocs-generated-ground-duel'),
  rulesVersion: 'OCS 4.3 generated ground duel 0.3.0',
  terrainMovementCosts: GENERATED_TERRAIN_MOVEMENT_COSTS,
  hexsideMovementCosts: GENERATED_HEXSIDE_MOVEMENT_COSTS,
  roadMovementCosts: GENERATED_ROAD_MOVEMENT_COSTS,
  defaultTerrainCostTicks: GENERATED_DEFAULT_TERRAIN_COST_TICKS,
  minimumMoveTicks: 4,
  stackingLimitReTicks: GENERATED_STACKING_LIMIT_RE_TICKS,
  terrainCombatEffects: GENERATED_TERRAIN_COMBAT_EFFECTS,
  hexsideCombatEffects: GENERATED_HEXSIDE_COMBAT_EFFECTS,
  // 12.3a: direct draw range is 5 Truck MP.
  supplyDrawRangeTicks: 20,
  weather: createGeneratedWeather(request.startMonth),
  supplyArrivals: {
    rows: BTR_SUPPLY_TABLE,
    players: (['ALLIED', 'AXIS'] as const).map((side) => ({
      playerId: players[side],
      // Supply Status column: one per division, so income scales with the force (an attacker's larger one too).
      status: Math.max(1, Math.min(12, sideDivisions(oob.options, side).divisionsPerSide)),
      resourceDefinitionId: supplyDefinitionFor(oob, side),
    })),
  },
  reinforcementBoxes: (['ALLIED', 'AXIS'] as const).map((side) => ({ playerId: players[side], boxId: GENERATED_REINFORCEMENT_BOXES[side] })),
  turnLimit: request.turnLimit,
  objectives: deployment.objectives.map(({ hexId, points }) => ({ hexId, points })),
  // An attack is won by taking half the defender's VP (docs/roadmap/13-engagement-scenarios-wbs.md §4).
  ...(deployment.attacker === null ? {} : { attackVictory: {
    attackerId: players[deployment.attacker],
    attackerPoints: attackVictoryPoints(deployment.objectives.reduce((total, { points }) => total + points, 0)),
  } }),
  railroads: GENERATED_RAILROADS,
});

/** 13.3: generated railroads, and the settlements that make a rail Hex detrainable (13.3c). */
export const GENERATED_RAILROADS: RailroadConfiguration = {
  lines: [
    { featureDefinitionId: id(GENERATED_RAIL), multiTrack: false },
    { featureDefinitionId: id(GENERATED_MULTI_TRACK_RAIL), multiTrack: true },
  ],
  detrainableFeatureDefinitionIds: [id('settlement:village'), id('settlement:town'), id('settlement:city')],
};
