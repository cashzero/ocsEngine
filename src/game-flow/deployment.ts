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
import { adjacentHexIds, FIRST_ARRIVAL_TURN, movementCostModel, type MobilityType, type MovementCostModel } from '../rules/index.js';
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
/** Supply dumps stand at least this many Hexes behind the line where a side's field units begin. */
const DUMP_BEHIND_LINE_HEXES = 2;

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

/** Tokens of supply under every garrison at the start: two turns of eating for it (1T each, 12.6c). */
export const GENERATED_GARRISON_STOCK_TOKENS = 2;

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

/** Roles a defender deploys in Combat Mode: the units that hold the line. Artillery, HQs and trucks start as usual. */
const DEFENDER_COMBAT_ROLES = new Set(['COMBAT', 'RECONNAISSANCE', 'TANK', 'ANTI_TANK', 'ENGINEER']);
/** Candidate Hexes nearest the start line compared by draw coverage when siting a dump. */
const DUMP_CANDIDATE_LIMIT = 40;

const truckCostModel = (map: GeneratedMap): MovementCostModel => movementCostModel({
  scenario: { mapDefinition: map.mapDefinition },
  configuration: {
    terrainMovementCosts: GENERATED_TERRAIN_MOVEMENT_COSTS,
    hexsideMovementCosts: GENERATED_HEXSIDE_MOVEMENT_COSTS,
    roadMovementCosts: GENERATED_ROAD_MOVEMENT_COSTS,
    defaultTerrainCostTicks: GENERATED_DEFAULT_TERRAIN_COST_TICKS,
  },
  weather: { groundCondition: 'DRY' },
}, 'truck');

/**
 * Hexes a supply dump at `originHexId` reaches by Truck draw (12.3a, 12.3d). Truck and Track units
 * need fuel from a dump within that range (12.5), so field units deploy inside it. Uses the same
 * movement cost model as play (weather ignored, 17.0c), so terrain, rivers and roads are respected.
 */
