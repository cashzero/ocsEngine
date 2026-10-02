import { stableSort, stableKey, type PlayerId } from '../../core/index.js';
import { pieceLocationKey, type PieceLocation } from '../../domain/map/index.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState } from '../kernel/model.js';
import { INTERNAL_STOCKS_STATUS, OUT_OF_TRACE_SINCE_STATUS, RETURN_TURN_STATUS, definitionOf, isCombatUnit } from '../pieces.js';
import { exertsZoc } from '../zoc/zoc.js';
import { calculateCombatOdds } from '../combat/strength.js';
import { previewBarrage } from '../combat/combat.js';
import { BARRAGE_TABLE_COLUMNS } from '../tables/ocs-4.3.js';
import type { PieceRole, ProjectedCombat, ProjectedPiece, ProjectedStack, RuleProjection } from './model.js';
import { AIR_MISSION_LABELS, previewAirBarrage } from '../air/mission.js';
import { aircraftName, isActiveAircraft, isAirBase, isAircraft, isFighter, patrolZoneHexes } from '../air/aircraft.js';

/** 4.9a: internal stocks and other private bookkeeping are never shown to the enemy. */
const PRIVATE_STATUSES: readonly string[] = [INTERNAL_STOCKS_STATUS, OUT_OF_TRACE_SINCE_STATUS, RETURN_TURN_STATUS];
/** Status values the enemy may read because they are printed on the counter itself. */
const PUBLIC_VALUE_STATUSES: readonly string[] = ['status:air-base-level', 'status:transport-points'];

/** What the counter is for, from its definition and where it is (not from which fields happen to be set). */
export const roleOf = (state: GameState, piece: PieceState): PieceRole => {
  const definition = definitionOf(state, piece);
  if (!definition) return 'OTHER';
  if (isAircraft(state, piece)) return 'AIRCRAFT';
  if (isAirBase(state, piece)) return 'AIR_BASE';
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
    stacks: stableSort(stacks, (left, right) => {
      const leftKey = stableKey([pieceLocationKey(left.location)]);
      const rightKey = stableKey([pieceLocationKey(right.location)]);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
    pendingDecision: state.pendingDecision?.ownerId === viewerId ? state.pendingDecision : null,
    victory: state.victory,
    combat: projectCombat(state),
    weather: state.weather,
    // Fuel markers and fueled Formation markers are on the map for both players to see.
    fuel: state.fuel,
    air: {
      trainbusting: state.air.trainbusting,
      patrolZones: state.scenario.players.map(({ id }) => ({ playerId: id, hexIds: patrolZoneHexes(state, id) })).filter(({ hexIds }) => hexIds.length > 0),
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
