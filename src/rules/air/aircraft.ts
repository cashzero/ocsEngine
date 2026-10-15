import { parseDefinitionId, type DefinitionId, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import { definitionOf, friendlyCombatUnitsAt, hasCapability, hexDistanceBetween, hexOf, stepOf, withStatus } from '../pieces.js';
import { PATROL_ZONE_HEXES } from '../tables/ocs-4.3.js';
import { inEnemyZoc } from '../zoc/zoc.js';

/** Aircraft and Air Base facts (3.5, 14.1, 15.0) derived from Definitions and Piece statuses. */

const statusId = (value: string): DefinitionId => {
  const parsed = parseDefinitionId(value);
  if (!parsed.ok) throw new Error(`Status ID ${value} is invalid.`);
  return parsed.value;
};

/** 14.1a: an aircraft below its Air Base counter is Inactive. Without the status it is Active (IV-E). */
export const AIR_INACTIVE_STATUS = statusId('status:air-inactive');
/** 15.0b: the current Level of an Air Base (1-3), which changes through damage, reduction and building. */
export const AIR_BASE_LEVEL_STATUS = statusId('status:air-base-level');

export const AIR_BASE_FACILITY = 'facility:air-base';
export const AIR_STRIP_FACILITY = 'facility:air-strip';
/**
 * A game-specific off-map airfield (docs/quality/evidence/engagements-plan-2026-10-07/README.md §6): a facility in an off-map box, with
 * its aircraft in the same box. They fly in over their side's map edge (range counted from the nearest friendly Air Entry Point
 * (AEP), plus OFF_MAP_AIRFIELD_DISTANCE) and come back to the box. Nothing on the map can reach it; it holds any number
 * of Active aircraft and refits every one each Aircraft Refit Phase from its own stocks (cf. 12.3e).
 */
export const OFF_MAP_AIRFIELD_FACILITY = 'facility:off-map-airfield';
/** Stands in for "no limit" on an off-map airfield's Active aircraft and refits. */
const OFF_MAP_AIRFIELD_LIMIT = 99;
/** Hexes between an off-map airfield and its side's map edge. */
export const OFF_MAP_AIRFIELD_DISTANCE = 1;
/** Capability carrying the aircraft type and the parenthesized Air Combat Rating flag (3.5, 14.1, 14.3a). */
export const AIRCRAFT_CAPABILITY = 'AIRCRAFT';
/** 14.7d B: nationalities the game-specific rules allow to Hip Shoot. */
export const HIP_SHOOT_CAPABILITY = 'HIP_SHOOT';
export const AIR_COMBAT_RATING = 'rating:air-combat';
export const BARRAGE_STRENGTH_RATING = 'rating:barrage-strength';
export const TRANSPORT_CAPACITY_RATING = 'rating:transport-capacity';

/** 14.1 aircraft types: Fighter, Tactical Bomber, Strategic Bomber, Transport. Combos list several. */
export type AircraftType = 'F' | 'T' | 'S' | 'TPT';

export const isAircraft = (state: GameState, piece: PieceState): boolean => definitionOf(state, piece)?.family === 'AIR';

export const isAirBase = (state: GameState, piece: PieceState): boolean => {
  const facility = definitionOf(state, piece)?.facility?.facilityTypeDefinitionId;
  return facility === AIR_BASE_FACILITY || facility === AIR_STRIP_FACILITY || facility === OFF_MAP_AIRFIELD_FACILITY;
};

export const isOffMapAirfield = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.facility?.facilityTypeDefinitionId === OFF_MAP_AIRFIELD_FACILITY;

const sameBox = (left: PieceState, right: PieceState): boolean => left.location.kind === 'OFF_MAP_BOX' && right.location.kind === 'OFF_MAP_BOX'
  && left.location.boxId === right.location.boxId;

/** A player's off-map airfields (in their boxes). */
export const offMapAirfields = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'OFF_MAP_BOX' && isOffMapAirfield(state, piece));

