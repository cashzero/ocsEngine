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
 * (Japanese edition, "移動に関する地形効果表", Normal, Mud and Snow columns). Source file SHA-256:
 * 2a51331aae3b6e816353c80f3156c7a01df6dc035944374b9fd0eecba54dd0e9.
 * See docs/rules/btr-movement-tec.md for the full transcription and the generated-terrain mapping.
 *
 * The BTR road footnote that raises German road costs under unhalted air interdiction is not
 * modelled because generated games have no air units (air power is outside the ground game).
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

/** Normal, Mud and Snow columns of one TEC line. */
const columns = (normal: MobilityMovementCosts, mud: MobilityMovementCosts, snow: MobilityMovementCosts) => ({
  costs: normal,
  weather: [{ condition: 'MUD' as const, costs: mud }, { condition: 'SNOW' as const, costs: snow }],
});

const terrain = (definitionId: string, entry: ReturnType<typeof columns>): TerrainMovementCost =>
  ({ terrainDefinitionId: id(definitionId), ...entry });
const hexside = (definitionId: string, entry: ReturnType<typeof columns>): HexsideMovementCost =>
  ({ featureDefinitionId: id(definitionId), ...entry });
const road = (definitionId: string, entry: ReturnType<typeof columns>): RoadMovementCost =>
  ({ featureDefinitionId: id(definitionId), ...entry });

/** Generated railroad hexside features (13.3): single-track and multi-track lines. */
export const GENERATED_RAIL = 'edge:rail';
export const GENERATED_MULTI_TRACK_RAIL = 'edge:multi-track-rail';

export const GENERATED_TERRAIN_MOVEMENT_COSTS: readonly TerrainMovementCost[] = [
  // Open
  terrain('terrain:clear', columns(row(mp(1), mp(1), mp(1)), row(mp(4), mp(8), mp(2)), row(mp(2), mp(2), mp(2)))),
  // Hills
  terrain('terrain:rough', columns(row(mp(2), mp(3), mp(1)), row(mp(4), mp(6), mp(2)), row(mp(3), mp(6), mp(2)))),
  // Woods
  terrain('terrain:woods', columns(row(mp(2), mp(3), mp(1)), row(mp(6), ALL, mp(2)), row(mp(4), mp(5), mp(3)))),
  // Swamp
  terrain('terrain:marsh', columns(row(P, P, mp(3)), row(P, P, mp(4)), row(mp(5), mp(6), mp(3)))),
  // Mountain
  terrain('terrain:mountain', columns(row(P, P, ALL), row(P, P, ALL), row(P, P, ALL))),
  // Ocean
  terrain('terrain:water', columns(row(P, P, P), row(P, P, P), row(P, P, P))),
  // Village
  terrain('settlement:village', columns(row(OT, OT, OT), row(OT, OT, OT), row(OT, OT, OT))),
  // Minor City
  terrain('settlement:town', columns(row(mp(1), mp(1), mp(1)), row(mp(1), mp(1), mp(1)), row(mp(1), mp(1), mp(1)))),
  // Major City
  terrain('settlement:city', columns(row(mp(1), mp(1), mp(1)), row(mp(1), mp(1), mp(1)), row(mp(1), mp(1), mp(1)))),
];

export const GENERATED_HEXSIDE_MOVEMENT_COSTS: readonly HexsideMovementCost[] = [
  // Minor River or Canal (additive)
  hexside('edge:river', columns(row(mp(3), mp(5), mp(1)), row(mp(4), mp(6), mp(2)), row(mp(3), mp(5), mp(1)))),
  // Major River or Canal
  hexside('edge:major-river', columns(row(P, P, ALL), row(P, P, ALL), row(P, P, ALL))),
];

export const GENERATED_ROAD_MOVEMENT_COSTS: readonly RoadMovementCost[] = [
  // Secondary Road
  road('edge:primary-road', columns(row(mp(0.5), mp(0.5), mp(0.5)), row(mp(1), mp(2), mp(1)), row(mp(1), mp(1), mp(1)))),
  // Track
  road('edge:road', columns(row(mp(1), mp(1), mp(1)), row(mp(1), mp(4), mp(1)), row(mp(1), mp(1), mp(1)))),
  // Railroad: a road for movement (6.2a). BtR prints one Railroad line for single- and multi-track.
  road(GENERATED_RAIL, columns(row(mp(1), mp(1), mp(1)), row(mp(1), mp(4), mp(1)), row(mp(1), mp(1), mp(1)))),
  road(GENERATED_MULTI_TRACK_RAIL, columns(row(mp(1), mp(1), mp(1)), row(mp(1), mp(4), mp(1)), row(mp(1), mp(1), mp(1)))),
];
