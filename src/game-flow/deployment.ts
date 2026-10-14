import {
  FOUNDATION_SCHEMA_VERSION,
  parseHexCoordinateId,
  parsePieceId,
  revision,
  type HexId,
  type PieceId,
  type PlayerId,
  type Result,
} from '../core/index.js';
import {
  parseHexsideId,
  parseMapBoxId,
  type HexDefinition,
  type MapBoxId,
  type MapState,
} from '../domain/map/index.js';
import type {
  PieceDefinition,
  PieceRelation,
  PieceRuntimeState,
  PieceState,
} from '../domain/piece/index.js';
import { createSeededRandom, mixUint32, type GeneratedMap } from '../generation/map/index.js';
import type { GeneratedOob, GeneratedOobUnit, OobSide } from '../generation/oob/index.js';
import { adjacentHexIds, FIRST_ARRIVAL_TURN, movementCostModel, portFeatureState, type MobilityType, type MovementCostModel } from '../rules/index.js';
import { attackerOf, type Engagement, type GameFlowFailure, type GeneratedDeployment } from './model.js';
import {
  GENERATED_DEFAULT_TERRAIN_COST_TICKS,
  GENERATED_STACKING_LIMIT_RE_TICKS,
  GENERATED_SUPPLY_DRAW_RANGE_TICKS,
} from './configuration.js';
import {
  GENERATED_HEXSIDE_MOVEMENT_COSTS,
  GENERATED_MULTI_TRACK_RAIL,
  GENERATED_RAIL,
  GENERATED_ROAD_MOVEMENT_COSTS,
  GENERATED_TERRAIN_MOVEMENT_COSTS,
} from './movement-tec.js';
import { initialAirBaseLevel } from '../generation/oob/air.js';