/** The off-map airfield in the box where `piece` stands, if it stands in one. */
export const offMapAirfieldOf = (state: GameState, piece: PieceState): PieceState | undefined => piece.location.kind !== 'OFF_MAP_BOX' ? undefined
  : offMapAirfields(state, piece.ownerId).find((field) => sameBox(field, piece));

/** An aircraft based at an off-map airfield. */
export const atOffMapAirfield = (state: GameState, piece: PieceState): boolean => isAircraft(state, piece) && offMapAirfieldOf(state, piece) !== undefined;

/** The aircraft at an off-map airfield. */
export const aircraftAtAirfield = (state: GameState, field: PieceState): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === field.ownerId && sameBox(piece, field) && isAircraft(state, piece));

/** The aircraft at a base: in its hex on the map, or in its box off the map. */
export const aircraftAtBase = (state: GameState, base: PieceState): readonly PieceState[] => isOffMapAirfield(state, base)
  ? aircraftAtAirfield(state, base) : hexOf(base) === null ? [] : aircraftAt(state, hexOf(base)!).filter((piece) => piece.ownerId === base.ownerId);

/** Explicit friendly AEPs printed on the map; ground reinforcement entries are unrelated. */
export const airEntryHexes = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  const index = state.scenario.players.findIndex(({ id }) => id === playerId);
  if (index < 0) return [];
  const feature = `air-entry:${index === 0 ? 'first' : index === 1 ? 'second' : 'unknown'}`;
  return state.scenario.mapDefinition.hexes.filter(({ features }) => features.some(({ kind, definitionId }) =>
    kind === 'PRINTED_FEATURE' && definitionId === feature)).map(({ id }) => id);
};

/** Where `piece` flies from toward `targetHexId`: its base hex, or for an off-map airfield the nearest launch hex. */
export const airLaunchHex = (state: GameState, piece: PieceState, targetHexId: HexId): HexId | null => {
  const hexId = hexOf(piece);
  if (hexId !== null) return hexId;
  if (!atOffMapAirfield(state, piece)) return null;
  return [...airEntryHexes(state, piece.ownerId)].sort((left, right) => hexDistanceBetween(left, targetHexId) - hexDistanceBetween(right, targetHexId)
    || String(left).localeCompare(String(right)))[0] ?? null;
};

/** Hexes `piece` flies to reach `targetHexId` (14.2d); an off-map airfield adds the way to the map edge. */
export const airDistance = (state: GameState, piece: PieceState, targetHexId: HexId): number => {
  const launch = airLaunchHex(state, piece, targetHexId);
  if (launch === null) return Number.POSITIVE_INFINITY;
  return hexDistanceBetween(launch, targetHexId) + (hexOf(piece) === null ? OFF_MAP_AIRFIELD_DISTANCE : 0);
};

/** 15.2: Air Strips are small bases with fixed limits. */
export const isAirStrip = (state: GameState, piece: PieceState): boolean =>
  definitionOf(state, piece)?.facility?.facilityTypeDefinitionId === AIR_STRIP_FACILITY;

const aircraftParameter = (state: GameState, piece: PieceState, key: string) =>
  definitionOf(state, piece)?.capabilities.find(({ id }) => id === AIRCRAFT_CAPABILITY)?.parameters.find((parameter) => parameter.key === key);

export const aircraftTypes = (state: GameState, piece: PieceState): readonly AircraftType[] => {
  const value = aircraftParameter(state, piece, 'type');
  return value?.kind === 'TEXT' ? value.value.split('/').filter((type): type is AircraftType => ['F', 'T', 'S', 'TPT'].includes(type)) : [];
};

/** Printed aircraft model, e.g. "P-47" (the counter's name). */
export const aircraftDesignation = (state: GameState, piece: PieceState): string => {
  const value = aircraftParameter(state, piece, 'designation');
  return value?.kind === 'TEXT' ? value.value : definitionOf(state, piece)?.name ?? '';
};

export const isFighter = (state: GameState, piece: PieceState): boolean => aircraftTypes(state, piece).includes('F');
export const isStrategicBomber = (state: GameState, piece: PieceState): boolean => aircraftTypes(state, piece).includes('S');