const supplyReach = (model: MovementCostModel, originHexId: HexId): ReadonlySet<HexId> => {
  const best = new Map<HexId, number>([[originHexId, 0]]);
  const queue: HexId[] = [originHexId];
  for (let head = 0; head < queue.length; head += 1) {
    const hexId = queue[head]!;
    for (const next of adjacentHexIds(hexId)) {
      const step = model.evaluate(hexId, next);
      if (step.kind !== 'COST' || step.all) continue;
      const total = best.get(hexId)! + step.cost.totalTicks;
      if (total > GENERATED_SUPPLY_DRAW_RANGE_TICKS || total >= (best.get(next) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(next, total);
      queue.push(next);
    }
  }
  return new Set(best.keys());
};

/**
 * Centre Hexes for `count` formation groups, in `ranked` order, each at least `spacing` Hexes from every
 * reserved Hex (supply dumps, Air Bases) and from every earlier centre. Wider spacing is preferred, but
 * staying inside the first of `reaches` (supply) outranks it; both relax until `count` centres exist or `ranked` runs out.
 */
const formationCenters = (
  ranked: readonly HexId[],
  reserved: readonly HexId[],
  reaches: readonly ReadonlySet<HexId>[],
  count: number,
): HexId[] => {
  const taken = [...reserved];
  const chosen: HexId[] = [];
  // Centre by centre: the best reach first, at the widest spacing it allows, before any Hex of a lesser reach.
  for (const reach of [...reaches, null]) {
    for (const spacing of [GENERATED_FORMATION_SPACING_HEXES, 2, 1]) {
      for (const hexId of ranked) {
        if (chosen.length === count) return chosen;
        if (reach !== null && !reach.has(hexId)) continue;
        if (taken.every((other) => distance(other, hexId) >= spacing)) {
          chosen.push(hexId);
          taken.push(hexId);
        }
      }
    }
  }
  // Fewer centres than groups: the groups without one deploy through the fallback slots.
  return chosen;
};

/** Victory points of an objective: a Major City outweighs a town. Villages and open country are never objectives. */
export const GENERATED_MAJOR_CITY_OBJECTIVE_POINTS = 3;
export const GENERATED_TOWN_OBJECTIVE_POINTS = 1;
/** Each side's half of the map holds about one objective VP per this many of its land Hexes. */
export const GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT = 64;
const MINIMUM_OBJECTIVE_POINTS_PER_SIDE = 2;

const CITY_FEATURE = 'settlement:city';
const TOWN_FEATURE = 'settlement:town';

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

/**
 * Objectives stand in Major Cities and towns, as on a printed OCS map: one per Major City (on its core
 * Hex) and a set of towns. Each side's half of the map gets the same VP total, filled with its Major
 * Cities first and then the towns nearest the front (the larger town on a tie), so the towns at stake lie
 * where the armies meet. Who holds an objective at the start follows the initial control (13.3h).
 */
const selectObjectives = (
  map: GeneratedMap,
  sideOf: (hexId: HexId) => OobSide,
  frontDistance: (hexId: HexId) => number,
  sideLand: Readonly<Record<OobSide, number>>,
  holder: OobSide | null,
): { readonly objectives: readonly GeneratedObjective[]; readonly warnings: readonly string[] } => {
  const hexById = new Map(map.mapDefinition.hexes.map((hex) => [hex.id, hex]));
  const edgeHexes = new Set([
    ...map.strategicRegions.firstEntryHexIds, ...map.strategicRegions.secondEntryHexIds,
    ...map.strategicRegions.firstSupplyHexIds, ...map.strategicRegions.secondSupplyHexIds,
  ]);
  const candidates: Record<OobSide, { hexId: HexId; points: number; city: boolean }[]> = { ALLIED: [], AXIS: [] };
  const cityCores: HexId[] = [];
  // Settlement Hex IDs come ranked: each Major City core before its suburbs, then towns largest first.
  for (const hexId of map.strategicRegions.settlementHexIds) {
    const features = hexById.get(hexId)?.features.map(({ definitionId }) => String(definitionId)) ?? [];
    const city = features.includes(CITY_FEATURE);
    if (city) {
      // A suburb adjoins its core; Major Cities stand far apart, so an adjacent earlier city Hex is the core.
      if (cityCores.some((core) => distance(core, hexId) <= 1)) continue;
      cityCores.push(hexId);
    } else if (!features.includes(TOWN_FEATURE)) continue;
    if (edgeHexes.has(hexId)) continue;
    // In an attack every objective lies in the defender's zone: the attacker has nothing to lose but its army.
    if (holder !== null && sideOf(hexId) !== holder) continue;
    candidates[sideOf(hexId)].push({
      hexId, city, points: city ? GENERATED_MAJOR_CITY_OBJECTIVE_POINTS : GENERATED_TOWN_OBJECTIVE_POINTS,
    });
  }
  const sum = (entries: readonly { points: number }[]): number => entries.reduce((total, { points }) => total + points, 0);
  const sides = ['ALLIED', 'AXIS'] as const;
  // An attack stakes as many VP as a meeting engagement on the same map, all of them the defender's.
  const wanted = holder === null
    ? Math.max(MINIMUM_OBJECTIVE_POINTS_PER_SIDE, Math.round(Math.min(sideLand.ALLIED, sideLand.AXIS) / GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT))
    : 2 * Math.max(MINIMUM_OBJECTIVE_POINTS_PER_SIDE, Math.round((sideLand.ALLIED + sideLand.AXIS) / 2 / GENERATED_LAND_HEXES_PER_OBJECTIVE_POINT));
  const staked = holder === null ? sides : [holder];
  // Every Major City counts, so the target rises to the side with the most city VP; it cannot exceed
  // what the poorer side can field, or the sides would start unequal.
  const target = Math.min(
    Math.max(wanted, ...staked.map((side) => sum(candidates[side].filter(({ city }) => city)))),
    ...staked.map((side) => sum(candidates[side])),
  );
  const objectives: GeneratedObjective[] = [];
  const totals = { ALLIED: 0, AXIS: 0 };
  for (const side of staked) {
    const size = new Map(candidates[side].map(({ hexId }, order) => [hexId, order]));
    const byFront = [...candidates[side]].sort((left, right) => Number(right.city) - Number(left.city)
      || frontDistance(left.hexId) - frontDistance(right.hexId) || size.get(left.hexId)! - size.get(right.hexId)!);
    for (const { hexId, points, city } of byFront) {
      if (!city && totals[side] + points > target) continue;
      objectives.push({ hexId, points, side });
      totals[side] += points;
    }
  }
  if (objectives.length === 0) {
    const hexId = centralObjective(map);
    return { objectives: [{ hexId, points: GENERATED_TOWN_OBJECTIVE_POINTS, side: sideOf(hexId) }], warnings: [] };
  }
  const warnings = holder !== null
    ? totals[holder] >= wanted ? [] : [`The defender holds only ${totals[holder]} of ${wanted} objective VP; its zone has too few towns.`]
    : totals.ALLIED === totals.AXIS ? [] : [
      `Objectives are unbalanced (Allied ${totals.ALLIED} VP, Axis ${totals.AXIS} VP); the map has too few towns on one side.`,
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

  const truckModel = truckCostModel(map);
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
  /** Rail towns each side's railroad joins to its map edge inside its zone: its supply nodes (13.3c). */
  const supplyNodes: Record<OobSide, Set<HexId>> = { ALLIED: new Set(), AXIS: new Set() };
  const railNeighbors = new Map<HexId, HexId[]>();
  for (const [first, second] of railLinks) {
    railNeighbors.set(first, [...railNeighbors.get(first) ?? [], second]);
    railNeighbors.set(second, [...railNeighbors.get(second) ?? [], first]);
  }
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
  const sideSupply: Readonly<Record<OobSide, readonly HexId[]>> = {
    ALLIED: map.strategicRegions.firstSupplyHexIds,
    AXIS: map.strategicRegions.secondSupplyHexIds,
  };
  const zones: Readonly<Record<OobSide, readonly HexDefinition[]>> = {
    ALLIED: land.filter(({ id }) => lean(id) >= split),
    AXIS: land.filter(({ id }) => lean(id) < split),
  };

  const pieces: PieceState[] = [];
  const groups = deploymentGroups(oob);
  const relations: PieceRelation[] = [];
  const stackCounts = new Map<HexId, number>();
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
    const airBases = units.filter(({ role, staging }) => role === 'AIR_BASE' && staging === undefined);
    const aircraft = units.filter(({ role, arrivalTurn, staging }) => role === 'AIRCRAFT' && arrivalTurn === undefined && staging === undefined);
    // The off-map airfield and its aircraft are in the side's off-map airfield box, not on the map (§6).
    const offMapAir = units.filter(({ staging }) => staging === 'OFF_MAP_AIRFIELD');
    // 13.6: reinforcing aircraft wait in the side's reinforcement box and arrive Active on their Game Turn.
    const arrivingAircraft = units.filter(({ role, arrivalTurn }) => role === 'AIRCRAFT' && arrivalTurn !== undefined);
    const stagedUnits = units.filter(({ staging }) => staging === 'AIR_BASE');
    // 13.6: ground units with an arrival turn (later trucks, OOB 0.5.0) wait in the reinforcement box for it.
    const arrivingGround = units.filter(({ role, arrivalTurn }) => role !== 'AIRCRAFT' && arrivalTurn !== undefined);
    const fieldUnits = units.filter(({ role, staging, arrivalTurn }) => role !== 'SUPPLY' && role !== 'AIR_BASE' && role !== 'AIRCRAFT' && staging !== 'AIR_BASE' && arrivalTurn === undefined);
    const groupOf = (unit: GeneratedOobUnit): string => groups.get(unit.id) ?? 'independent';
    const reinforcement = fieldUnits.find((unit) => groupOf(unit) === 'independent') ?? fieldUnits.at(-1);
    if (fieldUnits.length > denseSlots.length || sideSupply[side].length === 0) {
      return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit within its operational zone.`)] };
    }
    // 15.0: Air Bases sit in the rear near the side's supply hexes (so refit SP can reach them), on
    // ground trucks can enter, at least three hexes apart; one Air Base per hex (15.0a).
    const baseHexes: HexId[] = [];
    // Supply dumps are spread too: each stands inside the zone, on ground trucks can enter, apart from
    // the others (spacing relaxes only when the zone is too small), and where its draw range covers the
    // most ground so the units around it can be fuelled. The first dump anchors the Air Bases.
    // Trace supply (12.3) starts at the side's map-edge sources and its detrainable rail Hexes (13.3c); a unit within
    // draw range of one, or adjacent to that range (12.3c), traces directly. Units start there where the map allows,
    // so the armies do not begin out of supply now that they stand forward. HQ throws can only add to this.
    // A detrainable Hex counts when the railroad joins it to the side's map edge without leaving the side's zone.
    const zone = new Set(zones[side].map(({ id }) => id));
    const railed = new Set(sideSupply[side]);
    const railQueue = [...railed];
    for (let head = 0; head < railQueue.length; head += 1) {
      for (const next of railNeighbors.get(railQueue[head]!) ?? []) {
        if (railed.has(next) || !zone.has(next)) continue;
        railed.add(next);
        railQueue.push(next);
      }
    }
    for (const hexId of railed) {
      if (!sideSupply[side].includes(hexId) && hexById.get(hexId)?.features.some(({ definitionId }) => DETRAINABLE_FEATURES.has(String(definitionId)))) supplyNodes[side].add(hexId);
    }
    const traceReach = new Set([...sideSupply[side], ...[...railed]
      .filter((hexId) => hexById.get(hexId)?.features.some(({ definitionId }) => DETRAINABLE_FEATURES.has(String(definitionId))))]
      .flatMap((hexId) => [...supplyReachOf(hexId)].flatMap((reached) => [reached, ...adjacentHexIds(reached)])));
    const dumpCandidates = ranked
      .filter(({ hex }) => canDeployOn(hex, 'truck') && depthOf(side, hex.id) >= line + DUMP_BEHIND_LINE_HEXES
        && distance(hex.id, sideAnchors[side]) >= DUMP_MIN_DEPTH_HEXES)
      .slice(0, DUMP_CANDIDATE_LIMIT)
      // A dump serves the units around it best where they can also trace supply.
      .map(({ hex }, order) => ({ hexId: hex.id, order, coverage: [...supplyReachOf(hex.id)].filter((reached) => traceReach.has(reached)).length }))
      .sort((left, right) => right.coverage - left.coverage || left.order - right.order);
    const dumpHexes: HexId[] = [];
    for (const spacing of [DUMP_SPACING_HEXES, 2, 1]) {
      dumpHexes.length = 0;
      for (const { hexId } of dumpCandidates) {
        if (dumpHexes.length === supplyUnits.length) break;
        if (dumpHexes.every((used) => distance(used, hexId) >= spacing)) dumpHexes.push(hexId);
      }
      if (dumpHexes.length === supplyUnits.length) break;
    }
    if (dumpHexes.length < supplyUnits.length) dumpHexes.push(...sideSupply[side].slice(0, supplyUnits.length - dumpHexes.length));
    const supplyAnchor = dumpHexes[0] ?? sideSupply[side][0]!;
    const baseCandidates = zones[side]
      .filter((hex) => canDeployOn(hex, 'truck') && distance(hex.id, supplyAnchor) >= 1)
      .map((hex) => ({ hex, score: distance(hex.id, supplyAnchor) * 10_000 + Math.floor(rng.next() * 10_000) }))
      .sort((left, right) => left.score - right.score || String(left.hex.id).localeCompare(String(right.hex.id)));
    for (const _ of airBases) {
      const chosen = baseCandidates.find(({ hex }) => baseHexes.every((used) => distance(used, hex.id) >= 3));
      if (!chosen) return { ok: false, error: [deploymentFailure(`Map has no room for every ${side} Air Base in the rear.`)] };
      baseHexes.push(chosen.hex.id);
    }
    // Field units deploy as formation groups rather than one blob: each formation gets its own centre,
    // inside supply reach and clear of the dumps and Air Bases, and a unit takes the nearest slot of its
    // group on a Hex its deployed face may enter (6.2c). Stacking (4.8) is respected so a displaced unit
    // cannot overstack a later Hex.
    const groupKeys = [...new Set(fieldUnits.map(groupOf))];
    const dumpReach = new Set(dumpHexes.flatMap((hexId) => [...supplyReachOf(hexId)]));
    const tracedDumpReach = new Set([...dumpReach].filter((hexId) => traceReach.has(hexId)));
    const supplyTier = (hexId: HexId): number => tracedDumpReach.has(hexId) ? 0 : dumpReach.has(hexId) ? 1 : 2;
    const reserved = new Set<HexId>([...dumpHexes, ...baseHexes]);
    const rankedIds = ranked.map(({ hex }) => hex.id);
    // In an attack no formation centres in front of its side's start line (it would start next to the enemy).
    const centerHexes = attacker === null ? rankedIds : rankedIds.filter((hexId) => depthOf(side, hexId) >= line);
    const centers = formationCenters(centerHexes, [...reserved], [tracedDumpReach, dumpReach], groupKeys.length);
    // Each formation group takes its centre, then the nearest free Hexes around it (reach and the
    // dumps/bases permitting), FIELD_UNITS_PER_HEX slots each. No Hex belongs to two groups.
    const claimed = new Set<HexId>(centers);
    const groupSlots = new Map<string, HexId[]>();
    for (const [index, key] of groupKeys.entries()) {
      const center = centers[index];
      if (center === undefined) break;
      const size = fieldUnits.filter((unit) => groupOf(unit) === key).length;
      const hexes = [center];
      const nearby = rankedIds
        // A group spreads around its centre but never in front of the side's start line.
        .filter((hexId) => !claimed.has(hexId) && !reserved.has(hexId) && depthOf(side, hexId) >= line && (dumpReach.size === 0 || dumpReach.has(hexId)))
        // Slots that also trace supply come first; a group in reach of a dump alone still deploys.
        .sort((left, right) => supplyTier(left) - supplyTier(right))
        .map((hexId, order) => ({ hexId, order, away: distance(hexId, center) }))
        .filter(({ away }) => away <= 3)
        .sort((left, right) => left.away - right.away || left.order - right.order);
      for (const { hexId } of nearby) {
        if (hexes.length * FIELD_UNITS_PER_HEX >= size + 1) break;
        hexes.push(hexId);
        claimed.add(hexId);
      }
      groupSlots.set(key, hexes.flatMap((hexId) => Array<HexId>(FIELD_UNITS_PER_HEX).fill(hexId)));
    }
    // Units their group cannot take spill over to the nearest slots behind the start line, those in trace and in reach
    // of a dump first; Hexes in front of the line are the last resort.
    const tier = (hexId: HexId): number => (depthOf(side, hexId) >= line ? 0 : 3)
      + supplyTier(hexId);
    const fallbackSlots = denseSlots.map((hexId, order) => ({ hexId, order }))
      .sort((left, right) => tier(left.hexId) - tier(right.hexId) || left.order - right.order).map(({ hexId }) => hexId);
    const usedReTicks = new Map<HexId, number>();
    const fieldPlacements: { unit: (typeof fieldUnits)[number]; hexId: HexId }[] = [];
    // In an attack, a unit with no room behind its side's start line waits off the map and arrives on Game Turn 2
    // (13.6) rather than starting next to the enemy; a crowded meeting engagement still fills toward the front.
    const heldBack = new Set<string>();
    // HQs take their slots first and trucks last: an HQ out of trace supply cannot throw it (12.3b), a truck needs none.
    const placementRank = (unit: GeneratedOobUnit): number => unit.role === 'HQ' ? 0 : unit.role === 'TRANSPORT' ? 2 : 1;
    for (const unit of [...fieldUnits].sort((left, right) => placementRank(left) - placementRank(right))) {
      const definition = definitionById.get(unit.definitionId);
      const offMap = unit.id === reinforcement?.id;
      const unitReTicks = definition && !offMap ? deployedReTicks(definition) : 0;
      const fits = (hexId: HexId): boolean => (definition === undefined
        || canDeployOn(hexById.get(hexId)!, deployedMobility(definition)))
        && (usedReTicks.get(hexId) ?? 0) + unitReTicks <= GENERATED_STACKING_LIMIT_RE_TICKS;
      const ownSlots = groupSlots.get(groupOf(unit)) ?? [];
      const ownIndex = ownSlots.findIndex(fits);
      const fallbackIndex = ownIndex < 0 ? fallbackSlots.findIndex(fits) : -1;
      if (attacker !== null && !offMap && ownIndex < 0 && (fallbackIndex < 0 || depthOf(side, fallbackSlots[fallbackIndex]!) < line)) {
        heldBack.add(unit.id);
        fieldPlacements.push({ unit, hexId: sideSupply[side][0]! });
        continue;
      }
      if (ownIndex < 0 && fallbackIndex < 0) {
        return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit on terrain it can enter within stacking limits.`)] };
      }
      const hexId = ownIndex >= 0 ? ownSlots.splice(ownIndex, 1)[0]! : fallbackSlots.splice(fallbackIndex, 1)[0]!;
      usedReTicks.set(hexId, (usedReTicks.get(hexId) ?? 0) + unitReTicks);
      fieldPlacements.push({ unit, hexId });
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
      // A defender's line units start in Combat Mode (on their Combat face): a prepared defence, not a march.
      const combatFace = definition.faces.find(({ id }) => String(id) === 'combat');
      const holdsLine = attacker !== null && side !== attacker && !awaitingReinforcement && combatFace !== undefined
        && DEFENDER_COMBAT_ROLES.has(unit.role);
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
    (hexId) => allied.has(hexId) ? 'ALLIED' : 'AXIS',
    // The front is the split between the deployment zones.
    (hexId) => Math.abs(lean(hexId) - split),
    { ALLIED: zones.ALLIED.length, AXIS: zones.AXIS.length },
    attacker === null ? null : attacker === 'ALLIED' ? 'AXIS' : 'ALLIED',
  );
  const seeded = new Set(controlled.map(({ hexId }) => hexId));
  // OOB 0.4.0: one objective garrison (1-1-0, MA 0) on every objective a side holds, in Combat Mode so it exerts a ZOC
  // (4.4b): no objective can be taken by simply walking into it. In an attack the attacker holds none, so it has none.
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
  // Every garrison stands on a small dump of its own (user, 2026-10-07: supply to match the garrisons): it eats from it
  // when cut off instead of suffering attrition (12.6c, 12.8). The enemy may capture it (9.14b) unless blown (12.11a).
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
    if (attacker !== null) {
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
    .filter(({ id }) => !seeded.has(id) && (depth(side, id) <= fronts[side] || garrisoned.get(id) === players[side]))
    .map(({ id }) => ({ hexId: id, controllerId: players[side] })));
  const initialMapState: MapState = {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    hexControl: [...controlled, ...zoneControl].sort((left, right) => String(left.hexId).localeCompare(String(right.hexId))),
    features: [],
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
