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
import { adjacentHexIds, movementCostModel, type MobilityType, type MovementCostModel } from '../rules/index.js';
import type { GameFlowFailure, GeneratedDeployment } from './model.js';
import {
  GENERATED_DEFAULT_TERRAIN_COST_TICKS,
  GENERATED_STACKING_LIMIT_RE_TICKS,
  GENERATED_SUPPLY_DRAW_RANGE_TICKS,
} from './configuration.js';
import {
  GENERATED_HEXSIDE_MOVEMENT_COSTS,
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

/** Supply dumps stand this many Hexes in from the entry Hex, apart from each other, not on the map edge. */
const DUMP_MIN_DEPTH_HEXES = 3;
const DUMP_SPACING_HEXES = 3;
/** Nearest candidate Hexes compared by draw coverage when siting a dump. */
const DUMP_CANDIDATE_LIMIT = 12;

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
 * Centre Hexes for `count` formation groups, nearest the side's anchor first, each at least `spacing`
 * Hexes from every reserved Hex (supply dumps, Air Bases) and from every earlier centre. Wider spacing
 * is preferred, but staying inside `reach` (supply) outranks it; both relax until `count` centres exist.
 */
const formationCenters = (
  ranked: readonly HexId[],
  reserved: readonly HexId[],
  reach: ReadonlySet<HexId>,
  count: number,
): HexId[] => {
  const spacings = [GENERATED_FORMATION_SPACING_HEXES, 2, 1];
  const attempts = [
    ...spacings.map((spacing) => ({ spacing, inReach: true })),
    ...spacings.map((spacing) => ({ spacing, inReach: false })),
  ];
  for (const { spacing, inReach } of attempts) {
    const taken = [...reserved];
    const chosen: HexId[] = [];
    for (const hexId of ranked) {
      if (chosen.length === count) break;
      if (inReach && !reach.has(hexId)) continue;
      if (taken.every((other) => distance(other, hexId) >= spacing)) {
        chosen.push(hexId);
        taken.push(hexId);
      }
    }
    if (chosen.length === count) return chosen;
  }
  return [];
};

const selectObjective = (map: GeneratedMap): HexId => {
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

const deploymentFailure = (message: string, path: readonly (string | number)[] = []): GameFlowFailure => ({
  stage: 'DEPLOYMENT', code: 'DEPLOYMENT_INVALID', message, path,
});

export const deployGeneratedForces = (
  map: GeneratedMap,
  oob: GeneratedOob,
  deploymentSeed: number,
  players: Readonly<Record<OobSide, PlayerId>>,
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
  const reachCache = new Map<HexId, ReadonlySet<HexId>>();
  const supplyReachOf = (hexId: HexId): ReadonlySet<HexId> => {
    let reach = reachCache.get(hexId);
    if (!reach) { reach = supplyReach(truckModel, hexId); reachCache.set(hexId, reach); }
    return reach;
  };

  const sideAnchors: Readonly<Record<OobSide, HexId>> = { ALLIED: firstAnchor, AXIS: secondAnchor };
  const sideSupply: Readonly<Record<OobSide, readonly HexId[]>> = {
    ALLIED: map.strategicRegions.firstSupplyHexIds,
    AXIS: map.strategicRegions.secondSupplyHexIds,
  };
  const zones: Readonly<Record<OobSide, readonly HexDefinition[]>> = {
    ALLIED: land.filter(({ id }) => distance(id, firstAnchor) <= distance(id, secondAnchor)),
    AXIS: land.filter(({ id }) => distance(id, secondAnchor) < distance(id, firstAnchor)),
  };

  const pieces: PieceState[] = [];
  const groups = deploymentGroups(oob);
  const relations: PieceRelation[] = [];
  const stackCounts = new Map<HexId, number>();
  for (const side of ['ALLIED', 'AXIS'] as const) {
    const rng = createSeededRandom(mixUint32(deploymentSeed ^ (side === 'ALLIED' ? 0xa11ed : 0xa815)));
    const ranked = zones[side].map((hex) => ({
      hex,
      score: distance(hex.id, sideAnchors[side]) * 10_000 + Math.floor(rng.next() * 10_000),
    })).sort((left, right) => left.score - right.score || String(left.hex.id).localeCompare(String(right.hex.id)));
    // Dense fallback: three slots per Hex, used only when the spread slots cannot take a unit.
    const denseSlots = ranked.flatMap(({ hex }) => [hex.id, hex.id, hex.id]);
    const units = allUnits(oob).filter((unit) => unit.side === side);
    const supplyUnits = units.filter(({ role }) => role === 'SUPPLY');
    const airBases = units.filter(({ role }) => role === 'AIR_BASE');
    const aircraft = units.filter(({ role }) => role === 'AIRCRAFT');
    const fieldUnits = units.filter(({ role }) => role !== 'SUPPLY' && role !== 'AIR_BASE' && role !== 'AIRCRAFT');
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
    const dumpCandidates = ranked
      .filter(({ hex }) => canDeployOn(hex, 'truck')
        && distance(hex.id, sideAnchors[side]) >= DUMP_MIN_DEPTH_HEXES)
      .slice(0, DUMP_CANDIDATE_LIMIT)
      .map(({ hex }, order) => ({ hexId: hex.id, order, coverage: supplyReachOf(hex.id).size }))
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
    const reach = new Set(dumpHexes.flatMap((hexId) => [...supplyReachOf(hexId)]));
    const reserved = new Set<HexId>([...dumpHexes, ...baseHexes]);
    const rankedIds = ranked.map(({ hex }) => hex.id);
    const centers = formationCenters(rankedIds, [...reserved], reach, groupKeys.length);
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
        .filter((hexId) => !claimed.has(hexId) && !reserved.has(hexId) && (reach.size === 0 || reach.has(hexId)))
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
    const fallbackSlots = [...denseSlots];
    const usedReTicks = new Map<HexId, number>();
    const fieldPlacements: { unit: (typeof fieldUnits)[number]; hexId: HexId }[] = [];
    for (const unit of fieldUnits) {
      const definition = definitionById.get(unit.definitionId);
      const offMap = unit.id === reinforcement?.id;
      const unitReTicks = definition && !offMap ? deployedReTicks(definition) : 0;
      const fits = (hexId: HexId): boolean => (definition === undefined
        || canDeployOn(hexById.get(hexId)!, deployedMobility(definition)))
        && (usedReTicks.get(hexId) ?? 0) + unitReTicks <= GENERATED_STACKING_LIMIT_RE_TICKS;
      const ownSlots = groupSlots.get(groupOf(unit)) ?? [];
      const ownIndex = ownSlots.findIndex(fits);
      const fallbackIndex = ownIndex < 0 ? fallbackSlots.findIndex(fits) : -1;
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
    );
    for (const { unit, hexId } of placements) {
      const definition = definitionById.get(unit.definitionId);
      const parsedId = parsePieceId(unit.id);
      if (!definition || !parsedId.ok) {
        return { ok: false, error: [deploymentFailure(`OOB unit ${unit.id} cannot be converted to runtime state.`)] };
      }
      const awaitingReinforcement = unit.id === reinforcement?.id;
      const stackOrder = awaitingReinforcement ? 0 : stackCounts.get(hexId) ?? 0;
      if (!awaitingReinforcement) stackCounts.set(hexId, stackOrder + 1);
      pieces.push({
        id: parsedId.value,
        definitionId: unit.definitionId,
        ownerId: sidePlayer(side, players),
        location: awaitingReinforcement
          ? { kind: 'OFF_MAP_BOX', boxId: GENERATED_REINFORCEMENT_BOXES[side] }
          : { kind: 'ON_MAP', hexId },
        currentFaceId: deployedFace(definition)?.id ?? null,
        remainingSteps: fullStrength(definition),
        mode: definition.family === 'GROUND' ? 'MOVE' : null,
        statuses: unit.role === 'AIR_BASE'
          ? [{ statusDefinitionId: 'status:air-base-level' as never, value: { kind: 'INTEGER', value: initialAirBaseLevel(definition) ?? 1 } }]
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
  const initialMapState: MapState = {
    schemaVersion: FOUNDATION_SCHEMA_VERSION,
    revision: initialRevision.value,
    hexControl: controlled,
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
  const warnings = maximumStackReTicks > 32
    ? ['At least one initial stack uses more than 8 RE; review deployment before competitive play.']
    : [];
  return { ok: true, value: {
    initialMapState,
    initialPieceState,
    objectiveHexIds: [selectObjective(map)],
    metrics: {
      pieces: pieces.length,
      occupiedHexes: new Set(pieces.flatMap((piece) => piece.location.kind === 'ON_MAP' ? [piece.location.hexId] : [])).size,
      alliedPieces: pieces.filter(({ ownerId }) => ownerId === players.ALLIED).length,
      axisPieces: pieces.filter(({ ownerId }) => ownerId === players.AXIS).length,
      maximumStackReTicks,
    },
    warnings,
  } };
};