/** 14.9a: the Transport capacity printed on the current side, in half-Tokens (1T = 2); 0 for aircraft that carry nothing. */
export const aircraftTransportCapacity = (state: GameState, piece: PieceState): number => {
  const step = stepOf(state, piece);
  return typeof step?.ratings.find(({ ratingDefinitionId }) => ratingDefinitionId === TRANSPORT_CAPACITY_RATING)?.value === 'number'
    ? Number(step!.ratings.find(({ ratingDefinitionId }) => ratingDefinitionId === TRANSPORT_CAPACITY_RATING)!.value) : 0;
};

/** 14.10f: a Transport that always tows its own glider (the C-47+Gldr). */
export const hasIntegralGlider = (state: GameState, piece: PieceState): boolean => {
  const value = aircraftParameter(state, piece, 'integralGlider');
  return value?.kind === 'FLAG' && value.value;
};

/** 14.3a: an aircraft with a parenthesized Air Combat Rating cannot initiate Air Combat. */
export const hasParenthesizedRating = (state: GameState, piece: PieceState): boolean => {
  const value = aircraftParameter(state, piece, 'parenthesized');
  return value?.kind === 'FLAG' && value.value;
};

const numericRating = (state: GameState, piece: PieceState, ratingId: string): number => {
  const value = stepOf(state, piece)?.ratings.find(({ ratingDefinitionId }) => ratingDefinitionId === ratingId)?.value;
  return typeof value === 'number' ? value : 0;
};

/** Air Combat Rating of the current (full or reduced) side. */
export const airCombatRating = (state: GameState, piece: PieceState): number => numericRating(state, piece, AIR_COMBAT_RATING);

/** Barrage Strength of the current side; aircraft never take a DG halving. */
export const aircraftBarrageStrength = (state: GameState, piece: PieceState): number => numericRating(state, piece, BARRAGE_STRENGTH_RATING);

/** 14.2d: range in hexes. */
export const aircraftRange = (state: GameState, piece: PieceState): number => stepOf(state, piece)?.range ?? 0;

/** 14.7d B: the aircraft's nationality may Hip Shoot. */
export const mayHipShoot = (state: GameState, piece: PieceState): boolean => hasCapability(state, piece, HIP_SHOOT_CAPABILITY);

export const isActiveAircraft = (piece: PieceState): boolean =>
  !piece.statuses.some(({ statusDefinitionId, value }) => statusDefinitionId === AIR_INACTIVE_STATUS && value.kind === 'FLAG' && value.value);

export const withAircraftActive = (piece: PieceState, active: boolean): PieceState =>
  withStatus(piece, AIR_INACTIVE_STATUS, active ? null : { kind: 'FLAG', value: true });

/** 15.0b: Level of an Air Base; an Air Strip counts as Level 0 for Flak (15.2F). */
export const airBaseLevel = (state: GameState, piece: PieceState): number => {
  if (isAirStrip(state, piece)) return 0;
  const value = piece.statuses.find(({ statusDefinitionId }) => statusDefinitionId === AIR_BASE_LEVEL_STATUS)?.value;
  return value?.kind === 'INTEGER' ? value.value : 1;
};

export const withAirBaseLevel = (piece: PieceState, level: number): PieceState =>
  withStatus(piece, AIR_BASE_LEVEL_STATUS, { kind: 'INTEGER', value: level });

/** 15.0bA, 15.2B: aircraft an Air Base may refit in one Aircraft Refit Phase. */
export const refitCapacity = (state: GameState, base: PieceState): number =>
  isOffMapAirfield(state, base) ? OFF_MAP_AIRFIELD_LIMIT : isAirStrip(state, base) ? 1 : 2 * airBaseLevel(state, base);

/** 14.2a, 15.0bD, 15.2D: Active aircraft allowed at a friendly Air Base. */
export const activeAircraftLimit = (state: GameState, base: PieceState): number =>
  isOffMapAirfield(state, base) ? OFF_MAP_AIRFIELD_LIMIT : 4 + airBaseLevel(state, base);

