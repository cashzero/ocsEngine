import { parseDefinitionId, type DefinitionId } from '../core/index.js';
import type {
  HexsideMovementCost,
  MobilityMovementCosts,
  MovementCost,
  RoadMovementCost,
  TerrainMovementCost,
} from '../rules/index.js';

/**
 * Terrain Effects on Movement for generated games, transcribed from the Beyond the Rhine TEC
 * (Japanese edition, "移動に関する地形効果表", Normal ground condition). Source file SHA-256:
 * 2a51331aae3b6e816353c80f3156c7a01df6dc035944374b9fd0eecba54dd0e9.
 * See docs/rules/btr-movement-tec.md for the full transcription and the generated-terrain mapping.
 *
 * TODO(weather): Mud and Snow columns are not selected because weather/ground condition is not
 * implemented; every generated turn uses the Normal column. TODO(air): the BTR road footnote that
 * raises German road costs under unhalted air interdiction is not modelled (air power is deferred).
 */

const id = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Movement TEC Definition ID ${value} is invalid.`);
  return parsed.value;
};

/** Converts printed MP (whole or half) to exact quarter-MP ticks. */
const mp = (points: number): MovementCost => ({ kind: 'MP', ticks: Math.round(points * 4) });
const P: MovementCost = { kind: 'PROHIBITED' };
const ALL: MovementCost = { kind: 'ALL' };
const OT: MovementCost = { kind: 'OTHER_TERRAIN' };
/** Column order on the printed chart: Track, Truck, Leg. */
const row = (tracked: MovementCost, truck: MovementCost, leg: MovementCost): MobilityMovementCosts => ({ tracked, truck, leg });

const terrain = (definitionId: string, costs: MobilityMovementCosts): TerrainMovementCost =>
  ({ terrainDefinitionId: id(definitionId), costs });
const hexside = (definitionId: string, costs: MobilityMovementCosts): HexsideMovementCost =>
  ({ featureDefinitionId: id(definitionId), costs });
const road = (definitionId: string, costs: MobilityMovementCosts): RoadMovementCost =>
  ({ featureDefinitionId: id(definitionId), costs });

export const GENERATED_TERRAIN_MOVEMENT_COSTS: readonly TerrainMovementCost[] = [
  terrain('terrain:clear', row(mp(1), mp(1), mp(1))), // Open
  terrain('terrain:rough', row(mp(2), mp(3), mp(1))), // Hills
  terrain('terrain:woods', row(mp(2), mp(3), mp(1))), // Woods
  terrain('terrain:marsh', row(P, P, mp(3))), // Swamp
  terrain('terrain:mountain', row(P, P, ALL)), // Mountain
  terrain('terrain:water', row(P, P, P)), // Ocean
  terrain('settlement:village', row(OT, OT, OT)), // Village
  terrain('settlement:town', row(mp(1), mp(1), mp(1))), // Minor City
  terrain('settlement:city', row(mp(1), mp(1), mp(1))), // Major City
];

export const GENERATED_HEXSIDE_MOVEMENT_COSTS: readonly HexsideMovementCost[] = [
  hexside('edge:river', row(mp(3), mp(5), mp(1))), // Minor River or Canal (additive)
  hexside('edge:major-river', row(P, P, ALL)), // Major River or Canal
];

export const GENERATED_ROAD_MOVEMENT_COSTS: readonly RoadMovementCost[] = [
  road('edge:primary-road', row(mp(0.5), mp(0.5), mp(0.5))), // Secondary Road
  road('edge:road', row(mp(1), mp(1), mp(1))), // Track
];
