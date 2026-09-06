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
import type { GameFlowFailure, GeneratedDeployment } from './model.js';

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

const sidePlayer = (side: OobSide, players: Readonly<Record<OobSide, PlayerId>>): PlayerId => players[side];

const fullStrength = (definition: PieceDefinition): number | null => {
  const steps = definition.faces[0]?.steps ?? [];
  return steps.length === 0 ? null : Math.max(...steps.map((profile) => profile.remainingSteps));
};

const reTicks = (piece: PieceState, definition: PieceDefinition): number => {
  if (piece.remainingSteps === null) return 0;
  const face = definition.faces.find(({ id }) => id === piece.currentFaceId);
  return Number(face?.steps.find(({ remainingSteps }) => remainingSteps === piece.remainingSteps)
    ?.regimentalEquivalentTicks ?? 0);
};

const selectObjective = (map: GeneratedMap): HexId => {
  const centerQ = (map.mapDefinition.bounds.minQ + map.mapDefinition.bounds.maxQ) / 2;
  const centerR = (map.mapDefinition.bounds.minR + map.mapDefinition.bounds.maxR) / 2;
  const candidates = map.strategicRegions.settlementHexIds.length > 0
    ? map.strategicRegions.settlementHexIds
    : map.mapDefinition.hexes.filter((hex) => !terrainIsWater(hex)).map(({ id }) => id);
  return [...candidates].sort((left, right) => {
    const l = parseHexCoordinateId(left);
    const r = parseHexCoordinateId(right);
    if (!l.ok || !r.ok) return String(left).localeCompare(String(right));
    const ld = Math.abs(l.value.q - centerQ) + Math.abs(l.value.r - centerR);
    const rd = Math.abs(r.value.q - centerQ) + Math.abs(r.value.r - centerR);
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
  const firstAnchor = map.strategicRegions.firstEntryHexIds[0];
  const secondAnchor = map.strategicRegions.secondEntryHexIds[0];
  if (!firstAnchor || !secondAnchor || land.length === 0) {
    return { ok: false, error: [deploymentFailure('Generated map has no usable opposing entry regions.')] };
  }

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
  const relations: PieceRelation[] = [];
  const stackCounts = new Map<HexId, number>();
  for (const side of ['ALLIED', 'AXIS'] as const) {
    const rng = createSeededRandom(mixUint32(deploymentSeed ^ (side === 'ALLIED' ? 0xa11ed : 0xa815)));
    const ranked = zones[side].map((hex) => ({
      hex,
      score: distance(hex.id, sideAnchors[side]) * 10_000 + Math.floor(rng.next() * 10_000),
    })).sort((left, right) => left.score - right.score || String(left.hex.id).localeCompare(String(right.hex.id)));
    const slots = ranked.flatMap(({ hex }) => [hex.id, hex.id, hex.id]);
    const units = allUnits(oob).filter((unit) => unit.side === side);
    const supplyUnits = units.filter(({ role }) => role === 'SUPPLY');
    const fieldUnits = units.filter(({ role }) => role !== 'SUPPLY');
    const reinforcement = fieldUnits.find(({ formationId }) => formationId === null) ?? fieldUnits.at(-1);
    if (fieldUnits.length > slots.length || sideSupply[side].length === 0) {
      return { ok: false, error: [deploymentFailure(`Map cannot deploy every ${side} unit within its operational zone.`)] };
    }
    const placements = [
      ...supplyUnits.map((unit, index) => ({ unit, hexId: sideSupply[side][index % sideSupply[side].length]! })),
      ...fieldUnits.map((unit, index) => ({ unit, hexId: slots[index]! })),
    ];
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
        currentFaceId: definition.faces.find(({id}) => id === 'move')?.id ?? definition.faces[0]?.id ?? null,
        remainingSteps: fullStrength(definition),
        mode: definition.family === 'GROUND' ? 'MOVE' : null,
        statuses: [],
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
