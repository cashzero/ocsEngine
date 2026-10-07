import { stableSort, stableKey, type PlayerId } from '../../core/index.js';
import { pieceLocationKey, type PieceLocation } from '../../domain/map/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import { INTERNAL_STOCKS_STATUS, OUT_OF_TRACE_SINCE_STATUS, RETURN_TURN_STATUS, definitionOf, isCombatUnit } from '../pieces.js';
import { exertsZoc } from '../zoc/zoc.js';
import { pendingAbsorptions } from '../breakdown/breakdown.js';
import { calculateCombatOdds } from '../combat/strength.js';
import { previewBarrage } from '../combat/combat.js';
import { BARRAGE_TABLE_COLUMNS } from '../tables/ocs-4.3.js';
import type { PieceRole, ProjectedCombat, ProjectedPiece, ProjectedStack, RuleProjection } from './model.js';
import { AIR_MISSION_LABELS, previewAirBarrage } from '../air/mission.js';
import { activeAircraftLimit, airBaseLevel, aircraftName, isActiveAircraft, isAirBase,
  offMapAirfields, aircraftAtAirfield, isAircraft, isFighter, patrolZoneHexes, refitBlockedByZoc, refitCapacity } from '../air/aircraft.js';
import { equipmentIn, rebuildOptions, stepsToRebuild } from '../air/replacement.js';
import { lostTruckPoints } from '../replacement/ledger.js';
import { unitRebuildOptions } from '../replacement/replacement.js';
import { aircraftRange, aircraftTransportCapacity, hasIntegralGlider } from '../air/aircraft.js';
import { baseDumps, earliestPlanTurn, loadableUnits, readyTransports } from '../air/transport.js';

/** 4.9a: internal stocks and other private bookkeeping are never shown to the enemy. */
const PRIVATE_STATUSES: readonly string[] = [INTERNAL_STOCKS_STATUS, OUT_OF_TRACE_SINCE_STATUS, RETURN_TURN_STATUS];
/** Status values the enemy may read because they are printed on the counter itself (a Breakdown's "1/101.Abn" too, 20.0). */
const PUBLIC_VALUE_STATUSES: readonly string[] = ['status:air-base-level', 'status:transport-points', 'status:unit-name'];

/** What the counter is for, from its definition and where it is (not from which fields happen to be set). */
export const roleOf = (state: GameState, piece: PieceState): PieceRole => {
  const definition = definitionOf(state, piece);
  if (!definition) return 'OTHER';
  if (isAircraft(state, piece)) return 'AIRCRAFT';
  if (isAirBase(state, piece)) return 'AIR_BASE';
  if (definition.family === 'REPLACEMENT') return 'REPLACEMENT';
  if (definition.family === 'RESOURCE') return piece.location.kind === 'CONTAINER' ? 'CARGO' : 'DUMP';
  switch (definition.counter?.kind) {
    case 'TRANSPORT': return piece.currentFaceId === 'extender' ? 'EXTENDER' : 'TRUCK';
    case 'HQ': return 'HQ';
    case 'ARTILLERY': return 'ARTILLERY';
    case 'COMBAT': return 'COMBAT';
    case 'SUPPLY': return 'DUMP';
    default: return 'OTHER';
  }
};

/** Tokens carried by a truck: the SP in its cargo relations. */
const carriedTokensOf = (state: GameState, truck: PieceState): number => {
  const cargoIds = new Set(state.pieceState.relations.flatMap((relation) => relation.kind === 'CARGO' && relation.containerId === truck.id ? [relation.cargoId] : []));
  return state.pieceState.pieces.reduce((total, piece) => cargoIds.has(piece.id) ? total + (piece.resourceQuantity ?? 0) : total, 0);
};

