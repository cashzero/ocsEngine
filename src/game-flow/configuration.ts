import { FOUNDATION_SCHEMA_VERSION, parseDefinitionId, type DefinitionId, type PlayerId, type Result } from '../core/index.js';
import { buildRebuildTable, sideDivisions, variableReplacementTable, type GeneratedOob, type OobSide } from '../generation/oob/index.js';
import type { RailroadConfiguration, RiverConfiguration, RuleConfiguration } from '../rules/index.js';
import { attackerOf, newGameSeaOf, seaArrivalSidesOf, type GeneratedDeployment, type NewGameRequest } from './model.js';
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

/**
 * Default Rail Cap points per Movement Phase (13.3b) for each side of a New Game: this many points per division, at least 1.
 * Rail Cap carries SP from the map edge to the railhead; trucks take it on to the front. Bot-against-bot games
 * (docs/quality/evidence/rail-cap-plan-2026-10-08/README.md §5) used every point offered, and a Rail Cap near the Supply Table income (1 per
 * division) let the attacker carry all of it forward. 0.4 left Rail Cap far below the trucks' lift (user, 2026-10-12:
 * "many trucks, little Rail Cap looks unreasonable"), so it is raised to 0.75 while the truck count is cut.
 */
export const RAIL_CAP_PER_DIVISION = 0.75;

export const defaultRailCap = (request: NewGameRequest): { readonly allied: number; readonly axis: number } => {
  const attacker = attackerOf(request.engagement ?? 'MEETING');
  const points = (side: OobSide): number =>
    Math.max(1, Math.round(sideDivisions({ ...request.oob, ...(attacker === null ? {} : { attacker }) }, side).divisionsPerSide * RAIL_CAP_PER_DIVISION));
  return { allied: points('ALLIED'), axis: points('AXIS') };
};

/**
 * Default Sea Cap points per Movement Phase (19.0f), per division of the side. A side without inland entry lands
 * everything by ship, so its Sea Cap is its lifeline, and it is set below what arrives each turn (about 1 SP per division
 * from the Supply Table, plus units and Repls) so that shipping and port capacity, not the enemy alone, limit it (user,
 * 2026-10-10). A side with inland entry uses the sea as a side route between friendly ports and gets a little.
 */
export const SEA_CAP_PER_DIVISION = 0.6;
export const FLANK_SEA_CAP_PER_DIVISION = 0.25;

/** Sea Cap of each side by default: every side gets some. Null on a map without a sea. */
export const defaultSeaCap = (request: NewGameRequest): { readonly allied: number; readonly axis: number } | null => {
  if (newGameSeaOf(request) === 'NONE') return null;
  const attacker = attackerOf(request.engagement ?? 'MEETING');
  const divisions = (side: OobSide): number => sideDivisions({ ...request.oob, ...(attacker === null ? {} : { attacker }) }, side).divisionsPerSide;
  const bySea = seaArrivalSidesOf(request);
  const points = (side: OobSide): number =>
    Math.max(1, Math.round(divisions(side) * (bySea.includes(side) ? SEA_CAP_PER_DIVISION : FLANK_SEA_CAP_PER_DIVISION)));
  return { allied: points('ALLIED'), axis: points('AXIS') };
};

/** Sea Cap of each side in this New Game: the player's, else the default. Null on a map without a sea. */
export const seaCapOf = (request: NewGameRequest): { readonly allied: number; readonly axis: number } | null =>
  newGameSeaOf(request) === 'NONE' ? null : request.seaCap ?? defaultSeaCap(request);

/** Sides that may ship and use ports in this New Game: those with Sea Cap above 0. Allied first. */
export const shippingSides = (request: NewGameRequest): readonly OobSide[] => {
  const cap = seaCapOf(request);
  return cap === null ? [] : (['ALLIED', 'AXIS'] as const).filter((side) => (side === 'ALLIED' ? cap.allied : cap.axis) > 0);
};

/** The VP an attacker must hold at the end to win: its starting VP plus half the defender’s starting VP, rounded up. */
export const attackVictoryPoints = (totalPoints: number, startingPoints = 0): number => startingPoints + Math.max(1, Math.ceil((totalPoints - startingPoints) / 2));

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
  // An attack is won by taking half the defender's VP (docs/quality/evidence/engagements-plan-2026-10-07/README.md §4).
  ...(deployment.attacker === null ? {} : { attackVictory: {
    attackerId: players[deployment.attacker],
    attackerPoints: attackVictoryPoints(
      deployment.objectives.reduce((total, { points }) => total + points, 0),
      deployment.objectives.reduce((total, { hexId, points }) => total + (deployment.initialMapState.hexControl
        .find((entry) => entry.hexId === hexId)?.controllerId === players[deployment.attacker!] ? points : 0), 0),
    ),
  } }),
  // 13.5: each side rolls its Variable Replacement Table and rebuilds by its Rebuild Table (docs/rule-engine/replacements.md).
  replacementArrivals: { players: (['ALLIED', 'AXIS'] as const).map((side) => ({ playerId: players[side], rows: variableReplacementTable(oob.options.scale) })) },
  rebuildTables: { players: (['ALLIED', 'AXIS'] as const).map((side) => ({ playerId: players[side], rows: buildRebuildTable(oob.pieceDefinitionCatalog.definitions, side) })) },
  railroads: GENERATED_RAILROADS,
  rivers: GENERATED_RIVERS,
  railCapacity: (() => {
    const cap = request.railCap ?? defaultRailCap(request);
    return [{ playerId: players.ALLIED, points: cap.allied }, { playerId: players.AXIS, points: cap.axis }];
  })(),
  ...(shippingSides(request).length === 0 ? {} : {
    seaCapacity: shippingSides(request).map((side) => {
      const cap = seaCapOf(request)!;
      return { playerId: players[side], points: side === 'ALLIED' ? cap.allied : cap.axis };
    }),
  }),
  ...(seaArrivalSidesOf(request).length === 0 ? {} : { seaArrivals: seaArrivalSidesOf(request).map((side) => players[side]) }),
});

/** 13.8b: the generated Minor and Major Rivers that Engineer-Capable units bridge. */
export const GENERATED_RIVERS: RiverConfiguration = {
  minorFeatureDefinitionIds: [id('edge:river')],
  majorFeatureDefinitionIds: [id('edge:major-river')],
};

/** 13.3: generated railroads, and the settlements that make a rail Hex detrainable (13.3c). */
export const GENERATED_RAILROADS: RailroadConfiguration = {
  lines: [
    { featureDefinitionId: id(GENERATED_RAIL), multiTrack: false },
    { featureDefinitionId: id(GENERATED_MULTI_TRACK_RAIL), multiTrack: true },
  ],
  detrainableFeatureDefinitionIds: [id('settlement:village'), id('settlement:town'), id('settlement:city')],
};