export const airBaseAt = (state: GameState, hexId: HexId): PieceState | undefined =>
  state.pieceState.pieces.find((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId && isAirBase(state, piece));

export const friendlyAirBaseAt = (state: GameState, playerId: PlayerId, hexId: HexId): PieceState | undefined => {
  const base = airBaseAt(state, hexId);
  return base?.ownerId === playerId ? base : undefined;
};

export const friendlyAirBases = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isAirBase(state, piece))
    .sort((left, right) => String(hexOf(left)).localeCompare(String(hexOf(right))));

export const aircraftAt = (state: GameState, hexId: HexId): readonly PieceState[] =>
  state.pieceState.pieces.filter((piece) => piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId && isAircraft(state, piece));

export const activeAircraftAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  aircraftAt(state, hexId).filter((piece) => piece.ownerId === playerId && isActiveAircraft(piece));

/** 14.4c: a player's Air Bases with at least one Active Fighter project a 10-hex Patrol Zone. */
export const patrolZoneBases = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  friendlyAirBases(state, playerId).filter((base) => activeAircraftAt(state, playerId, hexOf(base)!).some((piece) => isFighter(state, piece)));

export const inPatrolZoneOf = (state: GameState, playerId: PlayerId, hexId: HexId): boolean =>
  patrolZoneBases(state, playerId).some((base) => hexDistanceBetween(hexOf(base)!, hexId) <= PATROL_ZONE_HEXES);

/** Hexes inside a player's Patrol Zones, for map display. */
export const patrolZoneHexes = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  const bases = patrolZoneBases(state, playerId).map((base) => hexOf(base)!);
  return state.scenario.mapDefinition.hexes.map(({ id }) => id)
    .filter((hexId) => bases.some((baseHex) => hexDistanceBetween(baseHex, hexId) <= PATROL_ZONE_HEXES));
};

/** 15.1C, 4.5a-H: refit is barred in an enemy ZOC unless a friendly combat unit in the hex negates it (4.5b). */
export const refitBlockedByZoc = (state: GameState, base: PieceState): boolean => {
  const hexId = hexOf(base);
  return hexId !== null && inEnemyZoc(state, base.ownerId, hexId) && friendlyCombatUnitsAt(state, base.ownerId, hexId).length === 0;
};

export const aircraftName = (state: GameState, piece: PieceState | undefined): string =>
  piece ? definitionOf(state, piece)?.name ?? 'Aircraft' : 'Aircraft';

export const aircraftSummary = (state: GameState, piece: PieceState): string => {
  const rating = airCombatRating(state, piece);
  const combat = hasParenthesizedRating(state, piece) ? `(${rating})` : String(rating);
  return `${aircraftName(state, piece)} ${aircraftTypes(state, piece).join('/')} ${combat}-${aircraftBarrageStrength(state, piece)}${piece.remainingSteps === 1 ? ', reduced' : ''}`;
};

export const missionAircraftIds = (state: GameState): readonly PieceId[] => state.activeTransaction?.air?.aircraft.map(({ pieceId }) => pieceId) ?? [];

/** 14.8c: 1 MP added to every hex entered in an enemy Trainbusting Zone, in quarter-MP ticks. */
export const TRAINBUSTING_EXTRA_TICKS = 4;

/**
 * 14.8b/c: extra cost to enter `hexId` for a unit of `ownerId`. A Trainbusting Zone is the marker's
 * hex and the six adjacent hexes (only the marker's hex for Leg MP); overlapping zones never add more.
 */
export const trainbustingTicks = (state: GameState, ownerId: PlayerId, hexId: HexId, leg: boolean): number =>
  state.air.trainbusting.some((marker) => marker.ownerId !== ownerId
    && (marker.hexId === hexId || (!leg && hexDistanceBetween(marker.hexId, hexId) === 1)))
    ? TRAINBUSTING_EXTRA_TICKS : 0;