const projectPiece = (state: GameState, piece: PieceState, stepsHidden: boolean): ProjectedPiece => ({
  role: roleOf(state, piece),
  carriedTokens: !stepsHidden && roleOf(state, piece) === 'TRUCK' ? carriedTokensOf(state, piece) : null,
  currentFaceId: piece.currentFaceId,
  resourceQuantity: stepsHidden ? null : piece.resourceQuantity,
  id: piece.id,
  ownerId: piece.ownerId,
  definitionId: piece.definitionId,
  location: { ...piece.location },
  mode: piece.mode,
  remainingSteps: stepsHidden ? null : piece.remainingSteps,
  statuses: piece.statuses.map(({ statusDefinitionId }) => statusDefinitionId)
    .filter((id) => !stepsHidden || !PRIVATE_STATUSES.includes(id)),
  // An Air Base's Level (15.0) and a Transport Point's size (13.2c) are printed on the counter, so neither is private.
  statusValues: piece.statuses.flatMap(({ statusDefinitionId, value }) =>
    (value.kind === 'TEXT' || value.kind === 'INTEGER') && (!stepsHidden || PUBLIC_VALUE_STATUSES.includes(statusDefinitionId))
      ? [{ statusDefinitionId, value: value.value }] : []),
  redacted: stepsHidden,
});

/**
 * 4.9a: a player never looks through an enemy stack but always sees its top Combat Mode
 * Attack-Capable unit (or its top combat unit if none has a ZOC), including Strat, DG or Out of
 * Supply status, but not steps lost. Hidden units are only counted, never identified.
 */
const visibleEnemyTop = (state: GameState, enemy: readonly PieceState[]): readonly PieceState[] => {
  const combat = enemy.filter((piece) => isCombatUnit(state, piece));
  const top = combat.find((piece) => exertsZoc(state, piece)) ?? combat[0];
  // 4.8e, 4.9a: the Air Base and the top Active plane (a Fighter if any) are seen too.
  const base = enemy.find((piece) => isAirBase(state, piece));
  const active = enemy.filter((piece) => isAircraft(state, piece) && isActiveAircraft(piece));
  const plane = active.find((piece) => isFighter(state, piece)) ?? active[0];
  const visible = [top, base, plane].filter((piece): piece is PieceState => piece !== undefined);
  return visible.length > 0 ? visible : enemy.slice(0, 1);
};