const uint32 = (value: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;

const reinforcementBoxId = (value: string): MapBoxId => {
  const parsed = parseMapBoxId(value);
  if (!parsed.ok) throw new Error('Generated reinforcement Box ID is invalid.');
  return parsed.value;
};

export const GENERATED_REINFORCEMENT_BOXES: Readonly<Record<OobSide, MapBoxId>> = {
  ALLIED: reinforcementBoxId('box:generated:allied-reinforcements'),
  AXIS: reinforcementBoxId('box:generated:axis-reinforcements'),
};

/** The off-map box holding a side's off-map airfield and its aircraft (docs/roadmap/13-engagement-scenarios-wbs.md §6). */
export const GENERATED_OFF_MAP_AIRFIELD_BOXES: Readonly<Record<OobSide, MapBoxId>> = {
  ALLIED: reinforcementBoxId('box:generated:allied-off-map-airfield'),
  AXIS: reinforcementBoxId('box:generated:axis-off-map-airfield'),
};

const distance = (first: HexId, second: HexId): number => {
  const left = parseHexCoordinateId(first);
  const right = parseHexCoordinateId(second);
  if (!left.ok || !right.ok) return Number.MAX_SAFE_INTEGER;
  const dq = left.value.q - right.value.q;
  const dr = left.value.r - right.value.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const terrainIsWater = (hex: HexDefinition): boolean =>
  hex.terrainDefinitionIds.includes('terrain:water' as never);

const allUnits = (oob: GeneratedOob): readonly GeneratedOobUnit[] => oob.sides.flatMap((side) => [
  ...side.formations.flatMap((formation) => formation.units),
  ...side.independentUnits,
]);

/** Deployment group of each OOB unit: its division slot (a single-unit division too, though it has no Formation ID), else independent. */
const deploymentGroups = (oob: GeneratedOob): ReadonlyMap<string, string> => new Map(oob.sides.flatMap((side) =>
  side.formations.flatMap((formation) => formation.units.map((unit) => [unit.id, String(formation.id)] as const))));

const sidePlayer = (side: OobSide, players: Readonly<Record<OobSide, PlayerId>>): PlayerId => players[side];

const deployedFace = (definition: PieceDefinition) =>
  definition.faces.find(({ id }) => id === 'move') ?? definition.faces[0];

const deployedMobility = (definition: PieceDefinition): MobilityType | null => {
  const mobility = String(deployedFace(definition)?.mobilityClassDefinitionId ?? '');
  return mobility === 'mobility:leg' ? 'leg' : mobility === 'mobility:truck' ? 'truck'
    : mobility === 'mobility:tracked' ? 'tracked' : null;
};

const terrainCostById = new Map(GENERATED_TERRAIN_MOVEMENT_COSTS
  .map(({ terrainDefinitionId, costs }) => [String(terrainDefinitionId), costs]));

/** False when the generated TEC prohibits the mobility type from any terrain in the Hex. */
const canDeployOn = (hex: HexDefinition, mobility: MobilityType | null): boolean => mobility === null
  || ![...hex.terrainDefinitionIds, ...hex.features.map(({ definitionId }) => definitionId)]
    .some((id) => terrainCostById.get(String(id))?.[mobility].kind === 'PROHIBITED');

const fullStrength = (definition: PieceDefinition): number | null => {
  const steps = definition.faces[0]?.steps ?? [];
  return steps.length === 0 ? null : Math.max(...steps.map((profile) => profile.remainingSteps));
};

const deployedReTicks = (definition: PieceDefinition): number => {
  const strength = fullStrength(definition);
  return Number(deployedFace(definition)?.steps.find(({ remainingSteps }) => remainingSteps === strength)
    ?.regimentalEquivalentTicks ?? 0);
};

const reTicks = (piece: PieceState, definition: PieceDefinition): number => {
  if (piece.remainingSteps === null) return 0;
  const face = definition.faces.find(({ id }) => id === piece.currentFaceId);
  return Number(face?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)
    ?.regimentalEquivalentTicks ?? 0);
};

/**
 * Preferred minimum Hex distance between formation centres, so formations form separate groups rather
 * than one blob. Units of one formation may share a Hex or stand adjacent; this relaxes only when the
 * zone is too small.
 */
export const GENERATED_FORMATION_SPACING_HEXES = 3;

/** Field units per Hex inside a formation group, so stacks stay small. */
const FIELD_UNITS_PER_HEX = 2;

/** Supply dumps stand apart from each other and at least this many Hexes in from the entry Hex, not on the map edge. */
const DUMP_MIN_DEPTH_HEXES = 3;
const DUMP_SPACING_HEXES = 3;
/** A truck looks this far from its dump for a road or railroad Hex to stand on before it settles for one off the road net. */
const TRUCK_ROAD_SEARCH_HEXES = 3;
/** An independent Truck-MA unit takes a road Hex this many Hexes further from its planned spot over an off-road one. */
const INDEPENDENT_OFF_ROAD_COST_HEXES = 6;
/** A division centre takes a road Hex this many Hexes out of its place over an off-road one, when its units want a road. */
const DIVISION_CENTRE_OFF_ROAD_COST_HEXES = 3;
/** Air Bases stand further back still: at least this many Hexes behind the line where a side's field units begin (15.0). */
const AIR_BASE_BEHIND_LINE_HEXES = 6;
/**
 * Each HQ serves the divisions around it (13.1b): it stands this many Hexes or more behind the line where the field units
 * begin, as near as it can to the centre of the divisions it was given, in trace supply and on the road net.
 */
const HQ_BEHIND_LINE_HEXES = 1;
/** HQs of one side stand at least this many Hexes apart when the front is that wide: one to a sector. */
const HQ_SPACING_HEXES = 4;
/** Cost, in Hexes of distance from its divisions, of an HQ Hex outside trace supply (12.3b) or outside its own sector. */
const HQ_OUT_OF_TRACE_COST_HEXES = 3;
const HQ_OFF_NETWORK_COST_HEXES = 1.5;
/** An HQ moves in Move Mode with Truck MA, so it takes a road Hex up to this many Hexes further from its axis (user, 2026-10-09). */
const HQ_OFF_ROAD_COST_HEXES = 4;
/** Air Bases stand apart from each other, and clear of dumps and HQs (15.0a: one base to a Hex). */
const AIR_BASE_SPACING_HEXES = 3;
const REAR_AREA_CLEARANCE_HEXES = 2;

/**
 * How far behind the split between the deployment zones each side's field units begin, in Hexes (user request
 * 2026-10-07: the sides started 20-28 Hexes apart, too far). A meeting engagement leaves about twice this between the
 * armies. In an attack the defender stands close behind its front, in Combat Mode, and the attacker assembles a few
 * Hexes back from it.
 */
export const GENERATED_FRONT_STANDOFF_HEXES: Readonly<Record<'MEETING' | 'ATTACKER' | 'DEFENDER', number>> = {
  MEETING: 4, ATTACKER: 3, DEFENDER: 1,
};

/** Share of the distance between the entry anchors by which an attack moves the split toward the attacker's edge. */
export const GENERATED_ATTACK_SPLIT_SHIFT = 0.4;

/** Settlements that make a rail Hex detrainable (13.3c), so a Supply Source (12.6a). */
const DETRAINABLE_FEATURES = new Set(['settlement:village', 'settlement:town', 'settlement:city']);

/** Emergency stock for an isolated VP: one feeding payment (12.6c), allocated from the side's existing SP budget. */
export const GENERATED_GARRISON_STOCK_TOKENS = 1;

/**
 * In an attack the defender's garrisons start dug in (16.0): a hedgehog of this Level under every objective garrison
 * and every key-point garrison. The attacker starts with none; both sides may build more in play (2 SP a Level).
 */
export const GENERATED_HEDGEHOG_LEVELS: Readonly<{ readonly OBJECTIVE: number; readonly KEY_POINT: number }> = { OBJECTIVE: 2, KEY_POINT: 1 };

/** In an attack the defender garrisons this many key points per objective (rounded up): supply nodes and road junctions. */
export const GENERATED_KEY_POINT_GARRISON_SHARE = 0.5;
/** Key-point garrisons stand at least this many hexes from each other and from the objectives. */
const GENERATED_KEY_POINT_SPACING_HEXES = 3;
/** A road junction joins at least this many roads (hexsides with a road). */
const GENERATED_ROAD_JUNCTION_DEGREE = 3;

/** Combat units that can move onto the other side's ground and negate a ZOC: they count for first-move reach and draw paths. */
const DEFENDER_COMBAT_ROLES = new Set(['COMBAT', 'RECONNAISSANCE', 'TANK', 'ANTI_TANK', 'ENGINEER']);
/** An engineer looks this far from its sector's HQ for a road Hex before it settles for one off the road. */
const ENGINEER_HQ_RADIUS_HEXES = 4;
/** Divisions spread over the sectors first, so no sector gets two of them while another has none. */
const MECHANIZED_ARCHETYPES = new Set(['ARMORED', 'MOBILE_INFANTRY']);
/** The order independent units are shared out between the sectors: each role is spread before the next. */
const INDEPENDENT_ROLE_ORDER: readonly string[] = ['TANK', 'ANTI_TANK', 'ENGINEER', 'RECONNAISSANCE', 'COMBAT', 'ARTILLERY'];
/** Depth, in Hexes behind the start line, of the band in which the front's width and its main axes are measured. */
const FRONT_BAND_HEXES = 3;
/** Line units within this many Hexes behind the start line begin in Combat Mode (user, 2026-10-09). */
const FRONT_COMBAT_MODE_HEXES = 2;
/**
 * Engineers do not hold the line (user, 2026-10-10): a Pontoon unit cannot attack (3.2b) and its work is construction near
 * the HQs and dumps (13.8d). They start in Move Mode by their sector's HQ, behind the front band where the line units start
 * in Combat Mode.
 */
const ENGINEER_BEHIND_LINE_HEXES = FRONT_COMBAT_MODE_HEXES;

const generatedCostModel = (map: GeneratedMap, mobility: MobilityType): MovementCostModel => movementCostModel({
  scenario: { mapDefinition: map.mapDefinition },
  configuration: {
    terrainMovementCosts: GENERATED_TERRAIN_MOVEMENT_COSTS,
    hexsideMovementCosts: GENERATED_HEXSIDE_MOVEMENT_COSTS,
    roadMovementCosts: GENERATED_ROAD_MOVEMENT_COSTS,
    defaultTerrainCostTicks: GENERATED_DEFAULT_TERRAIN_COST_TICKS,
  },
  weather: { groundCondition: 'DRY' },
}, mobility);

/** Printed Movement Allowance, in ticks, of a unit's deployed (Move Mode) face at full strength. */
const deployedMovementTicks = (definition: PieceDefinition): number => {
  const strength = fullStrength(definition);
  return Number(deployedFace(definition)?.steps.find(({ remainingSteps }) => remainingSteps === strength)?.movementPointTicks ?? 0);
};

/**
 * Hexes a unit at `originHexId` could enter in one Movement Segment with `allowanceTicks`: never a Hex in `blocked`
 * (enemy-held), and it stops on entering a Hex in `stopIn` (a ZOC that halts Truck movers, 4.5a). A move that takes
 * all of a unit's MP, and the one-Hex minimum move, count from the origin only.
 */
const firstMoveReach = (model: MovementCostModel, originHexId: HexId, allowanceTicks: number, blocked: ReadonlySet<HexId>, stopIn: ReadonlySet<HexId>): ReadonlySet<HexId> => {
  const best = new Map<HexId, number>([[originHexId, 0]]);
  const reached = new Set<HexId>();
  const open: { hexId: HexId; cost: number }[] = [{ hexId: originHexId, cost: 0 }];
  while (open.length > 0) {
    open.sort((left, right) => left.cost - right.cost);
    const current = open.shift()!;
    if (reached.has(current.hexId) || current.cost > (best.get(current.hexId) ?? Number.POSITIVE_INFINITY)) continue;
    reached.add(current.hexId);
    const fromOrigin = current.hexId === originHexId;
    if (!fromOrigin && stopIn.has(current.hexId)) continue;
    for (const next of adjacentHexIds(current.hexId)) {
      if (blocked.has(next) || reached.has(next)) continue;
      const step = model.evaluate(current.hexId, next);
      if (step.kind !== 'COST') continue;
      const cost = current.cost + step.cost.totalTicks;
      if (step.all || cost > allowanceTicks) {
        if (fromOrigin && allowanceTicks > 0) { reached.add(next); best.set(next, cost); }
        continue;
      }
      if (cost >= (best.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next, cost);
      open.push({ hexId: next, cost });
    }
  }
  return reached;
};

/**
 * Hexes a supply dump at `originHexId` reaches by Truck draw (12.3a, 12.3d). Truck and Track units
 * need fuel from a dump within that range (12.5), so field units deploy inside it. Uses the same
 * movement cost model as play (weather ignored, 17.0c), so terrain, rivers and roads are respected. A path never
 * enters a Hex in `blocked` (an enemy ZOC, 4.5a B).
 */
const supplyReach = (model: MovementCostModel, originHexId: HexId, blocked: ReadonlySet<HexId> = new Set()): ReadonlySet<HexId> => {
  const best = new Map<HexId, number>([[originHexId, 0]]);
  const queue: HexId[] = [originHexId];
  for (let head = 0; head < queue.length; head += 1) {
    const hexId = queue[head]!;
    for (const next of adjacentHexIds(hexId)) {
      const step = model.evaluate(hexId, next);
      if (step.kind !== 'COST' || step.all || blocked.has(next)) continue;
      const total = best.get(hexId)! + step.cost.totalTicks;
      if (total > GENERATED_SUPPLY_DRAW_RANGE_TICKS || total >= (best.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next, total);
      queue.push(next);
    }
  }
  return new Set(best.keys());
};

/**
 * Victory points of an objective (user, 2026-10-10: supply is the heart of OCS, so the larger the settlement and the more
 * important the transport node, the more it is worth). An objective's VP is its settlement's points plus:
 * a port (19.0, by its capacity), a railroad through it (a detrainable station, 13.3c), and a rail junction (1 more at three rail directions, 2 at four, 3 at five, 4 at six; one more on each if a double-track (multi-track, 13.3a) railroad runs through that junction). A village counts only as a
 * transport node; open country is never an objective.
 */
export const GENERATED_MAJOR_CITY_OBJECTIVE_POINTS = 3;
export const GENERATED_TOWN_OBJECTIVE_POINTS = 1;
export const GENERATED_VILLAGE_OBJECTIVE_POINTS = 0;
/** A port is worth one VP per this many Tokens of printed capacity (19.0a), at least one. */
export const GENERATED_PORT_CAPACITY_TOKENS_PER_VP = 4;
export const GENERATED_RAIL_OBJECTIVE_POINTS = 1;
/** A rail junction (hub) with a double-track (multi-track) railroad through it is worth this much more (user, 2026-10-10). */
export const GENERATED_MULTI_TRACK_OBJECTIVE_POINTS = 1;
/** A rail junction is worth this much at the minimum degree, and {@link GENERATED_RAIL_JUNCTION_STEP_POINTS} more per extra rail direction (1, 2, 3, 4, ... without multi-track; one more with it). */
export const GENERATED_RAIL_JUNCTION_OBJECTIVE_POINTS = 1;
export const GENERATED_RAIL_JUNCTION_STEP_POINTS = 1;
/** A rail junction has railroad on at least this many of its hexsides. */
const GENERATED_RAIL_JUNCTION_DEGREE = 3;
/** Each side's half of the map holds about one objective VP per this many of its land Hexes. */
export const GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT = 64;
const MINIMUM_OBJECTIVE_POINTS_PER_SIDE = 2;

const CITY_FEATURE = 'settlement:city';
const TOWN_FEATURE = 'settlement:town';
const VILLAGE_FEATURE = 'settlement:village';

/** An objective Hex's VP: its settlement plus its transport value (port, railroad, rail junction). */
export const objectivePoints = (settlement: 'CITY' | 'TOWN' | 'VILLAGE', transport: { readonly portCapacityTokens: number; readonly railDegree: number; readonly multiTrack?: boolean }): number =>
  (settlement === 'CITY' ? GENERATED_MAJOR_CITY_OBJECTIVE_POINTS : settlement === 'TOWN' ? GENERATED_TOWN_OBJECTIVE_POINTS : GENERATED_VILLAGE_OBJECTIVE_POINTS)
  + (transport.portCapacityTokens > 0 ? Math.max(1, Math.round(transport.portCapacityTokens / GENERATED_PORT_CAPACITY_TOKENS_PER_VP)) : 0)
  + (transport.railDegree > 0 ? GENERATED_RAIL_OBJECTIVE_POINTS : 0)
  + (transport.multiTrack === true && transport.railDegree >= GENERATED_RAIL_JUNCTION_DEGREE ? GENERATED_MULTI_TRACK_OBJECTIVE_POINTS : 0)
  + (transport.railDegree >=GENERATED_RAIL_JUNCTION_DEGREE
    ? GENERATED_RAIL_JUNCTION_OBJECTIVE_POINTS + GENERATED_RAIL_JUNCTION_STEP_POINTS * (transport.railDegree - GENERATED_RAIL_JUNCTION_DEGREE) : 0);

export interface GeneratedObjective {
  readonly hexId: HexId;
  readonly points: number;
  /** The side whose deployment zone holds the objective; it controls the Hex only if behind that side's front. */
  readonly side: OobSide;
}

/** Fallback when the map has no Major City or town at all: the settlement (or land Hex) nearest the centre. */
const centralObjective = (map: GeneratedMap): HexId => {
  // Generated maps are odd-r offset rectangles, so the centre is measured in map columns.
  const centerColumn = (map.options.width - 1) / 2;
  const centerR = (map.mapDefinition.bounds.minR + map.mapDefinition.bounds.maxR) / 2;
  const column = (q: number, r: number): number => q + Math.floor(r / 2);
  const candidates = map.strategicRegions.settlementHexIds.length > 0
    ? map.strategicRegions.settlementHexIds
    : map.mapDefinition.hexes.filter((hex) => !terrainIsWater(hex)).map(({ id }) => id);
  return [...candidates].sort((left, right) => {
    const l = parseHexCoordinateId(left);
    const r = parseHexCoordinateId(right);
    if (!l.ok || !r.ok) return String(left).localeCompare(String(right));
    const ld = Math.abs(column(l.value.q, l.value.r) - centerColumn) + Math.abs(l.value.r - centerR);
    const rd = Math.abs(column(r.value.q, r.value.r) - centerColumn) + Math.abs(r.value.r - centerR);
    return ld - rd || String(left).localeCompare(String(right));
  })[0]!;
};

/** Ports, rail junctions and Major Cities always carry VP; the quota is a minimum, not a cap. */
const selectObjectives = (
  map: GeneratedMap,
  sideOf: (hexId: HexId) => OobSide,
  frontDistance: (hexId: HexId) => number,
  sideLand: Readonly<Record<OobSide, number>>,
  portsFirst: boolean,
  defender: OobSide | null = null,
): { readonly objectives: readonly GeneratedObjective[]; readonly warnings: readonly string[] } => {
  const hexById = new Map(map.mapDefinition.hexes.map((hex) => [hex.id, hex]));
  const edgeHexes = new Set([
    ...map.strategicRegions.firstEntryHexIds, ...map.strategicRegions.secondEntryHexIds,
    ...map.strategicRegions.firstSupplyHexIds, ...map.strategicRegions.secondSupplyHexIds,
  ]);
  const candidates: Record<OobSide, { hexId: HexId; points: number; city: boolean; rank: number; roads: number }[]> = { ALLIED: [], AXIS: [] };
  const railFeatures = new Set([GENERATED_RAIL, GENERATED_MULTI_TRACK_RAIL]);
  const railDegree = new Map<HexId, number>();
  const multiTrackHexes = new Set<HexId>();
  const railEdges: { first: HexId; second: HexId; multi: boolean }[] = [];
  for (const { hexsideId, featureDefinitionIds } of map.mapDefinition.hexsides) {
    if (!featureDefinitionIds.some((id) => railFeatures.has(String(id)))) continue;
    const parsed = parseHexsideId(hexsideId);
    if (!parsed.ok) continue;
    const multi = featureDefinitionIds.some((id) => String(id) === GENERATED_MULTI_TRACK_RAIL);
    railEdges.push({ first: parsed.value.firstHexId, second: parsed.value.secondHexId, multi });
    for (const hexId of [parsed.value.firstHexId, parsed.value.secondHexId]) {
      railDegree.set(hexId, (railDegree.get(hexId) ?? 0) + 1);
      if (multi) multiTrackHexes.add(hexId);
    }
  }
  // A multi-hex Major City is one junction: its rail directions are the railroad hexsides leaving the whole city
  // (rails between two of its own Hexes are internal), so a hub spread over several Hexes still counts as a hub.
  const cityHexes = map.strategicRegions.settlementHexIds.filter((hexId) =>
    hexById.get(hexId)?.features.some(({ definitionId }) => String(definitionId) === CITY_FEATURE) ?? false);
  const cityClusterOf = (core: HexId): Set<HexId> => {
    const cluster = new Set<HexId>([core]);
    const queue: HexId[] = [core];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      for (const hexId of cityHexes) {
        if (cluster.has(hexId) || distance(next, hexId) > 1) continue;
        cluster.add(hexId);
        queue.push(hexId);
      }
    }
    return cluster;
  };
  const roadFeatures = new Set(['edge:primary-road', 'edge:road']);
  const roadDegree = new Map<HexId, number>();
  for (const { hexsideId, featureDefinitionIds } of map.mapDefinition.hexsides) {
    if (!featureDefinitionIds.some((id) => roadFeatures.has(String(id)))) continue;
    const parsed = parseHexsideId(hexsideId);
    if (!parsed.ok) continue;
    for (const hexId of [parsed.value.firstHexId, parsed.value.secondHexId]) roadDegree.set(hexId, (roadDegree.get(hexId) ?? 0) + 1);
  }
  const portCapacity = new Map(map.strategicRegions.ports.map(({ hexId, capacityTokens }) => [hexId, capacityTokens] as const));
  const cityCores: HexId[] = [];
  // Settlement Hex IDs come ranked: each Major City core before its suburbs, then towns largest first.
  for (const hexId of map.strategicRegions.settlementHexIds) {
    const features = hexById.get(hexId)?.features.map(({ definitionId }) => String(definitionId)) ?? [];
    const city = features.includes(CITY_FEATURE);
    if (city) {
      // A suburb adjoins its core; Major Cities stand far apart, so an adjacent earlier city Hex is the core.
      if (cityCores.some((core) => distance(core, hexId) <= 1)) continue;
      cityCores.push(hexId);
    } else if (!features.includes(TOWN_FEATURE) && !features.includes(VILLAGE_FEATURE)) continue;
    let hexRailDegree = railDegree.get(hexId) ?? 0;
    let hexMultiTrack = multiTrackHexes.has(hexId);
    if (city) {
      const cluster = cityClusterOf(hexId);
      const outgoing = railEdges.filter(({ first, second }) => cluster.has(first) !== cluster.has(second));
      // Lines leaving through neighbouring Hexes (a doubled line, or a loop that rejoins at once) are one direction, not a hub.
      const outside: HexId[] = [...new Set(outgoing.map(({ first, second }) => (cluster.has(first) ? second : first)))];
      const groups: HexId[][] = [];
      for (const outsideHex of outside) {
        const touching = groups.filter((group) => group.some((other) => distance(other, outsideHex) <= 1));
        const merged = [outsideHex, ...touching.flat()];
        for (const group of touching) groups.splice(groups.indexOf(group), 1);
        groups.push(merged);
      }
      hexRailDegree = groups.length;
      hexMultiTrack = outgoing.some(({ multi }) => multi);
      // Rail inside the city still makes it a station, even with no line leaving it.
      if (hexRailDegree === 0 && [...cluster].some((id) => (railDegree.get(id) ?? 0) > 0)) hexRailDegree = 1;
    }
    if (edgeHexes.has(hexId) && !city && !portCapacity.has(hexId) && hexRailDegree < GENERATED_RAIL_JUNCTION_DEGREE) continue;
    const points = objectivePoints(city ? 'CITY' : features.includes(TOWN_FEATURE) ? 'TOWN' : 'VILLAGE',
      { portCapacityTokens: portCapacity.get(hexId) ?? 0, railDegree: hexRailDegree, multiTrack: hexMultiTrack });
    if (points <= 0) continue;
    // An attack targets the defender's zone, with attacker-owned ports also at stake.
    if (defender !== null && sideOf(hexId) !== defender && !portCapacity.has(hexId)) continue;
    candidates[sideOf(hexId)].push({
      hexId, city, points, roads: roadDegree.get(hexId) ?? 0,
      rank: portsFirst && portCapacity.has(hexId) ? 0
        : hexRailDegree >= GENERATED_RAIL_JUNCTION_DEGREE ? (portsFirst ? 1 : 0)
        : portCapacity.has(hexId) ? 1 : city ? 2 : 3,
    });
  }
  const sides = ['ALLIED', 'AXIS'] as const;
  const target = defender === null
    ? Math.max(MINIMUM_OBJECTIVE_POINTS_PER_SIDE,
      Math.round(Math.min(sideLand.ALLIED, sideLand.AXIS) / GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT))
    : 2 * Math.max(MINIMUM_OBJECTIVE_POINTS_PER_SIDE,
      Math.round((sideLand.ALLIED + sideLand.AXIS) / 2 / GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT));
  const objectives: GeneratedObjective[] = [];
  const totals = { ALLIED: 0, AXIS: 0 };
  const remaining: Record<OobSide, typeof candidates.ALLIED> = { ALLIED: [], AXIS: [] };
  const add = (side: OobSide, candidate: typeof candidates.ALLIED[number]): void => {
    objectives.push({ hexId: candidate.hexId, points: candidate.points, side });
    totals[side] += candidate.points;
  };
  for (const side of sides) {
    const size = new Map(candidates[side].map(({ hexId }, order) => [hexId, order]));
    const byValue = [...candidates[side]].sort((left, right) => left.rank - right.rank || right.points - left.points
      || right.roads - left.roads || frontDistance(left.hexId) - frontDistance(right.hexId)
      || size.get(left.hexId)! - size.get(right.hexId)!);
    // Critical nodes cannot lose their VP to the quota, even when a previous node already exceeded it.
    for (const candidate of byValue) {
      if (candidate.city || candidate.rank <= 1 || ((defender === null || side === defender) && totals[side] < target)) add(side, candidate);
      else remaining[side].push(candidate);
    }
  }
  // Meeting engagements add whole objectives in priority order, raising the other side’s target on overshoot.
  while (defender === null && totals.ALLIED !== totals.AXIS) {
    const side = totals.ALLIED < totals.AXIS ? 'ALLIED' : 'AXIS';
    const next = remaining[side].shift();
    if (next) { add(side, next); continue; }
    // When there are no candidates left, add the shortfall to the side's highest-priority objective.
    // This also balances small maps without removing a more valuable objective from the richer side.
    const index = objectives.findIndex((objective) => objective.side === side);
    if (index < 0) break;
    const extra = Math.abs(totals.ALLIED - totals.AXIS);
    objectives[index] = { ...objectives[index]!, points: objectives[index]!.points + extra };
    totals[side] += extra;
  }
  if (objectives.length === 0) {
    const hexId = centralObjective(map);
    return { objectives: [{ hexId, points: GENERATED_TOWN_OBJECTIVE_POINTS, side: sideOf(hexId) }], warnings: [] };
  }
  const warnings = defender !== null
    ? totals[defender] >= target ? [] : [`The defender holds only ${totals[defender]} of ${target} objective VP; its zone has too few settlements.`]
    : totals.ALLIED === totals.AXIS ? [] : [
    `Objectives are unbalanced (Allied ${totals.ALLIED} VP, Axis ${totals.AXIS} VP); one side has no eligible objective.`,
  ];
  return { objectives: objectives.sort((left, right) => String(left.hexId).localeCompare(String(right.hexId))), warnings };
};

const deploymentFailure = (message: string, path: readonly (string | number)[] = []): GameFlowFailure => ({
  stage: 'DEPLOYMENT', code: 'DEPLOYMENT_INVALID', message, path,
});

export const deployGeneratedForces = (
  map: GeneratedMap,
  oob: GeneratedOob,
  deploymentSeed: number,
  players: Readonly<Record<OobSide, PlayerId>>,
  engagement: Engagement = 'MEETING',
  /** Sides without inland entry Hexes (`seaArrivalSidesOf`): they land by sea, and their ports are their Supply Sources. */
  seaArrivalSides: readonly OobSide[] = [],
): Result<GeneratedDeployment, readonly GameFlowFailure[]> => {
  if (!uint32(deploymentSeed)) return { ok: false, error: [deploymentFailure('Deployment seed must be uint32.', ['seeds', 'deployment'])] };
  const initialRevision = revision(0);
  if (!initialRevision.ok) throw new Error('Revision zero must be valid.');
  const definitionById = new Map(oob.pieceDefinitionCatalog.definitions.map((definition) => [definition.id, definition]));
  const land = map.mapDefinition.hexes.filter((hex) => !terrainIsWater(hex));
  const hexById = new Map(map.mapDefinition.hexes.map((hex) => [hex.id, hex]));
  const firstAnchor = map.strategicRegions.firstEntryHexIds[0];
  const secondAnchor = map.strategicRegions.secondEntryHexIds[0];
  if (!firstAnchor || !secondAnchor || land.length === 0) {
    return { ok: false, error: [deploymentFailure('Generated map has no usable opposing entry regions.')] };
  }

  const truckModel = generatedCostModel(map, 'truck');
  const railFeatures = new Set([GENERATED_RAIL, GENERATED_MULTI_TRACK_RAIL]);
  const railLinks = map.mapDefinition.hexsides
    .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => railFeatures.has(String(id))))
    .flatMap(({ hexsideId }) => {
      const parsed = parseHexsideId(hexsideId);
      return parsed.ok ? [[parsed.value.firstHexId, parsed.value.secondHexId] as const] : [];
    });
  const railHexes = new Set(railLinks.flat());
  // Roads meeting in each hex (rail lines do not count: a junction is where roads cross).
  const roadFeatures = new Set(['edge:primary-road', 'edge:road']);
  const roadDegree = new Map<HexId, number>();
  for (const { hexsideId, featureDefinitionIds } of map.mapDefinition.hexsides) {
    if (!featureDefinitionIds.some((id) => roadFeatures.has(String(id)))) continue;
    const parsed = parseHexsideId(hexsideId);
    if (!parsed.ok) continue;
    for (const hexId of [parsed.value.firstHexId, parsed.value.secondHexId]) roadDegree.set(hexId, (roadDegree.get(hexId) ?? 0) + 1);
  }
  const primaryRoadHexes = new Set(map.mapDefinition.hexsides
    .filter(({ featureDefinitionIds }) => featureDefinitionIds.some((id) => String(id) === 'edge:primary-road'))
    .flatMap(({ hexsideId }) => {
      const parsed = parseHexsideId(hexsideId);
      return parsed.ok ? [parsed.value.firstHexId, parsed.value.secondHexId] : [];
    }));
  /** Rail towns each side's railroad joins to its map edge inside its zone: its supply nodes (13.3c). */
  const supplyNodes: Record<OobSide, Set<HexId>> = { ALLIED: new Set(), AXIS: new Set() };
  const railNeighbors = new Map<HexId, HexId[]>();
  for (const [first, second] of railLinks) {
    railNeighbors.set(first, [...railNeighbors.get(first) ?? [], second]);
    railNeighbors.set(second, [...railNeighbors.get(second) ?? [], first]);
  }
  /** Hexes in trace supply from `sources` (12.3): within draw range of one, or adjacent to that range (12.3c). */
  const traceReachFrom = (sources: readonly HexId[], blocked?: ReadonlySet<HexId>): ReadonlySet<HexId> => new Set(sources
    .flatMap((hexId) => [...(blocked === undefined ? supplyReachOf(hexId) : supplyReach(truckModel, hexId, blocked))])
    .flatMap((reached) => [reached, ...adjacentHexIds(reached)]));
  const reachCache = new Map<HexId, ReadonlySet<HexId>>();
  const supplyReachOf = (hexId: HexId): ReadonlySet<HexId> => {
    let reach = reachCache.get(hexId);
    if (!reach) { reach = supplyReach(truckModel, hexId); reachCache.set(hexId, reach); }
    return reach;
  };

  const sideAnchors: Readonly<Record<OobSide, HexId>> = { ALLIED: firstAnchor, AXIS: secondAnchor };
  const attacker = attackerOf(engagement);
  // The split between the zones, as how much nearer a Hex lies to the Allied anchor than to the Axis one: 0 in a
  // meeting engagement (the old midline); an attack moves it toward the attacker, so the defender holds more ground.
  const shift = Math.round(GENERATED_ATTACK_SPLIT_SHIFT * distance(firstAnchor, secondAnchor));
  const split = attacker === 'ALLIED' ? shift : attacker === 'AXIS' ? -shift : 0;
  const lean = (hexId: HexId): number => distance(hexId, secondAnchor) - distance(hexId, firstAnchor);
  /** Hexes from the split to `hexId` on `side`'s side of it (a step away from the front moves the lean by up to 2). */
  const depthOf = (side: OobSide, hexId: HexId): number => (side === 'ALLIED' ? lean(hexId) - split : split - lean(hexId)) / 2;
  const standoff = (side: OobSide): number => GENERATED_FRONT_STANDOFF_HEXES[
    attacker === null ? 'MEETING' : attacker === side ? 'ATTACKER' : 'DEFENDER'];
  const zones: Readonly<Record<OobSide, readonly HexDefinition[]>> = {
    ALLIED: land.filter(({ id }) => lean(id) >= split),
    AXIS: land.filter(({ id }) => lean(id) < split),
  };
  // 19.0: each port starts held by the side whose zone it lies in. A side without inland entry has no land entry edge:
  // its ports are its only Supply Sources and the only way in, so it always starts holding at least the port nearest its anchor.
  const portOwner = new Map<HexId, OobSide>(map.strategicRegions.ports.map(({ hexId }) => [hexId, lean(hexId) >= split ? 'ALLIED' : 'AXIS'] as const));
  for (const seaSide of seaArrivalSides) {
    if ([...portOwner.values()].includes(seaSide)) continue;
    const nearest = [...portOwner.keys()].sort((left, right) => distance(left, sideAnchors[seaSide]) - distance(right, sideAnchors[seaSide]) || String(left).localeCompare(String(right)))[0];
    if (nearest) portOwner.set(nearest, seaSide);
  }
  const portsOf = (side: OobSide): readonly HexId[] => [...portOwner.entries()].filter(([, owner]) => owner === side).map(([hexId]) => hexId)
    .sort((left, right) => distance(left, sideAnchors[side]) - distance(right, sideAnchors[side]) || String(left).localeCompare(String(right)));
  const sideSupply: Readonly<Record<OobSide, readonly HexId[]>> = {
    ALLIED: seaArrivalSides.includes('ALLIED') ? portsOf('ALLIED') : map.strategicRegions.firstSupplyHexIds,
    AXIS: seaArrivalSides.includes('AXIS') ? portsOf('AXIS') : map.strategicRegions.secondSupplyHexIds,
  };

  const pieces: PieceState[] = [];
  const planWarnings: string[] = [];
  const groups = deploymentGroups(oob);
  const archetypeOf = new Map(oob.sides.flatMap((entry) => entry.formations.map((formation) => [String(formation.id), formation.archetype] as const)));
  const onNetwork = (hexId: HexId): boolean => roadDegree.has(hexId) || railHexes.has(hexId);
  // Across the front: a Hex's offset, in Hexes, from the line joining the two entry anchors.
  const pointOf = (hexId: HexId): { readonly x: number; readonly y: number } => {
    const parsed = parseHexCoordinateId(hexId);
    return parsed.ok ? { x: Math.sqrt(3) * (parsed.value.q + parsed.value.r / 2), y: 1.5 * parsed.value.r } : { x: 0, y: 0 };
  };
  const anchorPoint = pointOf(firstAnchor);
  const towardEnemy = (() => {
    const far = pointOf(secondAnchor);
    const length = Math.hypot(far.x - anchorPoint.x, far.y - anchorPoint.y) || 1;
    return { x: (far.x - anchorPoint.x) / length, y: (far.y - anchorPoint.y) / length };
  })();
  const lateral = (hexId: HexId): number => {
    const point = pointOf(hexId);
    return ((point.x - anchorPoint.x) * towardEnemy.y - (point.y - anchorPoint.y) * towardEnemy.x) / Math.sqrt(3);
  };
  const costModels = new Map<MobilityType, MovementCostModel>();
  const costModelOf = (mobility: MobilityType): MovementCostModel => {
    let model = costModels.get(mobility);
    if (!model) { model = generatedCostModel(map, mobility); costModels.set(mobility, model); }
    return model;
  };
  type SidePlan = {
    readonly rng: ReturnType<typeof createSeededRandom>;
    readonly line: number;
    readonly units: readonly GeneratedOobUnit[];
    readonly supplyUnits: readonly GeneratedOobUnit[];
    readonly fieldUnits: readonly GeneratedOobUnit[];
    readonly reinforcement: GeneratedOobUnit | undefined;
    readonly heldBack: Set<string>;
    readonly fieldPlacements: { unit: GeneratedOobUnit; hexId: HexId }[];
    readonly usedReTicks: Map<HexId, number>;
    readonly fitsFor: (unit: GeneratedOobUnit) => (hexId: HexId) => boolean;
    readonly place: (unit: GeneratedOobUnit, hexId: HexId) => void;
    readonly placeFallback: (unit: GeneratedOobUnit) => boolean;
    readonly sectors: readonly { readonly low: number; readonly high: number; readonly middle: number }[];
    readonly sectorOfHex: (hexId: HexId) => number;
    readonly hqHexes: readonly HexId[];
    readonly traceReach: ReadonlySet<HexId>;
    readonly traceSources: readonly HexId[];
    readonly traceTier: (hexId: HexId) => number;
    readonly combatModeIds: Set<string>;
    readonly roadOk: (unit: GeneratedOobUnit, hexId: HexId) => boolean;
    readonly engineers: readonly { readonly unit: GeneratedOobUnit; readonly sector: number }[];
  };
  const relations: PieceRelation[] = [];
  const stackCounts = new Map<HexId, number>();
  // The deployment is planned the way a commander would (user, 2026-10-09), in two phases:
  //  1. Each side's front is split along its width into one sector per HQ, each around the strongest road or railroad
  //     that crosses the start line there (a main axis); the HQ stands on its axis just behind the line. The divisions
  //     (armored ones spread first) and the independent units are then shared out evenly between the sectors and spread
  //     across each sector's width, instead of the independent units forming one group. Units near the front start in
  //     Combat Mode, so the line has a ZOC from the first turn (4.5).
  //  2. Only once both armies stand is the supply placed: each dump where its sector's units can draw from it and out of
  //     reach of the enemy's first move. Tracked and Leg movement ignores ZOC (4.5a), so on open maps that usually means a
  //     Hex the side's own units hold. Trucks stand with the dumps; the Air Bases go further back.
  const plans = new Map<OobSide, SidePlan>();
  for (const side of ['ALLIED', 'AXIS'] as const) {
    const rng = createSeededRandom(mixUint32(deploymentSeed ^ (side === 'ALLIED' ? 0xa11ed : 0xa815)));
    // Field units fill the zone from the side's start line backwards, so the armies begin `standoff` Hexes behind the
    // split instead of at the map edges; Hexes nearer the front than the line come last, the deepest of them first.
    const line = standoff(side);
    const rankOf = (hexId: HexId): number => {
      const depth = depthOf(side, hexId);
      return depth >= line ? depth : 1_000 - depth;
    };
    const ranked = zones[side].map((hex) => ({
      hex,
      score: Math.round(rankOf(hex.id) * 2) * 10_000 + Math.floor(rng.next() * 10_000),
    })).sort((left, right) => left.score - right.score || String(left.hex.id).localeCompare(String(right.hex.id)));
    // Dense fallback: three slots per Hex, used only when the spread slots cannot take a unit.
    const denseSlots = ranked.flatMap(({ hex }) => [hex.id, hex.id, hex.id]);
    const units = allUnits(oob).filter((unit) => unit.side === side);
    const supplyUnits = units.filter(({ role, staging }) => role === 'SUPPLY' && staging !== 'AIR_BASE');
    const fieldUnits = units.filter(({ role, staging, arrivalTurn }) => role !== 'SUPPLY' && role !== 'AIR_BASE' && role !== 'AIRCRAFT' && staging !== 'AIR_BASE' && arrivalTurn === undefined);
    const groupOf = (unit: GeneratedOobUnit): string => groups.get(unit.id) ?? 'independent';
    const reinforcement = fieldUnits.find((unit) => groupOf(unit) === 'independent') ?? fieldUnits.at(-1);
    if (fieldUnits.length > denseSlots.length || sideSupply[side].length === 0) {
      return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit within its operational zone.`)] };
    }
    // Trace supply (12.3) starts at the side's map-edge sources and its detrainable rail Hexes (13.3c); a unit within
    // draw range of one, or adjacent to that range (12.3c), traces directly. Units start there where the map allows,
    // so the armies do not begin out of supply now that they stand forward. HQ throws can only add to this.
    // A detrainable Hex counts when the railroad joins it to the side's map edge without leaving the ground behind the side's
    // start line, which the side controls at the start (13.3h).
    const zone = new Set(zones[side].map(({ id }) => id));
    const railed = new Set(sideSupply[side]);
    const railQueue = [...railed];
    for (let head = 0; head < railQueue.length; head += 1) {
      for (const next of railNeighbors.get(railQueue[head]!) ?? []) {
        // Only rail the side will control at the start (behind its start line, 13.3h) carries trace supply.
        if (railed.has(next) || !zone.has(next) || depthOf(side, next) < line) continue;
        railed.add(next);
        railQueue.push(next);
      }
    }
    for (const hexId of railed) {
      if (!sideSupply[side].includes(hexId) && hexById.get(hexId)?.features.some(({ definitionId }) => DETRAINABLE_FEATURES.has(String(definitionId)))) supplyNodes[side].add(hexId);
    }
    const traceSources = [...sideSupply[side], ...[...railed]
      .filter((hexId) => hexById.get(hexId)?.features.some(({ definitionId }) => DETRAINABLE_FEATURES.has(String(definitionId))))];
    const traceReach = traceReachFrom(traceSources);
    // Inside a source's draw range is sure; a Hex only adjacent to it (12.3c) is at the margin, where the engine's own
    // trace can disagree, so units stand inside the range where the map allows.
    const traceCore = new Set(traceSources.flatMap((hexId) => [...supplyReachOf(hexId)]));
    const traceTier = (hexId: HexId): number => traceCore.has(hexId) ? 0 : traceReach.has(hexId) ? 1 : 2;

    // ── Sectors and main axes ──
    const hqUnits = fieldUnits.filter((unit) => unit.role === 'HQ' && unit.id !== reinforcement?.id);
    const sectorCount = Math.max(1, hqUnits.length);
    const frontBandIds = zones[side].map(({ id }) => id).filter((hexId) => depthOf(side, hexId) >= line && depthOf(side, hexId) < line + FRONT_BAND_HEXES);
    // The width that counts is the part of the front in trace supply, where the map has one.
    const tracedFront = frontBandIds.filter((hexId) => traceReach.has(hexId));
    const widthHexes = (tracedFront.length > 0 ? tracedFront : frontBandIds.length > 0 ? frontBandIds : zones[side].map(({ id }) => id)).map(lateral);
    const lateralLow = Math.min(...widthHexes);
    const sectorWidth = Math.max(1e-6, (Math.max(...widthHexes) - lateralLow) / sectorCount);
    const sectors = Array.from({ length: sectorCount }, (_, index) => ({
      low: lateralLow + index * sectorWidth, high: lateralLow + (index + 1) * sectorWidth, middle: lateralLow + (index + 0.5) * sectorWidth,
    }));
    const sectorOfHex = (hexId: HexId): number => Math.min(sectorCount - 1, Math.max(0, Math.floor((lateral(hexId) - lateralLow) / sectorWidth)));
    // A main axis is the road or railroad Hex on the start line that carries the most: rail first, then primary roads, then junctions.
    const axisWeight = (hexId: HexId): number => (railHexes.has(hexId) ? 4 : 0) + (primaryRoadHexes.has(hexId) ? 2 : 0) + (roadDegree.get(hexId) ?? 0);
    const axes = sectors.map((sector, index) => {
      const inSector = frontBandIds.filter((hexId) => sectorOfHex(hexId) === index);
      const tracedInSector = inSector.filter((hexId) => traceReach.has(hexId));
      // The axis runs through the middle half of its sector where a road or railroad does, so the HQ serves the whole
      // sector; in trace supply first.
      const central = (hexIds: readonly HexId[]) => hexIds.filter((hexId) => onNetwork(hexId) && Math.abs(lateral(hexId) - sector.middle) <= sectorWidth / 4);
      const pool = [central(tracedInSector), central(inSector), tracedInSector, inSector, zones[side].map(({ id }) => id)].find((entry) => entry.length > 0)!;
      return [...pool].sort((left, right) => axisWeight(right) - axisWeight(left)
        || Math.abs(lateral(left) - sector.middle) - Math.abs(lateral(right) - sector.middle)
        || depthOf(side, left) - depthOf(side, right) || String(left).localeCompare(String(right)))[0]!;
    });
    // Each HQ stands on its sector's axis just behind the line (13.1b), in trace supply and on the road net.
    const hqHexes: HexId[] = [];
    for (const [index, axis] of axes.entries()) {
      if (index >= hqUnits.length) break;
      // HQs stand apart (HQ_SPACING_HEXES where the front is wide enough) so each serves its own sector.
      const spacing = Math.min(HQ_SPACING_HEXES, Math.floor(sectorWidth));
      const pick = zones[side]
        .filter((hex) => hqHexes.every((other) => distance(other, hex.id) >= Math.max(1, spacing)) && canDeployOn(hex, 'truck')
          && depthOf(side, hex.id) >= line + HQ_BEHIND_LINE_HEXES && distance(hex.id, sideAnchors[side]) >= DUMP_MIN_DEPTH_HEXES)
        .map((hex) => ({
          hexId: hex.id,
          cost: distance(axis, hex.id) + traceTier(hex.id) * HQ_OUT_OF_TRACE_COST_HEXES * 5
            + (onNetwork(hex.id) ? 0 : HQ_OFF_ROAD_COST_HEXES) + (sectorOfHex(hex.id) === index ? 0 : HQ_OFF_NETWORK_COST_HEXES),
        }))
        .sort((left, right) => left.cost - right.cost || String(left.hexId).localeCompare(String(right.hexId)))[0];
      if (pick) hqHexes.push(pick.hexId);
    }

    // ── Sharing the units out between the sectors ──
    const sectorUnits = sectors.map(() => 0);
    const sectorMechanized = sectors.map(() => 0);
    const divisionKeys = [...new Set(fieldUnits.map(groupOf))].filter((key) => key !== 'independent');
    const divisions = divisionKeys.map((key) => {
      const members = fieldUnits.filter((unit) => groupOf(unit) === key);
      return { key, members, mechanized: MECHANIZED_ARCHETYPES.has(String(archetypeOf.get(key))) };
    }).sort((left, right) => Number(right.mechanized) - Number(left.mechanized) || right.members.length - left.members.length
      || left.key.localeCompare(right.key));
    const divisionSector = new Map<string, number>();
    for (const division of divisions) {
      const sector = sectors.map((_, index) => index).sort((left, right) => (division.mechanized ? sectorMechanized[left]! - sectorMechanized[right]! : 0)
        || sectorUnits[left]! - sectorUnits[right]! || left - right)[0]!;
      divisionSector.set(division.key, sector);
      sectorUnits[sector] = sectorUnits[sector]! + division.members.length;
      if (division.mechanized) sectorMechanized[sector] = sectorMechanized[sector]! + 1;
    }
    // Independent units (not HQs or trucks) go one by one, each role spread over the sectors before any sector gets two.
    const independents = fieldUnits.filter((unit) => groupOf(unit) === 'independent' && unit.id !== reinforcement?.id
      && unit.role !== 'HQ' && unit.role !== 'TRANSPORT')
      .sort((left, right) => INDEPENDENT_ROLE_ORDER.indexOf(left.role) - INDEPENDENT_ROLE_ORDER.indexOf(right.role) || left.id.localeCompare(right.id));
    const sectorRoles = sectors.map(() => new Map<string, number>());
    const independentSector = new Map<string, number>();
    for (const unit of independents) {
      const sector = sectors.map((_, index) => index).sort((left, right) => (sectorRoles[left]!.get(unit.role) ?? 0) - (sectorRoles[right]!.get(unit.role) ?? 0)
        || sectorUnits[left]! - sectorUnits[right]! || left - right)[0]!;
      independentSector.set(unit.id, sector);
      sectorRoles[sector]!.set(unit.role, (sectorRoles[sector]!.get(unit.role) ?? 0) + 1);
      sectorUnits[sector] = sectorUnits[sector]! + 1;
    }

    // ── Where each sector's units stand ──
    // Units near the front start in Combat Mode (user, 2026-10-09), so they have a ZOC (4.5) from the first turn; in an
    // attack the whole of the defender's line does: a prepared defence, not a march.
    const startsInCombatMode = (unit: GeneratedOobUnit, hexId: HexId): boolean => DEFENDER_COMBAT_ROLES.has(unit.role) && unit.role !== 'ENGINEER'
      && definitionById.get(unit.definitionId)?.faces.some(({ id }) => String(id) === 'combat') === true
      && ((attacker !== null && side !== attacker) || depthOf(side, hexId) < line + FRONT_COMBAT_MODE_HEXES);
    // A unit that starts in Move Mode with Truck MA pays full terrain cost off the road, so it starts on the road net where
    // it can (user, 2026-10-09); a front unit in Combat Mode holds its ground wherever it is.
    const wantsRoad = (unit: GeneratedOobUnit): boolean => {
      const definition = definitionById.get(unit.definitionId);
      return definition !== undefined && deployedMobility(definition) === 'truck';
    };
    const roadOk = (unit: GeneratedOobUnit, hexId: HexId): boolean => !wantsRoad(unit) || onNetwork(hexId) || startsInCombatMode(unit, hexId);
    const claimed = new Set<HexId>(hqHexes);
    const rankedIds = ranked.map(({ hex }) => hex.id);
    const behindLine = rankedIds.filter((hexId) => depthOf(side, hexId) >= line);
    // Division centres: on the start line, spread across their sector's width, in trace supply where the map allows.
    const centres: HexId[] = [];
    const divisionCentre = new Map<string, HexId>();
    for (const [index] of sectors.entries()) {
      const own = divisions.filter(({ key }) => divisionSector.get(key) === index);
      for (const [order, division] of own.entries()) {
        const target = sectors[index]!.low + (order + 0.5) * sectorWidth / own.length;
        // A division's centre is its first unit's Hex: a road Hex where that unit would stand in Move Mode with Truck MA.
        const first = division.members.find((unit) => unit.role !== 'HQ') ?? division.members[0];
        const score = (hexId: HexId): number => Math.abs(lateral(hexId) - target) + (depthOf(side, hexId) - line)
          + (first === undefined || roadOk(first, hexId) ? 0 : DIVISION_CENTRE_OFF_ROAD_COST_HEXES);
        let chosen: HexId | undefined;
        // In trace supply first, at the widest spacing it allows; only then out of trace.
        for (const worstTier of [0, 1, 2]) {
          for (const spacing of [GENERATED_FORMATION_SPACING_HEXES, 2, 1]) {
            chosen = (behindLine.length > 0 ? behindLine : rankedIds)
              .filter((hexId) => traceTier(hexId) <= worstTier && !claimed.has(hexId) && centres.every((other) => distance(other, hexId) >= spacing))
              .sort((left, right) => score(left) - score(right) || String(left).localeCompare(String(right)))[0];
            if (chosen !== undefined) break;
          }
          if (chosen !== undefined) break;
        }
        if (chosen === undefined) continue;
        centres.push(chosen);
        claimed.add(chosen);
        divisionCentre.set(division.key, chosen);
      }
    }
    // Each division takes its centre, then the nearest free Hexes around it, FIELD_UNITS_PER_HEX slots each. No Hex
    // belongs to two groups.
    const groupSlots = new Map<string, HexId[]>();
    for (const division of divisions) {
      const centre = divisionCentre.get(division.key);
      if (centre === undefined) continue;
      const hexes = [centre];
      // A division with Truck-MA units takes a road Hex over an off-road one a Hex nearer, so those in Move Mode can stand
      // on the road.
      const roadUnits = division.members.filter(wantsRoad);
      const nearby = behindLine
        .filter((hexId) => !claimed.has(hexId))
        .sort((left, right) => traceTier(left) - traceTier(right))
        .map((hexId, order) => ({ hexId, order, away: distance(hexId, centre) + (roadUnits.every((unit) => roadOk(unit, hexId)) ? 0 : 1) }))
        .filter(({ away }) => away <= 3)
        .sort((left, right) => left.away - right.away || left.order - right.order);
      for (const { hexId } of nearby) {
        if (hexes.length * FIELD_UNITS_PER_HEX >= division.members.length + 1) break;
        hexes.push(hexId);
        claimed.add(hexId);
      }
      groupSlots.set(division.key, hexes.flatMap((hexId) => Array<HexId>(FIELD_UNITS_PER_HEX).fill(hexId)));
    }
    // Units their group cannot take spill over to the nearest slots behind the start line, those in trace first;
    // Hexes in front of the line are the last resort.
    const tier = (hexId: HexId): number => (depthOf(side, hexId) >= line ? 0 : 3) + traceTier(hexId);
    const fallbackSlots = denseSlots.map((hexId, order) => ({ hexId, order }))
      .sort((left, right) => tier(left.hexId) - tier(right.hexId) || left.order - right.order).map(({ hexId }) => hexId);
    const usedReTicks = new Map<HexId, number>();
    const fieldPlacements: { unit: GeneratedOobUnit; hexId: HexId }[] = [];
    // In an attack, a unit with no room behind its side's start line waits off the map and arrives on Game Turn 2
    // (13.6) rather than starting next to the enemy; a crowded meeting engagement still fills toward the front.
    const heldBack = new Set<string>();
    const fitsFor = (unit: GeneratedOobUnit) => {
      const definition = definitionById.get(unit.definitionId);
      const unitReTicks = definition ? deployedReTicks(definition) : 0;
      return (hexId: HexId): boolean => (definition === undefined || canDeployOn(hexById.get(hexId)!, deployedMobility(definition)))
        && (usedReTicks.get(hexId) ?? 0) + unitReTicks <= GENERATED_STACKING_LIMIT_RE_TICKS;
    };
    const place = (unit: GeneratedOobUnit, hexId: HexId): void => {
      const definition = definitionById.get(unit.definitionId);
      usedReTicks.set(hexId, (usedReTicks.get(hexId) ?? 0) + (definition && unit.id !== reinforcement?.id ? deployedReTicks(definition) : 0));
      fieldPlacements.push({ unit, hexId });
    };
    const placeFallback = (unit: GeneratedOobUnit): boolean => {
      const fits = fitsFor(unit);
      // A Hex that still has room (FIELD_UNITS_PER_HEX) first, so a spilled unit does not pile onto another group.
      const roomy = fallbackSlots.findIndex((hexId) => fits(hexId) && !claimed.has(hexId)
        && fieldPlacements.filter((entry) => entry.hexId === hexId && entry.unit.id !== reinforcement?.id).length < FIELD_UNITS_PER_HEX);
      const fallbackIndex = roomy >= 0 ? roomy : fallbackSlots.findIndex(fits);
      if (attacker !== null && (fallbackIndex < 0 || depthOf(side, fallbackSlots[fallbackIndex]!) < line)) {
        heldBack.add(unit.id);
        fieldPlacements.push({ unit, hexId: sideSupply[side][0]! });
        return true;
      }
      if (fallbackIndex < 0) return false;
      place(unit, fallbackSlots.splice(fallbackIndex, 1)[0]!);
      return true;
    };
    if (reinforcement !== undefined) fieldPlacements.push({ unit: reinforcement, hexId: sideSupply[side][0]! });
    // HQs take their planned Hexes first: an HQ out of trace supply cannot throw it (12.3b).
    for (const [index, unit] of hqUnits.entries()) {
      const planned = hqHexes[index];
      if (planned !== undefined && fitsFor(unit)(planned)) place(unit, planned);
      else if (!placeFallback(unit)) return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
    }
    for (const division of divisions) {
      const slots = groupSlots.get(division.key) ?? [];
      // Truck-MA members choose first, and take the group's road Hexes where they fit.
      for (const unit of [...division.members].sort((left, right) => Number(wantsRoad(right)) - Number(wantsRoad(left)))) {
        const fits = fitsFor(unit);
        const onRoad = wantsRoad(unit) ? slots.findIndex((hexId) => roadOk(unit, hexId) && fits(hexId)) : -1;
        const index = onRoad >= 0 ? onRoad : slots.findIndex(fits);
        if (index >= 0) place(unit, slots.splice(index, 1)[0]!);
        else if (!placeFallback(unit)) return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
      }
    }
    // Independent units spread across their sector's width just behind the divisions (artillery a row further back), one
    // to a Hex where the map allows. Engineers go to the rear with the supply (phase 2).
    const independentHexes = new Set<HexId>();
    const engineers = independents.filter(({ role }) => role === 'ENGINEER').map((unit) => ({ unit, sector: independentSector.get(unit.id) ?? 0 }));
    for (const [index] of sectors.entries()) {
      const own = independents.filter(({ id, role }) => independentSector.get(id) === index && role !== 'ENGINEER');
      for (const [order, unit] of own.entries()) {
        const target = sectors[index]!.low + (order + 0.5) * sectorWidth / own.length;
        const targetDepth = line + (unit.role === 'ARTILLERY' ? 2 : 1);
        const fits = fitsFor(unit);
        const score = (hexId: HexId): number => Math.abs(lateral(hexId) - target) + Math.abs(depthOf(side, hexId) - targetDepth) + traceTier(hexId) * 100
          + (roadOk(unit, hexId) ? 0 : INDEPENDENT_OFF_ROAD_COST_HEXES);
        const chosen = behindLine.filter((hexId) => !claimed.has(hexId) && !independentHexes.has(hexId) && fits(hexId))
          .sort((left, right) => score(left) - score(right) || String(left).localeCompare(String(right)))[0];
        if (chosen !== undefined) {
          independentHexes.add(chosen);
          place(unit, chosen);
        } else if (!placeFallback(unit)) {
          return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
        }
      }
    }
    const combatModeIds = new Set(fieldPlacements.filter(({ unit, hexId }) => unit.id !== reinforcement?.id && !heldBack.has(unit.id)
      && startsInCombatMode(unit, hexId)).map(({ unit }) => unit.id));
    plans.set(side, {
      rng, line, units, supplyUnits, fieldUnits, reinforcement, heldBack, fieldPlacements, usedReTicks, fitsFor, place, placeFallback,
      sectors, sectorOfHex, hqHexes, traceReach, traceTier, traceSources, combatModeIds, roadOk, engineers,
    });
  }

  // A front in Combat Mode must not cut the other side's trace supply at the start (4.5a B: an enemy ZOC blocks supply
  // paths traced with Truck MP; a friendly combat unit in the Hex negates it, 4.5b). Where it would, the enemy unit whose
  // ZOC cuts the most starts in Move Mode instead, until every unit that traced without the ZOCs traces with them.
  const placedOf = (plan: SidePlan) => plan.fieldPlacements.filter(({ unit }) => unit.id !== plan.reinforcement?.id && !plan.heldBack.has(unit.id));
  for (const [side, enemySide] of [['ALLIED', 'AXIS'], ['AXIS', 'ALLIED']] as const) {
    const plan = plans.get(side)!;
    const enemy = plans.get(enemySide)!;
    const negated = new Set(placedOf(plan).filter(({ unit }) => DEFENDER_COMBAT_ROLES.has(unit.role)).map(({ hexId }) => hexId));
    const tracing = placedOf(plan).filter(({ hexId }) => plan.traceReach.has(hexId));
    const cutCount = (combat: ReadonlySet<string>): number => {
      const blocked = new Set(placedOf(enemy).filter(({ unit }) => combat.has(unit.id))
        .flatMap(({ hexId }) => [hexId, ...adjacentHexIds(hexId)]).filter((hexId) => !negated.has(hexId)));
      const reach = traceReachFrom(plan.traceSources, blocked);
      return tracing.filter(({ hexId }) => !reach.has(hexId)).length;
    };
    for (let cut = cutCount(enemy.combatModeIds); cut > 0;) {
      const options = [...enemy.combatModeIds].sort().map((id) => {
        const without = new Set(enemy.combatModeIds);
        without.delete(id);
        return { id, cut: cutCount(without) };
      }).sort((left, right) => left.cut - right.cut);
      const best = options[0];
      if (best === undefined || best.cut >= cut) break;
      enemy.combatModeIds.delete(best.id);
      cut = best.cut;
    }
  }

  // ── Phase 2: supply, trucks and Air Bases, each side out of the other's first-move reach ──
  for (const side of ['ALLIED', 'AXIS'] as const) {
    const plan = plans.get(side)!;
    const enemy = plans.get(side === 'ALLIED' ? 'AXIS' : 'ALLIED')!;
    const { rng, line, units, supplyUnits, fieldUnits, reinforcement, heldBack, fieldPlacements, usedReTicks, fitsFor, place, placeFallback, sectors, sectorOfHex, hqHexes, traceReach, traceTier } = plan;
    const onMap = (entry: { unit: GeneratedOobUnit }): boolean => entry.unit.id !== reinforcement?.id && !heldBack.has(entry.unit.id);
    // Hexes the enemy's combat units could enter in their first Movement Segment (switching to Move Mode first): a Hex
    // holding this side's units cannot be entered without combat; a Truck mover stops on entering a ZOC (4.5a).
    const held = new Set(fieldPlacements.filter(onMap).map(({ hexId }) => hexId));
    const zoc = new Set(fieldPlacements.filter((entry) => onMap(entry) && plan.combatModeIds.has(entry.unit.id))
      .flatMap(({ hexId }) => [hexId, ...adjacentHexIds(hexId)]));
    const threatened = new Set<HexId>();
    for (const { unit, hexId } of enemy.fieldPlacements) {
      if (!DEFENDER_COMBAT_ROLES.has(unit.role) || unit.id === enemy.reinforcement?.id || enemy.heldBack.has(unit.id)) continue;
      const definition = definitionById.get(unit.definitionId);
      const mobility = definition ? deployedMobility(definition) : null;
      if (!definition || mobility === null) continue;
      for (const reached of firstMoveReach(costModelOf(mobility), hexId, deployedMovementTicks(definition), held, mobility === 'truck' ? zoc : new Set())) threatened.add(reached);
    }
    // Supply dumps: shared between the sectors by their units, each where it covers the most of its sector's units by draw
    // (12.5: Truck and Track units are fuelled from a dump in range), never in front of the line, apart from the other dumps.
    const sectorCounts = sectors.map((_, index) => fieldPlacements.filter((entry) => onMap(entry) && sectorOfHex(entry.hexId) === index).length);
    const dumpsPerSector = sectors.map(() => 0);
    const dumpHexes: HexId[] = [];
    // Draw from a dump is a Truck-MP path, which the enemy's starting ZOC blocks unless a friendly combat unit negates it (4.5a B, 4.5b).
    const negated = new Set(fieldPlacements.filter((entry) => onMap(entry) && DEFENDER_COMBAT_ROLES.has(entry.unit.role)).map(({ hexId }) => hexId));
    const enemyZoc = new Set(enemy.fieldPlacements.filter(({ unit }) => enemy.combatModeIds.has(unit.id) && unit.id !== enemy.reinforcement?.id && !enemy.heldBack.has(unit.id))
      .flatMap(({ hexId }) => [hexId, ...adjacentHexIds(hexId)]).filter((hexId) => !negated.has(hexId)));
    const drawCache = new Map<HexId, ReadonlySet<HexId>>();
    const drawReachOf = (hexId: HexId): ReadonlySet<HexId> => {
      let reach = drawCache.get(hexId);
      if (!reach) { reach = supplyReach(truckModel, hexId, enemyZoc); drawCache.set(hexId, reach); }
      return reach;
    };
    // Each dump first covers the units no earlier dump reaches (a greedy cover), its own sector's a little ahead of the rest.
    const covered = new Set<string>();
    for (const _ of supplyUnits) {
      const sector = sectors.map((__, index) => index)
        .sort((left, right) => sectorCounts[right]! / (dumpsPerSector[right]! + 1) - sectorCounts[left]! / (dumpsPerSector[left]! + 1) || left - right)[0]!;
      dumpsPerSector[sector] = dumpsPerSector[sector]! + 1;
      const served = fieldPlacements.filter((entry) => onMap(entry) && entry.unit.role !== 'TRANSPORT');
      const coverage = (hexId: HexId): number => {
        const reach = drawReachOf(hexId);
        return served.reduce((sum, entry) => sum + (!reach.has(entry.hexId) ? 0
          // An HQ counts thrice: it fuels the units around it (12.5e) but must be fuelled from a dump itself.
          : ((covered.has(entry.unit.id) ? 0.1 : 1) + (sectorOfHex(entry.hexId) === sector ? 0.25 : 0)) * (entry.unit.role === 'HQ' ? 3 : 1)), 0);
      };
      const candidates = zones[side]
        .filter((hex) => canDeployOn(hex, 'truck') && depthOf(side, hex.id) >= line && distance(hex.id, sideAnchors[side]) >= DUMP_MIN_DEPTH_HEXES)
        .map((hex) => hex.id);
      let chosen: HexId | undefined;
      // A dump stands on the road net (a road or railroad Hex) wherever a safe one exists: its trucks load and move from it.
      // Only a map with no safe road Hex left lets it go off the net, and only then into the enemy's first-move reach.
      const tiers = [true, false].flatMap((safeOnly) => [true, false].flatMap((netOnly) =>
        (safeOnly ? [DUMP_SPACING_HEXES, 2, 1] : [2, 1]).map((spacing) => [safeOnly, netOnly, spacing] as const)));
      for (const [safeOnly, netOnly, spacing] of tiers) {
        const open = candidates.filter((hexId) => (!safeOnly || !threatened.has(hexId)) && (!netOnly || onNetwork(hexId))
          && dumpHexes.every((used) => distance(used, hexId) >= spacing));
        if (open.length === 0) continue;
        // An HQ of this sector that no dump fuels yet must be in this one's draw range, where any candidate allows it.
        const unfuelledHqs = served.filter((entry) => entry.unit.role === 'HQ' && !covered.has(entry.unit.id) && sectorOfHex(entry.hexId) === sector);
        const fuellingHq = open.filter((hexId) => unfuelledHqs.every((entry) => drawReachOf(hexId).has(entry.hexId)));
        const pool = fuellingHq.length > 0 ? fuellingHq : open;
        const scored = pool.map((hexId) => ({
          hexId,
          score: coverage(hexId) * 10 + (traceReach.has(hexId) ? 1 : 0)
            - Math.abs(lateral(hexId) - sectors[sector]!.middle) * 0.5,
        }));
        chosen = scored.sort((left, right) => right.score - left.score || String(left.hexId).localeCompare(String(right.hexId)))[0]!.hexId;
        if (!safeOnly) planWarnings.push(`A ${side} supply dump at ${chosen} can be reached by the enemy's first move.`);
        break;
      }
      dumpHexes.push(chosen ?? sideSupply[side][0]!);
      const reach = drawReachOf(dumpHexes.at(-1)!);
      for (const entry of served) if (reach.has(entry.hexId)) covered.add(entry.unit.id);
    }
    // A Truck or Track unit no dump can fuel (12.5) moves to the nearest Hex one can, still behind the line and in trace
    // where possible; only independent units move, a division keeps its ground.
    const dumpReach = new Set(dumpHexes.flatMap((hexId) => [...drawReachOf(hexId)]));
    // Units moved or placed now go where a Hex has room (FIELD_UNITS_PER_HEX), so stacks stay small.
    const full = (hexId: HexId): boolean => fieldPlacements.filter((entry) => onMap(entry) && entry.hexId === hexId).length >= FIELD_UNITS_PER_HEX;
    for (const entry of fieldPlacements) {
      const definition = definitionById.get(entry.unit.definitionId);
      if (!onMap(entry) || !definition || groups.get(entry.unit.id) !== undefined || entry.unit.role === 'HQ' || entry.unit.role === 'TRANSPORT'
        || deployedMobility(definition) === 'leg' || dumpReach.has(entry.hexId)) continue;
      const unitReTicks = deployedReTicks(definition);
      usedReTicks.set(entry.hexId, (usedReTicks.get(entry.hexId) ?? 0) - unitReTicks);
      const fits = fitsFor(entry.unit);
      const from = entry.hexId;
      const target = zones[side].map(({ id }) => id)
        .filter((hexId) => dumpReach.has(hexId) && depthOf(side, hexId) >= line && fits(hexId))
        .sort((left, right) => Number(full(left)) - Number(full(right))
          || traceTier(left) * 100 - traceTier(right) * 100 + distance(from, left) - distance(from, right)
            + (Number(!plan.roadOk(entry.unit, left)) - Number(!plan.roadOk(entry.unit, right))) * INDEPENDENT_OFF_ROAD_COST_HEXES
          || String(left).localeCompare(String(right)))[0];
      entry.hexId = target ?? from;
      usedReTicks.set(entry.hexId, (usedReTicks.get(entry.hexId) ?? 0) + unitReTicks);
    }
    // Trucks stand next to the dumps they will carry from, out of the enemy's first-move reach where the map allows (they
    // can be captured too, 9.14c), and on the road net near the dump (within TRUCK_ROAD_SEARCH_HEXES): off the road a truck
    // pays full terrain cost. It stands on the dump itself only when no other safe road Hex is near (the dump is on the net).
    const trucks = fieldUnits.filter((unit) => unit.role === 'TRANSPORT' && unit.id !== reinforcement?.id && groups.get(unit.id) === undefined);
    const truckRoadHex = (hexId: HexId, dump: HexId): boolean => onNetwork(hexId) && distance(hexId, dump) <= TRUCK_ROAD_SEARCH_HEXES;
    for (const [index, unit] of trucks.entries()) {
      const dump = dumpHexes[index % Math.max(1, dumpHexes.length)];
      const fits = fitsFor(unit);
      const hexId = dump === undefined ? undefined : zones[side].map(({ id }) => id)
        .filter((candidate) => (candidate === dump || !dumpHexes.includes(candidate)) && fits(candidate) && depthOf(side, candidate) >= line)
        .sort((left, right) => Number(full(left)) - Number(full(right)) || Number(threatened.has(left)) - Number(threatened.has(right))
          || Number(!truckRoadHex(left, dump)) - Number(!truckRoadHex(right, dump)) || Number(left === dump) - Number(right === dump)
          || traceTier(left) - traceTier(right) || distance(left, dump) - distance(right, dump) || String(left).localeCompare(String(right)))[0];
      if (hexId !== undefined) place(unit, hexId);
      else if (!placeFallback(unit)) return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
    }
    // Engineers stand by their sector's HQ (within ENGINEER_HQ_RADIUS_HEXES: a safe Hex across the map is no use), out of the
    // enemy's first-move reach, in a Hex with room (or the HQ's own: an engineer with its HQ is no blob), on the road, behind
    // the front band (ENGINEER_BEHIND_LINE_HEXES) and where a dump fuels them, in that order, so they can reach a
    // construction site with the SP to pay for it (13.8d).
    for (const { unit, sector } of plan.engineers) {
      const anchor = hqHexes[sector] ?? dumpHexes[0];
      const fits = fitsFor(unit);
      const hexId = anchor === undefined ? undefined : zones[side].map(({ id }) => id)
        .filter((candidate) => fits(candidate) && depthOf(side, candidate) >= line)
        .map((candidate) => ({ candidate, keys: [
          Number(distance(candidate, anchor) > ENGINEER_HQ_RADIUS_HEXES), Number(threatened.has(candidate)), Number(candidate !== anchor && full(candidate)),
          Number(!onNetwork(candidate)), Number(depthOf(side, candidate) < line + ENGINEER_BEHIND_LINE_HEXES),
          Number(!dumpReach.has(candidate)), traceTier(candidate), distance(candidate, anchor)] }))
        .sort((left, right) => left.keys.reduce((order, key, index) => order || key - right.keys[index]!, 0)
          || String(left.candidate).localeCompare(String(right.candidate)))[0]?.candidate;
      if (hexId !== undefined) place(unit, hexId);
      else if (!placeFallback(unit)) return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
    }
    const supplyAnchor = dumpHexes[0] ?? sideSupply[side][0]!;
    const airBases = units.filter(({ role, staging }) => role === 'AIR_BASE' && staging === undefined);
    const aircraft = units.filter(({ role, arrivalTurn, staging }) => role === 'AIRCRAFT' && arrivalTurn === undefined && staging === undefined);
    // The off-map airfield and its aircraft are in the side's off-map airfield box, not on the map (§6).
    const offMapAir = units.filter(({ staging }) => staging === 'OFF_MAP_AIRFIELD');
    // 13.6: reinforcing aircraft wait in the side's reinforcement box and arrive Active on their Game Turn.
    const arrivingAircraft = units.filter(({ role, arrivalTurn }) => role === 'AIRCRAFT' && arrivalTurn !== undefined);
    const stagedUnits = units.filter(({ staging }) => staging === 'AIR_BASE');
    // 13.6: ground units with an arrival turn (later trucks, OOB 0.5.0) wait in the reinforcement box for it.
    const arrivingGround = units.filter(({ role, arrivalTurn }) => role !== 'AIRCRAFT' && arrivalTurn !== undefined);
    // Air Bases (15.0): in the rear, on the road net, at least AIR_BASE_SPACING_HEXES apart, clear of the dumps, HQs and
    // troops, out of the enemy's first-move reach, as near the first dump as that allows so refit SP can reach them.
    const rearArea = [...dumpHexes, ...hqHexes];
    const occupied = new Set(fieldPlacements.filter(onMap).map(({ hexId }) => hexId));
    const baseCandidates = zones[side]
      .filter((hex) => canDeployOn(hex, 'truck') && !occupied.has(hex.id) && rearArea.every((used) => distance(used, hex.id) >= REAR_AREA_CLEARANCE_HEXES))
      .map((hex) => ({
        hex,
        score: (depthOf(side, hex.id) >= line + AIR_BASE_BEHIND_LINE_HEXES ? 0 : 4_000_000) + (threatened.has(hex.id) ? 2_000_000 : 0)
          + (onNetwork(hex.id) ? 0 : 1_000_000) + distance(hex.id, supplyAnchor) * 10_000 + Math.floor(rng.next() * 10_000),
      }))
      .sort((left, right) => left.score - right.score || String(left.hex.id).localeCompare(String(right.hex.id)));
    const baseHexes: HexId[] = [];
    for (const _ of airBases) {
      const chosen = baseCandidates.find(({ hex }) => baseHexes.every((used) => distance(used, hex.id) >= AIR_BASE_SPACING_HEXES));
      if (!chosen) return { ok: false, error: [deploymentFailure(`Map has no room for every ${side} Air Base in the rear.`)] };
      baseHexes.push(chosen.hex.id);
    }
    const placements = [
      ...supplyUnits.map((unit, index) => ({ unit, hexId: dumpHexes[index % dumpHexes.length]! })),
      ...fieldPlacements,
    ];
    // Aircraft begin Active (IV-E) and are spread over the bases within each base's 4 + Level limit (14.2a).
    const baseLevels = airBases.map((unit) => initialAirBaseLevel(definitionById.get(unit.definitionId)!) ?? 1);
    const activeCounts = airBases.map(() => 0);
    const aircraftPlacements: { unit: (typeof aircraft)[number]; hexId: HexId }[] = [];
    for (const [index, unit] of aircraft.entries()) {
      const order = airBases.map((_, offset) => (index + offset) % airBases.length);
      const baseIndex = order.find((candidate) => activeCounts[candidate]! < 4 + baseLevels[candidate]!);
      if (baseIndex === undefined) return { ok: false, error: [deploymentFailure(`${side} Air Bases cannot hold every aircraft Active.`)] };
      activeCounts[baseIndex] = activeCounts[baseIndex]! + 1;
      aircraftPlacements.push({ unit, hexId: baseHexes[baseIndex]! });
    }
    placements.push(
      ...airBases.map((unit, index) => ({ unit, hexId: baseHexes[index]! })),
      ...aircraftPlacements,
      // Paratroops wait at the first Air Base (14.9c); without an Air Base they deploy as ordinary field units would not, so the map must have one.
      ...stagedUnits.flatMap((unit) => baseHexes[0] === undefined ? [] : [{ unit, hexId: baseHexes[0] }]),
    );
    for (const [order, unit] of offMapAir.entries()) {
      const definition = definitionById.get(unit.definitionId);
      const parsedId = parsePieceId(unit.id);
      if (!definition || !parsedId.ok) return { ok: false, error: [deploymentFailure(`OOB unit ${unit.id} cannot be converted to runtime state.`)] };
      pieces.push({
        id: parsedId.value, definitionId: unit.definitionId, ownerId: sidePlayer(side, players),
        location: { kind: 'OFF_MAP_BOX', boxId: GENERATED_OFF_MAP_AIRFIELD_BOXES[side] },
        currentFaceId: deployedFace(definition)?.id ?? null, remainingSteps: fullStrength(definition), mode: null,
        // The airfield keeps a Level like any Air Base (15.0b); its aircraft start Active (IV-E).
        statuses: unit.role === 'AIR_BASE'
          ? [{ statusDefinitionId: 'status:air-base-level' as never, value: { kind: 'INTEGER', value: initialAirBaseLevel(definition) ?? 1 } }] : [],
        stackOrder: order, resourceQuantity: null,
      });
    }
    for (const [arrivalIndex, unit] of arrivingAircraft.entries()) {
      const definition = definitionById.get(unit.definitionId);
      const parsedId = parsePieceId(unit.id);
      if (!definition || !parsedId.ok) return { ok: false, error: [deploymentFailure(`OOB unit ${unit.id} cannot be converted to runtime state.`)] };
      pieces.push({
        id: parsedId.value, definitionId: unit.definitionId, ownerId: sidePlayer(side, players),
        location: { kind: 'OFF_MAP_BOX', boxId: GENERATED_REINFORCEMENT_BOXES[side] },
        currentFaceId: deployedFace(definition)?.id ?? null, remainingSteps: fullStrength(definition), mode: null,
        statuses: [{ statusDefinitionId: 'status:return-turn' as never, value: { kind: 'INTEGER', value: unit.arrivalTurn! } }],
        // Order 0 in the box belongs to the reinforcing ground unit; each arriving aircraft takes the next order.
        stackOrder: 1 + arrivalIndex, resourceQuantity: null,
      });
    }
    for (const [arrivalIndex, unit] of arrivingGround.entries()) {
      const definition = definitionById.get(unit.definitionId);
      const parsedId = parsePieceId(unit.id);
      if (!definition || !parsedId.ok) return { ok: false, error: [deploymentFailure(`OOB unit ${unit.id} cannot be converted to runtime state.`)] };
      pieces.push({
        id: parsedId.value, definitionId: unit.definitionId, ownerId: sidePlayer(side, players),
        location: { kind: 'OFF_MAP_BOX', boxId: GENERATED_REINFORCEMENT_BOXES[side] },
        currentFaceId: deployedFace(definition)?.id ?? null, remainingSteps: fullStrength(definition), mode: definition.family === 'GROUND' ? 'MOVE' : null,
        statuses: [{ statusDefinitionId: 'status:return-turn' as never, value: { kind: 'INTEGER', value: unit.arrivalTurn! } }],
        // After the held-back unit, the arriving aircraft and the units with no room.
        stackOrder: 1 + arrivingAircraft.length + fieldUnits.length + arrivalIndex, resourceQuantity: null,
      });
    }
    for (const { unit, hexId } of placements) {
      const definition = definitionById.get(unit.definitionId);
      const parsedId = parsePieceId(unit.id);
      if (!definition || !parsedId.ok) {
        return { ok: false, error: [deploymentFailure(`OOB unit ${unit.id} cannot be converted to runtime state.`)] };
      }
      const awaitingReinforcement = unit.id === reinforcement?.id || heldBack.has(unit.id);
      // Order 0 in the box is the held-back reinforcement, then the arriving aircraft, then units with no room.
      const boxOrder = unit.id === reinforcement?.id ? 0 : 1 + arrivingAircraft.length + [...heldBack].indexOf(unit.id);
      // Line units near the front (and a defender's whole line) start in Combat Mode, on their Combat face (phase 1).
      const combatFace = definition.faces.find(({ id }) => String(id) === 'combat');
      const holdsLine = !awaitingReinforcement && combatFace !== undefined && plan.combatModeIds.has(unit.id);
      const stackOrder = awaitingReinforcement ? boxOrder : stackCounts.get(hexId) ?? 0;
      if (!awaitingReinforcement) stackCounts.set(hexId, stackOrder + 1);
      pieces.push({
        id: parsedId.value,
        definitionId: unit.definitionId,
        ownerId: sidePlayer(side, players),
        location: awaitingReinforcement
          ? { kind: 'OFF_MAP_BOX', boxId: GENERATED_REINFORCEMENT_BOXES[side] }
          : { kind: 'ON_MAP', hexId },
        currentFaceId: holdsLine ? combatFace.id : deployedFace(definition)?.id ?? null,
        remainingSteps: fullStrength(definition),
        mode: definition.family !== 'GROUND' ? null : holdsLine ? 'COMBAT' : 'MOVE',
        statuses: unit.role === 'AIR_BASE'
          ? [{ statusDefinitionId: 'status:air-base-level' as never, value: { kind: 'INTEGER', value: initialAirBaseLevel(definition) ?? 1 } }]
          // 13.6: the held-back units are reinforcements for Game Turn 2; Game Turn 1 has no arrivals.
          : awaitingReinforcement
            ? [{ statusDefinitionId: 'status:return-turn' as never, value: { kind: 'INTEGER', value: FIRST_ARRIVAL_TURN } }]
            : [],
        stackOrder,
        resourceQuantity: definition.resource?.printedQuantity ?? null,
      });
      if (unit.formationId !== null) {
        relations.push({ kind: 'FORMATION_MEMBERSHIP', memberId: parsedId.value, formationDefinitionId: unit.formationId });
      }
    }
  }

  const controlled = [
    ...new Set([...map.strategicRegions.firstEntryHexIds, ...map.strategicRegions.firstSupplyHexIds]),
  ].map((hexId) => ({ hexId, controllerId: players.ALLIED })).concat(
    [...new Set([...map.strategicRegions.secondEntryHexIds, ...map.strategicRegions.secondSupplyHexIds])]
      .filter((hexId) => !map.strategicRegions.firstEntryHexIds.includes(hexId)
        && !map.strategicRegions.firstSupplyHexIds.includes(hexId))
      .map((hexId) => ({ hexId, controllerId: players.AXIS })),
  );
  // 13.3h: initial control follows the front line. A Hex's depth is its distance from the side's own map
  // edge (its nearest entry or supply Hex); the side's front is the depth of its most forward deployed piece.
  // A side controls every land Hex of its zone up to that front (railroads, objectives and open country
  // alike); the ground between the two fronts starts neutral, railroads included.
  const allied = new Set(zones.ALLIED.map(({ id }) => id));
  const { objectives, warnings: objectiveWarnings } = selectObjectives(
    map,
    (hexId) => portOwner.get(hexId) ?? (allied.has(hexId) ? 'ALLIED' : 'AXIS'),
    (hexId) => Math.abs(lean(hexId) - split),
    { ALLIED: zones.ALLIED.length, AXIS: zones.AXIS.length },
    seaArrivalSides.length > 0,
    attacker === null ? null : attacker === 'ALLIED' ? 'AXIS' : 'ALLIED',
  );
  const seeded = new Set(controlled.map(({ hexId }) => hexId));
  // OOB 0.4.0: one objective garrison (1-1-0, MA 0) on every objective a side holds, in Combat Mode so it exerts a ZOC
  // (4.4b): no objective can be taken by simply walking into it.
  const garrisonPiece = (side: OobSide, hexId: HexId, pieceId: string): PieceState | null => {
    const garrisonDefinitionId = oob.sides.find((entry) => entry.side === side)?.garrisonDefinitionId;
    const definition = garrisonDefinitionId === undefined ? undefined : definitionById.get(garrisonDefinitionId);
    const parsedId = parsePieceId(`${garrisonDefinitionId}:${pieceId}`);
    if (!definition || !parsedId.ok) return null;
    const stackOrder = stackCounts.get(hexId) ?? 0;
    stackCounts.set(hexId, stackOrder + 1);
    return {
      id: parsedId.value, definitionId: definition.id, ownerId: sidePlayer(side, players),
      location: { kind: 'ON_MAP', hexId },
      currentFaceId: definition.faces.find(({ id }) => String(id) === 'combat')?.id ?? definition.faces[0]?.id ?? null,
      remainingSteps: fullStrength(definition), mode: 'COMBAT', statuses: [], stackOrder, resourceQuantity: null,
    };
  };
  // Stock candidates only: composition checks actual trace supply and retains just isolated VP stocks,
  // deducting them from the existing supply budget. Key-point stocks are discarded.
  const garrisonStock = (side: OobSide, hexId: HexId, pieceId: string): PieceState | null => {
    const dumpDefinitionId = oob.sides.find((entry) => entry.side === side)?.independentUnits.find(({ role, staging }) => role === 'SUPPLY' && staging === undefined)?.definitionId;
    const dumpDefinition = dumpDefinitionId === undefined ? undefined : definitionById.get(dumpDefinitionId);
    const parsedId = parsePieceId(`${dumpDefinitionId}:${pieceId}`);
    if (!dumpDefinition || !parsedId.ok) return null;
    const stackOrder = stackCounts.get(hexId) ?? 0;
    stackCounts.set(hexId, stackOrder + 1);
    return {
      id: parsedId.value, definitionId: dumpDefinition.id, ownerId: sidePlayer(side, players), location: { kind: 'ON_MAP', hexId },
      currentFaceId: deployedFace(dumpDefinition)?.id ?? null, remainingSteps: fullStrength(dumpDefinition), mode: null, statuses: [],
      stackOrder, resourceQuantity: GENERATED_GARRISON_STOCK_TOKENS,
    };
  };
  // 16.0: the defender's field works in an attack; the hedgehog is the top ground counter of its hex (4.8bF).
  const hedgehogDefinitionIds = new Set(oob.pieceDefinitionCatalog.definitions.filter(({ facility }) => facility?.facilityTypeDefinitionId === 'facility:hedgehog').map(({ id }) => id));
  const hedgehogPiece = (side: OobSide, hexId: HexId, pieceId: string, level: number): PieceState | null => {
    const definition = oob.pieceDefinitionCatalog.definitions.find((candidate) => hedgehogDefinitionIds.has(candidate.id)
      && candidate.ownership.sideDefinitionId === `side:${side.toLowerCase()}`);
    const parsedId = parsePieceId(`${definition?.id}:${pieceId}`);
    if (!definition || !parsedId.ok) return null;
    const stackOrder = stackCounts.get(hexId) ?? 0;
    stackCounts.set(hexId, stackOrder + 1);
    return {
      id: parsedId.value, definitionId: definition.id, ownerId: sidePlayer(side, players), location: { kind: 'ON_MAP', hexId },
      currentFaceId: null, remainingSteps: null, mode: null, stackOrder, resourceQuantity: null,
      statuses: [{ statusDefinitionId: 'status:hedgehog-level' as never, value: { kind: 'INTEGER', value: level } }],
    };
  };
  for (const [index, { hexId, side }] of objectives.entries()) {
    const garrison = garrisonPiece(side, hexId as HexId, `objective-${index + 1}`);
    const stock = garrisonStock(side, hexId as HexId, `objective-stock-${index + 1}`);
    if (!garrison || !stock) return { ok: false, error: [deploymentFailure(`Objective ${hexId} cannot receive its ${side} garrison.`)] };
    pieces.push(garrison, stock);
    if (attacker !== null && side !== attacker) {
      const hog = hedgehogPiece(side, hexId as HexId, `objective-hog-${index + 1}`, GENERATED_HEDGEHOG_LEVELS.OBJECTIVE);
      if (!hog) return { ok: false, error: [deploymentFailure(`Objective ${hexId} cannot receive its ${side} hedgehog.`)] };
      pieces.push(hog);
    }
  }
  // In an attack the defender also garrisons key points that score no VP (user, 2026-10-07): supply nodes (rail towns
  // its railroad joins to its map edge, 13.3c) first, then road junctions; one garrison per hex, behind its start line,
  // nearest the front first, apart from each other and from the objectives.
  if (attacker !== null) {
    const defender: OobSide = attacker === 'ALLIED' ? 'AXIS' : 'ALLIED';
    const objectiveHexes = new Set(objectives.map(({ hexId }) => hexId as HexId));
    const edge = new Set([...sideSupply.ALLIED, ...sideSupply.AXIS]);
    const occupiedByEnemy = new Set(pieces.filter((piece) => piece.ownerId !== players[defender] && piece.location.kind === 'ON_MAP')
      .map((piece) => piece.location.kind === 'ON_MAP' ? piece.location.hexId : null));
    const candidates = zones[defender]
      .map(({ id }) => id)
      .filter((hexId) => !objectiveHexes.has(hexId) && !edge.has(hexId) && !occupiedByEnemy.has(hexId)
        && depthOf(defender, hexId) >= GENERATED_FRONT_STANDOFF_HEXES.DEFENDER
        && (supplyNodes[defender].has(hexId) || (roadDegree.get(hexId) ?? 0) >= GENERATED_ROAD_JUNCTION_DEGREE))
      .sort((left, right) => Number(supplyNodes[defender].has(right)) - Number(supplyNodes[defender].has(left))
        || depthOf(defender, left) - depthOf(defender, right) || String(left).localeCompare(String(right)));
    const wanted = Math.ceil(objectives.length * GENERATED_KEY_POINT_GARRISON_SHARE);
    const chosen: HexId[] = [];
    for (const hexId of candidates) {
      if (chosen.length >= wanted) break;
      if ([...chosen, ...objectiveHexes].some((other) => distance(other, hexId) < GENERATED_KEY_POINT_SPACING_HEXES)) continue;
      chosen.push(hexId);
    }
    for (const [index, hexId] of chosen.entries()) {
      const garrison = garrisonPiece(defender, hexId, `key-point-${index + 1}`);
      const stock = garrisonStock(defender, hexId, `key-point-stock-${index + 1}`);
      const hog = hedgehogPiece(defender, hexId, `key-point-hog-${index + 1}`, GENERATED_HEDGEHOG_LEVELS.KEY_POINT);
      if (!garrison || !stock || !hog) return { ok: false, error: [deploymentFailure(`Key point ${hexId} cannot receive its ${defender} garrison.`)] };
      pieces.push(garrison, stock, hog);
    }
  }
  const edgeHexes: Readonly<Record<OobSide, readonly HexId[]>> = {
    ALLIED: [...map.strategicRegions.firstEntryHexIds, ...map.strategicRegions.firstSupplyHexIds],
    AXIS: [...map.strategicRegions.secondEntryHexIds, ...map.strategicRegions.secondSupplyHexIds],
  };
  const depth = (side: OobSide, hexId: HexId): number => Math.min(...edgeHexes[side].map((edge) => distance(hexId, edge)));
  // The front is where the field army stands: garrisons (objectives, key points) and their stocks hold only their own
  // hex (13.3h: a combat unit in a hex controls it), so the ground between the armies stays neutral.
  const garrisonIds = new Set(oob.sides.map(({ garrisonDefinitionId }) => garrisonDefinitionId));
  const holdsOwnHex = (piece: PieceState): boolean => garrisonIds.has(piece.definitionId) || hedgehogDefinitionIds.has(piece.definitionId)
    || String(piece.id).includes('-stock-');
  const frontOf = (side: OobSide): number => Math.max(-Infinity, ...pieces.flatMap((piece) =>
    piece.ownerId === players[side] && piece.location.kind === 'ON_MAP' && !holdsOwnHex(piece) ? [depth(side, piece.location.hexId)] : []));
  const fronts: Readonly<Record<OobSide, number>> = { ALLIED: frontOf('ALLIED'), AXIS: frontOf('AXIS') };
  const garrisoned = new Map(pieces.flatMap((piece) => holdsOwnHex(piece) && piece.location.kind === 'ON_MAP' ? [[piece.location.hexId, piece.ownerId] as const] : []));
  const zoneControl = (['ALLIED', 'AXIS'] as const).flatMap((side) => zones[side]
    // Everything behind the side's own start line is its rear area and its own too, whatever its distance from the edge.
    .filter(({ id }) => !seeded.has(id) && (depth(side, id) <= fronts[side] || depthOf(side, id) >= standoff(side) || garrisoned.get(id) === players[side]))
    .map(({ id }) => ({ hexId: id, controllerId: players[side] })));
  // 13.3h "use common sense": a garrisoned station ahead of its army is held, and so is the railroad back to the ground
  // the side controls. The stations on the shortest rail path (inside the side's zone) from each garrisoned station to
  // that ground start under the side's control too, so the garrison is not cut off by a neutral station behind it.
  const behindGarrisons = (['ALLIED', 'AXIS'] as const).flatMap((side) => {
    const owner = players[side];
    const held = new Set([...controlled, ...zoneControl].filter(({ controllerId }) => controllerId === owner).map(({ hexId }) => hexId));
    const zone = new Set(zones[side].map(({ id }) => id));
    const isStation = (hexId: HexId): boolean => hexById.get(hexId)?.features.some(({ definitionId }) => DETRAINABLE_FEATURES.has(String(definitionId))) ?? false;
    const added = new Set<HexId>();
    for (const [start, garrisonOwner] of garrisoned) {
      if (garrisonOwner !== owner || !railNeighbors.has(start)) continue;
      const parent = new Map<HexId, HexId | null>([[start, null]]);
      const queue: HexId[] = [start];
      let reached: HexId | null = null;
      for (let head = 0; head < queue.length && reached === null; head += 1) {
        for (const next of railNeighbors.get(queue[head]!) ?? []) {
          if (parent.has(next) || !zone.has(next)) continue;
          parent.set(next, queue[head]!);
          if (held.has(next)) { reached = next; break; }
          queue.push(next);
        }
      }
      for (let at = reached; at !== null; at = parent.get(at) ?? null) if (!held.has(at) && isStation(at)) added.add(at);
    }
    return [...added].map((hexId) => ({ hexId, controllerId: owner }));
  });
  const initialMapState: MapState = {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    hexControl: [...new Map([...controlled, ...zoneControl, ...behindGarrisons, ...[...portOwner].map(([hexId, owner]) => ({ hexId, controllerId: players[owner] }))]
      .map((entry) => [entry.hexId, entry] as const)).values()].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId))),
    features: map.strategicRegions.ports.map(({ hexId, capacityTokens }) => portFeatureState(hexId, capacityTokens, players[portOwner.get(hexId)!]))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  };
  const initialPieceState: PieceRuntimeState = {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    pieces,
    relations,
  };
  const usedByHex = new Map<HexId, number>();
  for (const piece of pieces) {
    if (piece.location.kind !== 'ON_MAP') continue;
    const definition = definitionById.get(piece.definitionId)!;
    usedByHex.set(piece.location.hexId, (usedByHex.get(piece.location.hexId) ?? 0) + reTicks(piece, definition));
  }
  const maximumStackReTicks = Math.max(0, ...usedByHex.values());
  const warnings = [
    ...maximumStackReTicks > 32 ? ['At least one initial stack uses more than 8 RE; review deployment before competitive play.'] : [],
    ...objectiveWarnings,
    ...planWarnings,
  ];
  return { ok: true, value: {
    initialMapState,
    initialPieceState,
    objectives: objectives.map(({ hexId, points }) => ({ hexId, points })),
    objectiveHexIds: objectives.map(({ hexId }) => hexId),
    attacker,
    metrics: {
      pieces: pieces.length,
      occupiedHexes: new Set(pieces.flatMap((piece) => piece.location.kind === 'ON_MAP' ? [piece.location.hexId] : [])).size,
      alliedPieces: pieces.filter(({ ownerId }) => ownerId === players.ALLIED).length,
      axisPieces: pieces.filter(({ ownerId }) => ownerId === players.AXIS).length,
      maximumStackReTicks,
      zoneHexes: { allied: zones.ALLIED.length, axis: zones.AXIS.length },
    },
    warnings,
  } };
};