export const projectRuleState = (state: GameState, viewerId: PlayerId): RuleProjection => {
  const groups = new Map<string, { location: PieceLocation; pieces: PieceState[] }>();
  for (const piece of state.pieceState.pieces) {
    const key = pieceLocationKey(piece.location);
    const group = groups.get(key) ?? { location: piece.location, pieces: [] };
    group.pieces.push(piece);
    groups.set(key, group);
  }
  const stacks: ProjectedStack[] = [];
  for (const group of groups.values()) {
    const ordered = stableSort(group.pieces, (left, right) => right.stackOrder - left.stackOrder);
    const friendly = ordered.filter(({ ownerId }) => ownerId === viewerId);
    const enemy = ordered.filter(({ ownerId }) => ownerId !== viewerId);
    // Enemy off-map holdings and truck loads are not visible at all.
    if (group.location.kind !== 'ON_MAP' && friendly.length === 0) continue;
    // Off-map enemy holdings are not visible at all.
    const top = group.location.kind === 'ON_MAP' ? visibleEnemyTop(state, enemy) : [];
    stacks.push({
      location: { ...group.location },
      pieces: [
        ...stableSort(friendly, (left, right) => left.stackOrder - right.stackOrder).map((piece) => projectPiece(state, piece, false)),
        ...stableSort(top, (left, right) => left.stackOrder - right.stackOrder).map((piece) => projectPiece(state, piece, true)),
      ],
      hiddenCount: Math.max(0, enemy.length - top.length),
    });
  }
  return {
    stateRevision: state.revision,
    viewerId,
    sequence: { ...state.sequence },
    currentMoverId: state.currentMoverId !== null && state.pieceState.pieces.some(({ id, ownerId }) => id === state.currentMoverId && ownerId === viewerId)
      ? state.currentMoverId : null,
    breakdownAbsorptions: pendingAbsorptions(state, viewerId),
    stacks: stableSort(stacks, (left, right) => {
      const leftKey = stableKey([pieceLocationKey(left.location)]);
      const rightKey = stableKey([pieceLocationKey(right.location)]);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
    pendingDecision: state.pendingDecision?.ownerId === viewerId ? state.pendingDecision : null,
    victory: state.victory,
    // Who holds each objective is on the map for both players (the last side to enter a hex controls it).
    objectives: stableSort(state.configuration.objectives, (left, right) => String(left.hexId) < String(right.hexId) ? -1 : String(left.hexId) > String(right.hexId) ? 1 : 0)
      .map(({ hexId, points }) => ({ hexId, points, controllerId: state.mapState.hexControl.find((entry) => entry.hexId === hexId)?.controllerId ?? null })),
    combat: projectCombat(state),
    weather: state.weather,
    // Fuel markers and fueled Formation markers are on the map for both players to see.
    fuel: state.fuel,
    air: {
      // 14.9: what the viewer could fly from each base, only while it is his own Movement Segment.
      transport: state.sequence.actingPlayerId === viewerId && state.sequence.segment === 'MOVEMENT' && ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
        ? [...new Set(readyTransports(state, viewerId).map((plane) => String(plane.location.kind === 'ON_MAP' ? plane.location.hexId : '')))].map((hexId) => ({
          hexId,
          transports: readyTransports(state, viewerId).filter((plane) => plane.location.kind === 'ON_MAP' && plane.location.hexId === hexId).map((plane) => ({
            id: plane.id, definitionId: plane.definitionId, capacity: aircraftTransportCapacity(state, plane), range: aircraftRange(state, plane), integralGlider: hasIntegralGlider(state, plane),
          })),
          units: loadableUnits(state, viewerId, hexId as never).map(({ unit, cost }) => ({ id: unit.id, definitionId: unit.definitionId, cost })),
          dumps: baseDumps(state, viewerId, hexId as never).map((dump) => ({ id: dump.id, tokens: dump.resourceQuantity ?? 0 })),
        })) : [],
      dropPlans: state.air.dropPlans.filter((plan) => plan.ownerId === viewerId).map(({ id, unitIds, hexId, turn }) => ({ id, unitIds, hexId: String(hexId), turn })),
      earliestDropTurn: earliestPlanTurn(state),
      trainbusting: state.air.trainbusting,
      patrolZones: state.scenario.players.map(({ id }) => ({ playerId: id, hexIds: patrolZoneHexes(state, id) })).filter(({ hexIds }) => hexIds.length > 0),
      // 4.9a: only the viewer's own replacements and Dead Pile are shown.
      rebuilds: rebuildOptions(state, viewerId).map((option) => ({
        eqPieceId: option.eq.id, hqId: option.hq.id, hexId: String(option.eq.location.kind === 'ON_MAP' ? option.eq.location.hexId : ''), equipment: equipmentIn(option.eq),
        aircraft: option.aircraftIds.map((id) => {
          const plane = state.pieceState.pieces.find((entry) => entry.id === id)!;
          return { id, definitionId: plane.definitionId, steps: stepsToRebuild(plane), deadPile: plane.location.kind === 'ELIMINATED' };
        }),
        baseIds: option.baseIds,
      })),
      bases: state.pieceState.pieces.filter((piece) => piece.ownerId === viewerId && piece.location.kind === 'ON_MAP' && isAirBase(state, piece)).map((base) => {
        const hexId = base.location.kind === 'ON_MAP' ? base.location.hexId : null;
        const planes = state.pieceState.pieces.filter((piece) => piece.ownerId === viewerId && piece.location.kind === 'ON_MAP' && piece.location.hexId === hexId && isAircraft(state, piece));
        const active = planes.filter((piece) => isActiveAircraft(piece)).length;
        return { id: base.id, hexId: String(hexId), level: airBaseLevel(state, base), active, activeLimit: activeAircraftLimit(state, base), refitCapacity: refitCapacity(state, base), inactive: planes.length - active, refitBlockedByZoc: refitBlockedByZoc(state, base), offMap: false };
      }).concat(offMapAirfields(state, viewerId).map((field) => {
        // An off-map airfield has no hex (§6): its aircraft are in its box.
        const planes = aircraftAtAirfield(state, field);
        const active = planes.filter((piece) => isActiveAircraft(piece)).length;
        return { id: field.id, hexId: '', level: airBaseLevel(state, field), active, activeLimit: activeAircraftLimit(state, field), refitCapacity: refitCapacity(state, field), inactive: planes.length - active, refitBlockedByZoc: false, offMap: true };
      })),
    },
    // 4.9a: only the viewer's own Repls, Dead Pile and lost trucks are shown.
    replacements: {
      rebuilds: unitRebuildOptions(state, viewerId).map((option) => ({
        hexId: String(option.hexId), hqId: option.hq.id, pax: option.pax, eq: option.eq, truckPoints: option.truckPoints,
        units: option.units.map(({ piece, cost, missing, modes }) => ({ id: piece.id, definitionId: piece.definitionId, cost, missing, deadPile: piece.location.kind === 'ELIMINATED', modes })),
      })),
      lostTruckPoints: lostTruckPoints(state, viewerId),
    },
  };
};

/**
 * 4.9b/c: during a combat both players know each side's Action Rating difference, total strength
 * and the table used; during a barrage the barrage strength and column. Units are not identified.
 */
const projectCombat = (state: GameState): ProjectedCombat | null => {
  const transaction = state.activeTransaction;
  if (!transaction) return null;
  const defenderDecided = transaction.step !== 'ATTACKER_SUPPLY' && transaction.step !== 'DEFENDER_SUPPLY' && transaction.step !== 'BARRAGE_SUPPLY';
  const base = {
    kind: transaction.kind, targetHexId: transaction.targetHexId, attackerOwnerId: transaction.ownerId,
    attackerCount: transaction.attackerIds.length, defenderCount: transaction.defenderIds.length,
    result: transaction.result, rollTotal: transaction.roll?.total ?? null,
    surpriseTotal: transaction.surpriseRoll?.total ?? null, shiftDie: transaction.shiftDie,
    defenderSupplied: defenderDecided ? transaction.defenderSupplied || transaction.defenderInternalIds.length > 0 : null,
    air: null,
  };
  if (transaction.kind === 'AIR_MISSION' && transaction.air) {
    const air = transaction.air;
    const preview = air.target === 'COMBAT_UNITS' ? previewAirBarrage(state, transaction.ownerId, air.aircraft, transaction.targetHexId) : null;
    return {
      ...base, attackerCount: air.aircraft.length,
      attackerStrength: preview?.strength ?? 0, defenderStrength: null,
      odds: preview ? BARRAGE_TABLE_COLUMNS[preview.finalColumn]!.label : AIR_MISSION_LABELS[air.mission], line: null, drm: null,
      air: {
        mission: AIR_MISSION_LABELS[air.mission], target: air.target, stage: air.stage,
        aircraftNames: air.aircraft.map(({ pieceId }) => aircraftName(state, state.pieceState.pieces.find(({ id }) => id === pieceId))),
        log: air.log,
      },
    };
  }
  if (transaction.kind === 'BARRAGE') {
    const preview = previewBarrage(state, transaction.ownerId, transaction.attackerIds, transaction.targetHexId);
    return { ...base, attackerStrength: preview.strength, defenderStrength: null, odds: BARRAGE_TABLE_COLUMNS[preview.finalColumn]!.label, line: null, drm: null };
  }
  const supplied = !defenderDecided ? transaction.defenderIds
    : transaction.defenderSupplied ? transaction.defenderIds : transaction.defenderInternalIds;
  const odds = calculateCombatOdds(state, transaction.attackerIds, transaction.defenderIds, transaction.targetHexId,
    supplied, transaction.leadAttackerId, transaction.leadDefenderId, transaction.defenderTerrainId);
  return { ...base, attackerStrength: odds.attackerStrength, defenderStrength: odds.defenderStrength, odds: odds.oddsText, line: odds.line, drm: odds.drm };
};

export const ruleQueryCacheKey = (
  state: GameState,
  actorId: PlayerId,
  purpose: string,
): string => stableKey([
  String(state.revision),
  String(state.mapState.revision),
  String(state.pieceState.revision),
  actorId,
  purpose,
  state.configuration.id,
]);

export interface RuleQueryCache {
  readonly getOrCompute: <T>(key: string, compute: () => T) => T;
  readonly size: () => number;
}

export const createRuleQueryCache = (enabled: boolean): RuleQueryCache => {
  const values = new Map<string, unknown>();
  return Object.freeze({
    getOrCompute: <T>(key: string, compute: () => T): T => {
      if (!enabled) return compute();
      if (values.has(key)) return values.get(key) as T;
      const value = compute();
      values.set(key, value);
      return value;
    },
    size: () => values.size,
  });
};
