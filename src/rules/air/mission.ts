import { damagePort } from '../port/port.js';
import { PORT_MAXIMUM_HITS, portAt } from '../port/state.js';
import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { barrageTargetShifts, hasCorrectSpotter, nextStackOrder, setModeForHex } from '../combat/combat.js';
import { parseRuleDecisionId, parseRuleTransactionId } from '../kernel/ids.js';
import type {
  AirCombatState,
  AirMissionKind,
  AirMissionState,
  AirReturn,
  GameAction,
  GameState,
  PendingDecision,
  RuleEvent,
  RuleTransaction,
  RuleViolation,
} from '../kernel/model.js';
import { rollDie, rollTwoDice } from '../kernel/rng.js';
import { enemyCombatUnitsAt, hexDistanceBetween, hexOf, isHq, opponentOf, pieceById, piecesAt } from '../pieces.js';
import {
  AIR_COMBAT_LOSS_MINIMUM,
  BARRAGE_TABLE_COLUMNS,
  BARRAGE_TABLE_ROWS,
  FACILITY_TABLE_COLUMNS,
  FACILITY_TABLE_ROWS,
  FLAK_HIT_MINIMUM,
  FLAK_MODIFIERS,
  MISSION_LOSS_TABLE,
  PATROL_ZONE_HEXES,
  SHORT_RANGE_HEXES,
  airCombatResult,
  barrageColumnIndex,
  facilityColumnIndex,
  parseBarrageResult,
  parseFacilityResult,
  roundOcs,
} from '../tables/ocs-4.3.js';
import { violation } from '../validation/violation.js';
import { settleInterrupts } from '../lifecycle/interrupts.js';
import { applyCargoLoss, cargoLoss, isTransportMission, resolveCargo, routeFlight, routeReach, routeStays, startingCargo, transportTargets, validateTransportMission } from './transport.js';
import {
  activeAircraftAt,
  activeAircraftLimit,
  airBaseAt,
  airDistance,
  OFF_MAP_AIRFIELD_DISTANCE,
  airLaunchHex,
  aircraftAtAirfield,
  atOffMapAirfield,
  offMapAirfields,
  airBaseLevel,
  airCombatRating,
  aircraftAt,
  aircraftBarrageStrength,
  aircraftName,
  aircraftRange,
  friendlyAirBaseAt,
  friendlyAirBases,
  hasParenthesizedRating,
  inPatrolZoneOf,
  isActiveAircraft,
  isAircraft,
  isAirStrip,
  isFighter,
  isStrategicBomber,
  mayHipShoot,
  withAircraftActive,
  withAirBaseLevel,
} from './aircraft.js';

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type AirMissionDeclaration = Extract<GameAction, { readonly kind: 'DECLARE_AIR_MISSION' }>;

const renumber = (events: readonly RuleEvent[]): RuleEvent[] => events.map((event, index) => ({ ...event, sequence: index }));

export const AIR_MISSION_LABELS: Readonly<Record<AirMissionKind, string>> = {
  FIGHTER_SWEEP: 'Fighter Sweep',
  BARRAGE: 'Air Barrage',
  HIP_SHOOT: 'Hip Shoot',
  TRAINBUSTING: 'Trainbusting',
  BASE_TRANSFER: 'Base Transfer',
  AIR_TRANSPORT: 'Air Transport',
  AIR_DROP: 'Air Drop',
};

/** 14.2e, 14.6-14.11: the segment in which each mission is flown. */
export const missionSegment = (mission: AirMissionKind): 'MOVEMENT' | 'BARRAGE' =>
  mission === 'BARRAGE' || mission === 'TRAINBUSTING' ? 'BARRAGE' : 'MOVEMENT';

/** 14.1g: Active planes fly missions in friendly Movement, Exploitation, and Reaction Phases. */
const AIR_PHASES = ['MOVEMENT', 'REACTION', 'EXPLOITATION'];

const enemyAirBaseAt = (state: GameState, playerId: PlayerId, hexId: HexId): PieceState | undefined => {
  const base = airBaseAt(state, hexId);
  return base && base.ownerId !== playerId ? base : undefined;
};

const trainbustingAt = (state: GameState, hexId: HexId) => state.air.trainbusting.find((marker) => marker.hexId === hexId);

/** Total Barrage Strength of the mission aircraft (14.7, 10.0). */
export const missionBarrageStrength = (state: GameState, aircraftIds: readonly PieceId[]): number =>
  roundOcs(aircraftIds.flatMap((id) => pieceById(state, id) ?? []).reduce((total, piece) => total + aircraftBarrageStrength(state, piece), 0));

/**
 * 14.1f and the game-specific Weather Table: None allows no mission; Limited allows missions only in the flying
 * player's Regular Movement Phase and no Hip Shoots. Interception is never limited by weather (14.4).
 */
export const flightWeatherViolation = (state: GameState, mission: AirMissionKind): RuleViolation | null => {
  const { flight } = state.weather;
  if (flight === 'NONE') return violation('NO_FLIGHT_WEATHER', ['sequence'], 'Weather allows no air missions this Game Turn; aircraft stay Active and may refit.', '14.1f');
  if (flight === 'LIMITED' && state.sequence.phase !== 'MOVEMENT') return violation('LIMITED_FLIGHT_WEATHER', ['sequence'], 'Limited flying weather allows air missions only in your Regular Movement Phase.', '14.1f');
  if (flight === 'LIMITED' && mission === 'HIP_SHOOT') return violation('LIMITED_FLIGHT_WEATHER', ['mission'], 'Limited flying weather does not allow Hip Shoots.', '14.1f');
  return null;
};

export const validateAirMission = (state: GameState, action: AirMissionDeclaration): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const { phase, segment } = state.sequence;
  if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the player acting in this phase flies missions.', '14.1g'));
  if (!AIR_PHASES.includes(phase)) issues.push(violation('INVALID_AIR_PHASE', ['sequence'], 'Air missions are flown in friendly Movement, Reaction, and Exploitation Phases.', '14.1g'));
  else if (flightWeatherViolation(state, action.mission)) {
    issues.push(flightWeatherViolation(state, action.mission)!);
  } else if (segment !== missionSegment(action.mission)) {
    issues.push(violation('INVALID_AIR_SEGMENT', ['sequence'], missionSegment(action.mission) === 'BARRAGE'
      ? `${AIR_MISSION_LABELS[action.mission]} missions are flown in Barrage Segments.`
      : `${AIR_MISSION_LABELS[action.mission]} missions are flown in Movement Segments.`, action.mission === 'HIP_SHOOT' ? '14.7d' : '14.2e'));
  }
  if (!state.scenario.mapDefinition.hexes.some(({ id }) => id === action.targetHexId)) {
    return [...issues, violation('UNKNOWN_MISSION_HEX', ['targetHexId'], 'The mission hex is not on the map.', '14.2d')];
  }
  if (action.aircraftIds.length === 0 || new Set(action.aircraftIds).size !== action.aircraftIds.length) {
    return [...issues, violation('INVALID_MISSION_AIRCRAFT', ['aircraftIds'], 'A mission needs a non-empty list of distinct aircraft.', '14.2a')];
  }
  if (action.aircraftIds.length > 4) issues.push(violation('TOO_MANY_MISSION_AIRCRAFT', ['aircraftIds'], 'At most four aircraft fly a mission together.', '14.2a'));
  const aircraft = action.aircraftIds.map((id) => pieceById(state, id));
  if (aircraft.some((piece) => !piece || !isAircraft(state, piece))) {
    return [...issues, violation('UNKNOWN_MISSION_AIRCRAFT', ['aircraftIds'], 'Every mission aircraft must be an air unit.', '14.1')];
  }
  const pieces = aircraft as PieceState[];
  const transfer = action.mission === 'BASE_TRANSFER';
  for (const [index, piece] of pieces.entries()) {
    const path = ['aircraftIds', index];
    const name = aircraftName(state, piece);
    const hexId = hexOf(piece);
    if (piece.ownerId !== action.actorId) issues.push(violation('NOT_PIECE_OWNER', path, `${name} is not yours.`, '14.2'));
    if ((!hexId || !friendlyAirBaseAt(state, piece.ownerId, hexId)) && !atOffMapAirfield(state, piece)) issues.push(violation('AIRCRAFT_NOT_AT_BASE', path, `${name} is not at a friendly Air Base.`, '14.2c'));
    if (atOffMapAirfield(state, piece) && airLaunchHex(state, piece, action.targetHexId) === null) issues.push(violation('NO_AIR_ENTRY_POINT', path, `${name} needs a friendly Air Entry Point (AEP) on this map.`, 'game-specific'));
    if (transfer && atOffMapAirfield(state, piece)) issues.push(violation('OFF_MAP_AIRFIELD_TRANSFER', path, `${name} is based off the map and stays there.`, 'game-specific'));
    if (!isActiveAircraft(piece)) issues.push(violation('AIRCRAFT_INACTIVE', path, `${name} is Inactive and must refit first.`, '14.1a'));
    if (state.air.missionFlownIds.includes(piece.id)) issues.push(violation('AIRCRAFT_ALREADY_FLEW', path, `${name} already flew a mission this phase.`, '14.2e'));
    const range = aircraftRange(state, piece) * (transfer ? 2 : 1);
    // A Transport's range depends on how it flies (14.9e), which the cargo checks below validate.
    if (!isTransportMission(action.mission) && airDistance(state, piece, action.targetHexId) > range) {
      issues.push(violation('MISSION_OUT_OF_RANGE', path, `${name} has a range of ${range} hexes${transfer ? ' for a transfer' : ''}.`, transfer ? '14.11' : '14.2d'));
    }
  }
  const strength = missionBarrageStrength(state, action.aircraftIds);
  const barrage = action.mission === 'BARRAGE' || action.mission === 'HIP_SHOOT';
  if (barrage) {
    if (action.target === null) issues.push(violation('BARRAGE_TARGET_REQUIRED', ['target'], 'Announce whether the barrage attacks combat units or the Air Base.', '10.0d'));
    if (action.target === 'COMBAT_UNITS' && enemyCombatUnitsAt(state, action.actorId, action.targetHexId).length === 0) {
      issues.push(violation('NO_BARRAGE_TARGET', ['targetHexId'], 'There are no enemy combat units in the hex.', '10.0a'));
    }
    if (action.target === 'AIR_BASE' && !enemyAirBaseAt(state, action.actorId, action.targetHexId)) {
      issues.push(violation('NO_AIR_BASE_TARGET', ['targetHexId'], 'There is no enemy Air Base in the hex.', '10.0c'));
    }
    if (action.target === 'PORT' && !enemyPortTarget(state, action.actorId, action.targetHexId)) {
      issues.push(violation('NO_PORT_TARGET', ['targetHexId'], 'There is no enemy port with hits left to take in the hex.', '10.0c'));
    }
  } else if (action.target !== null) {
    issues.push(violation('UNEXPECTED_BARRAGE_TARGET', ['target'], 'Only barrage missions announce a target type.', '10.0d'));
  }
  if (!isTransportMission(action.mission) && action.cargo) issues.push(violation('UNEXPECTED_CARGO', ['cargo'], 'Only Air Transport and Air Drop carry cargo.', '14.9'));
  if (barrage || action.mission === 'TRAINBUSTING') {
    if (strength < 1) issues.push(violation('BARRAGE_STRENGTH_TOO_LOW', ['aircraftIds'], 'It takes at least one Barrage Strength point to get on the table.', '10.0'));
  }
  if ((action.mission === 'BARRAGE' || action.mission === 'TRAINBUSTING') && state.ledger.barragedHexIds.includes(action.targetHexId)) {
    issues.push(violation('HEX_ALREADY_BARRAGED', ['targetHexId'], 'Only one barrage per hex is allowed each phase.', '10.0e'));
  }
  switch (action.mission) {
    case 'FIGHTER_SWEEP':
      if (activeAircraftAt(state, opponentOf(state, action.actorId), action.targetHexId).length === 0) {
        issues.push(violation('NO_ENEMY_AIRCRAFT', ['targetHexId'], 'A Fighter Sweep goes to a hex with Active enemy aircraft.', '14.6'));
      }
      break;
    case 'HIP_SHOOT':
      if (pieces.length !== 1) issues.push(violation('HIP_SHOOT_SINGLE_AIRCRAFT', ['aircraftIds'], 'A Hip Shoot is made by a single aircraft.', '14.7dB'));
      if (pieces.some((piece) => !mayHipShoot(state, piece))) issues.push(violation('HIP_SHOOT_NOT_ALLOWED', ['aircraftIds'], 'This air force is not listed by the game rules as able to Hip Shoot.', '14.7dB'));
      if (pieces.some((piece) => isStrategicBomber(state, piece))) issues.push(violation('STRATEGIC_BOMBER_HIP_SHOOT', ['aircraftIds'], 'Strategic Bombers never Hip Shoot.', '14.1eB'));
      if (!hasCorrectSpotter(state, action.actorId, action.targetHexId)) issues.push(violation('HIP_SHOOT_NEEDS_SPOTTER', ['targetHexId'], 'A Hip Shoot requires a friendly combat unit adjacent to the target.', '14.7dC'));
      break;
    case 'TRAINBUSTING':
      if (trainbustingAt(state, action.targetHexId)) issues.push(violation('TRAINBUSTING_MARKER_PRESENT', ['targetHexId'], 'Only one Trainbusting marker can be placed in a hex.', '14.8'));
      break;
    case 'BASE_TRANSFER': {
      const destination = friendlyAirBaseAt(state, action.actorId, action.targetHexId);
      if (!destination) issues.push(violation('TRANSFER_NEEDS_FRIENDLY_BASE', ['targetHexId'], 'A Base Transfer goes to another friendly Air Base.', '14.11'));
      if (pieces.some((piece) => hexOf(piece) === action.targetHexId)) issues.push(violation('TRANSFER_TO_SAME_BASE', ['targetHexId'], 'The aircraft are already at that base.', '14.11'));
      if (destination) {
        const staying = pieces.filter((piece) => staysActiveOnTransfer(state, piece, action.targetHexId)).length;
        if (activeAircraftAt(state, action.actorId, action.targetHexId).length + staying > activeAircraftLimit(state, destination)) {
          issues.push(violation('DESTINATION_ACTIVE_LIMIT', ['targetHexId'], `The destination base can hold ${activeAircraftLimit(state, destination)} Active aircraft.`, '14.2a'));
        }
      }
      break;
    }
    case 'AIR_TRANSPORT':
    case 'AIR_DROP':
      issues.push(...validateTransportMission(state, action, pieces));
      break;
    case 'BARRAGE':
      break;
  }
  return issues;
};

/** 14.11: a Fighter transferring within its normal range stays Active. */
const staysActiveOnTransfer = (state: GameState, piece: PieceState, destination: HexId): boolean =>
  isFighter(state, piece) && hexOf(piece) !== null && hexDistanceBetween(hexOf(piece)!, destination) <= aircraftRange(state, piece);

const transactionIdFor = (actionId: string) => {
  const parsed = parseRuleTransactionId(`transaction:${actionId}`);
  if (!parsed.ok) throw new Error('Generated air transaction ID is invalid.');
  return parsed.value;
};

const withAir = (state: GameState, patch: Partial<AirMissionState>): GameState => {
  const transaction = state.activeTransaction!;
  return { ...state, activeTransaction: { ...transaction, air: { ...transaction.air!, ...patch } } };
};

const airOf = (state: GameState): AirMissionState => state.activeTransaction!.air!;

const logLine = (state: GameState, line: string): GameState => withAir(state, { log: [...airOf(state).log, line] });

export const declareAirMission = (state: GameState, action: AirMissionDeclaration): Transition => {
  const opponent = opponentOf(state, action.actorId);
  const names = action.aircraftIds.map((id) => aircraftName(state, pieceById(state, id))).join(', ');
  const transaction: RuleTransaction = {
    id: transactionIdFor(action.actionId),
    kind: 'AIR_MISSION',
    step: 'AIR_MISSION',
    ownerId: action.actorId,
    defenderOwnerId: opponent,
    originRevision: state.revision,
    attackerIds: [...action.aircraftIds],
    defenderIds: action.target === 'COMBAT_UNITS' ? enemyCombatUnitsAt(state, action.actorId, action.targetHexId).map(({ id }) => id) : [],
    targetHexId: action.targetHexId,
    leadAttackerId: null,
    leadDefenderId: null,
    attackerPayments: [],
    defenderPayments: [],
    payment: null,
    attackerInternalIds: [],
    defenderSupplied: false,
    defenderInternalIds: [],
    defenderTerrainId: null,
    surpriseRoll: null,
    shiftDie: null,
    roll: null,
    result: null,
    queue: [],
    lossLedger: [],
    attackerRetreated: false,
    blockedHexIds: [],
    air: {
      mission: action.mission,
      target: action.target,
      stage: 'AIR_COMBAT',
      // An off-map airfield's aircraft count from the map-edge hex they fly in over.
      aircraft: action.aircraftIds.map((pieceId) => ({ pieceId, baseHexId: airLaunchHex(state, pieceById(state, pieceId)!, action.targetHexId)! })),
      combat: null,
      interceptorId: null,
      interceptionOffered: false,
      flakTotal: null,
      targetLosses: 0,
      returns: [],
      log: [`${AIR_MISSION_LABELS[action.mission]} on ${action.targetHexId}: ${names}.`],
      cargo: startingCargo(state, action),
    },
  };
  // 10.0eA: a declared barrage counts against the hex limit even if Flak or Interception stops it.
  const countsAsBarrage = action.mission === 'BARRAGE' || action.mission === 'TRAINBUSTING';
  const next: GameState = {
    ...state,
    activeTransaction: transaction,
    currentMoverId: null,
    movingStackIds: undefined,
    ledger: countsAsBarrage ? { ...state.ledger, barragedHexIds: [...state.ledger.barragedHexIds, action.targetHexId] } : state.ledger,
    air: { ...state.air, missionFlownIds: [...state.air.missionFlownIds, ...action.aircraftIds] },
  };
  const events: RuleEvent[] = [{ kind: 'TRANSACTION_DECLARED', sequence: 0, transactionId: transaction.id, transactionKind: 'AIR_MISSION' }];
  const settled = continueAirMission(next);
  return { state: settled.state, events: renumber([...events, ...settled.events]) };
};

// ─── Aircraft state changes ──────────────────────────────────────────────────────────────────────

const setActive = (state: GameState, pieceId: PieceId, active: boolean, events: RuleEvent[]): GameState => {
  const piece = pieceById(state, pieceId);
  if (!piece || !based(state, piece) || isActiveAircraft(piece) === active) return state;
  events.push({ kind: 'AIRCRAFT_STATUS_CHANGED', sequence: events.length, pieceId, active, hexId: hexOf(piece) });
  return { ...state, pieceState: upsertPieceState(state.pieceState, withAircraftActive(piece, active)) };
};

/** 14.1b: two steps; the second loss sends the aircraft to the Dead Pile. */
const aircraftStepLoss = (state: GameState, pieceId: PieceId, events: RuleEvent[]): GameState => {
  const piece = pieceById(state, pieceId);
  if (!piece || !based(state, piece)) return state;
  const remaining = (piece.remainingSteps ?? 1) - 1;
  events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId, remainingSteps: remaining > 0 ? remaining : null });
  return {
    ...state,
    pieceState: upsertPieceState(state.pieceState, remaining > 0 ? { ...piece, remainingSteps: remaining } : { ...piece, location: { kind: 'ELIMINATED' } }),
  };
};

/** An aircraft still in play: on the map, or at its off-map airfield. */
const based = (state: GameState, piece: PieceState): boolean => piece.location.kind === 'ON_MAP' || atOffMapAirfield(state, piece);
const alive = (state: GameState, pieceId: PieceId): boolean => { const piece = pieceById(state, pieceId); return piece !== undefined && based(state, piece); };

const isMissionAircraft = (state: GameState, pieceId: PieceId): boolean => airOf(state).aircraft.some((entry) => entry.pieceId === pieceId);

/** A mission aircraft leaves the mission and must return to base (14.1c). */
const abortMissionAircraft = (state: GameState, pieceId: PieceId): GameState => {
  const air = airOf(state);
  if (!alive(state, pieceId)) return withAir(state, { aircraft: air.aircraft.filter((entry) => entry.pieceId !== pieceId) });
  const owner = pieceById(state, pieceId)!.ownerId;
  // 14.1c: aircraft aborting over a friendly Air Base must return to that base.
  const required = friendlyAirBaseAt(state, owner, state.activeTransaction!.targetHexId) ? state.activeTransaction!.targetHexId : null;
  return withAir(state, {
    aircraft: air.aircraft.filter((entry) => entry.pieceId !== pieceId),
    returns: [...air.returns, {
      pieceId, fromHexId: state.activeTransaction!.targetHexId, originHexId: air.aircraft.find((entry) => entry.pieceId === pieceId)?.baseHexId,
      requiredHexId: required, staysActive: false,
    }],
  });
};

/** An aborted aircraft: mission aircraft return to base; others become Inactive where they are (14.1c, 14.5). */
const applyAbort = (state: GameState, pieceId: PieceId, events: RuleEvent[]): GameState =>
  isMissionAircraft(state, pieceId) ? abortMissionAircraft(state, pieceId) : setActive(state, pieceId, false, events);

// ─── Decisions ──────────────────────────────────────────────────────────────────────────────────

const decisionFor = (state: GameState, kind: PendingDecision['kind'], ownerId: PlayerId, prompt: string, options: PendingDecision['options']): PendingDecision => {
  const air = airOf(state);
  const parsed = parseRuleDecisionId(`decision:${state.activeTransaction!.id}:${kind}:${state.revision}:${state.rng.draws}:${air.aircraft.length}:${air.returns.length}:${air.combat?.round ?? 0}:${air.combat?.missionSideIds.length ?? 0}:${air.combat?.opposingSideIds.length ?? 0}`);
  if (!parsed.ok) throw new Error('Generated air decision ID is invalid.');
  return { id: parsed.value, kind, ownerId, transactionId: state.activeTransaction!.id, prompt, options };
};

const ask = (state: GameState, events: RuleEvent[], decision: PendingDecision): Transition => {
  events.push({ kind: 'DECISION_REQUESTED', sequence: events.length, decision });
  return { state: { ...state, pendingDecision: decision }, events };
};

const ratingLabel = (state: GameState, piece: PieceState): string => {
  const rating = airCombatRating(state, piece);
  return `${aircraftName(state, piece)} (Air Combat ${hasParenthesizedRating(state, piece) ? `(${rating})` : rating}${piece.remainingSteps === 1 ? ', reduced' : ''})`;
};

// ─── Air Combat (14.3) and Interception (14.5) ───────────────────────────────────────────────────

const withCombat = (state: GameState, patch: Partial<AirCombatState> | null): GameState =>
  withAir(state, { combat: patch === null ? null : { ...airOf(state).combat!, ...patch } });

const fighting = (state: GameState, ids: readonly PieceId[]): readonly PieceId[] =>
  ids.filter((id) => { const piece = pieceById(state, id); return piece !== undefined && based(state, piece) && isActiveAircraft(piece); });

const sideOf = (state: GameState, combat: AirCombatState, playerId: PlayerId): readonly PieceId[] =>
  playerId === state.activeTransaction!.ownerId ? combat.missionSideIds : combat.opposingSideIds;

/** The initiating player is the attacker unless only he has parenthesized ratings (14.3c). */
const combatRoles = (state: GameState, combat: AirCombatState): { attacker: PlayerId; defender: PlayerId } | null => {
  const other = opponentOf(state, combat.attackerId);
  const canInitiate = (playerId: PlayerId) => sideOf(state, combat, playerId).some((id) => !hasParenthesizedRating(state, pieceById(state, id)!));
  if (canInitiate(combat.attackerId)) return { attacker: combat.attackerId, defender: other };
  if (canInitiate(other)) return { attacker: other, defender: combat.attackerId };
  return null;
};

const finishCombat = (state: GameState): GameState => {
  const air = airOf(state);
  const combat = air.combat!;
  let next = withAir(state, { combat: null, stage: combat.context === 'MISSION_HEX' ? 'INTERCEPTION' : 'FLAK' });
  if (combat.context === 'INTERCEPTION' && air.interceptorId !== null) {
    const interceptor = pieceById(next, air.interceptorId);
    // 14.5: a winning interceptor stays Active and may intercept again; a loser became Inactive when it aborted.
    next = logLine(next, interceptor?.location.kind === 'ON_MAP' && isActiveAircraft(interceptor)
      ? `${aircraftName(next, interceptor)} wins the interception and stays Active.`
      : 'The interceptor was driven off.');
  }
  return next;
};

const airCombatStep = (input: GameState, events: RuleEvent[]): Transition | GameState => {
  let state = input;
  const combat = airOf(state).combat!;
  const missionSide = fighting(state, combat.missionSideIds);
  const opposingSide = fighting(state, combat.opposingSideIds);
  if (missionSide.length !== combat.missionSideIds.length || opposingSide.length !== combat.opposingSideIds.length) {
    return withCombat(state, { missionSideIds: missionSide, opposingSideIds: opposingSide });
  }
  if (missionSide.length === 0 || opposingSide.length === 0) return finishCombat(state);
  // 14.3d A: before the first round each player may abort some aircraft, keeping at least one.
  if (combat.round === 0 && combat.abortsPending.length > 0) {
    const [player, ...rest] = combat.abortsPending;
    const own = sideOf(state, combat, player!);
    if (own.length <= 1) return withCombat(state, { abortsPending: rest });
    const enemy = sideOf(state, combat, opponentOf(state, player!)).map((id) => aircraftName(state, pieceById(state, id)));
    return ask(state, events, decisionFor(state, 'AIR_ABORT', player!,
      `Air Combat over ${state.activeTransaction!.targetHexId} against ${enemy.join(', ')}: abort any aircraft before it starts? At least one must stay and fight.`,
      [
        { id: 'fight', label: `Fight with all ${own.length} aircraft`, hexId: null },
        ...own.map((id) => ({ id: `abort:${id}`, label: `Abort ${ratingLabel(state, pieceById(state, id)!)}`, hexId: null })),
      ]));
  }
  const roles = combatRoles(state, combat);
  if (!roles) {
    // 14.3a/c: only parenthesized ratings remain; the aircraft ignore each other.
    return logLine(finishCombat(state), 'Only aircraft with parenthesized ratings remain; they ignore each other.');
  }
  const attackerSide = sideOf(state, combat, roles.attacker);
  const defenderSide = sideOf(state, combat, roles.defender);
  if (combat.attackerPickId === null || !attackerSide.includes(combat.attackerPickId)) {
    // 14.3e B: the attacker selects one of his non-parenthesized aircraft.
    const choices = attackerSide.filter((id) => !hasParenthesizedRating(state, pieceById(state, id)!));
    if (choices.length === 1) return withCombat(state, { attackerPickId: choices[0]! });
    return ask(state, events, decisionFor(state, 'AIR_COMBAT_PICK', roles.attacker,
      `Air Combat round ${combat.round + 1} over ${state.activeTransaction!.targetHexId}: choose your attacking aircraft.`,
      choices.map((id) => ({ id: `pick:${id}`, label: ratingLabel(state, pieceById(state, id)!), hexId: null }))));
  }
  // 14.3e B: then the defender selects any of his aircraft.
  if (defenderSide.length > 1) {
    const attacker = pieceById(state, combat.attackerPickId)!;
    return ask(state, events, decisionFor(state, 'AIR_COMBAT_PICK', roles.defender,
      `Air Combat round ${combat.round + 1}: ${ratingLabel(state, attacker)} attacks. Choose the aircraft that meets it.`,
      defenderSide.map((id) => ({ id: `meet:${id}`, label: ratingLabel(state, pieceById(state, id)!), hexId: null }))));
  }
  state = resolveRound(state, combat.attackerPickId, defenderSide[0]!, events);
  return state;
};

/** 14.3e C: 2d6 + attacker rating - defender rating on the Air Combat Table, then the loss die. */
const resolveRound = (input: GameState, attackerPieceId: PieceId, defenderPieceId: PieceId, events: RuleEvent[]): GameState => {
  let state = input;
  const attacker = pieceById(state, attackerPieceId)!;
  const defender = pieceById(state, defenderPieceId)!;
  const roll = rollTwoDice(state.rng);
  const lossDie = rollDie(roll.rng);
  state = { ...state, rng: lossDie.rng };
  const modified = roll.roll.total + airCombatRating(state, attacker) - airCombatRating(state, defender);
  const result = airCombatResult(modified);
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: state.activeTransaction!.id, purpose: 'AIR_COMBAT', roll: roll.roll });
  events.push({ kind: 'AIR_COMBAT_ROUND', sequence: events.length, attackerPieceId, defenderPieceId, modifiedRoll: modified, result, lossDie: lossDie.value });
  const aborted = result === 'ATTACKER_ABORTS' ? [attackerPieceId] : result === 'DEFENDER_ABORTS' ? [defenderPieceId] : [attackerPieceId, defenderPieceId];
  const loss = lossDie.value >= AIR_COMBAT_LOSS_MINIMUM;
  const resultText = result === 'BOTH_ABORT' ? 'both abort' : `${aircraftName(state, result === 'ATTACKER_ABORTS' ? attacker : defender)} aborts`;
  state = logLine(state, `${aircraftName(state, attacker)} vs ${aircraftName(state, defender)}: ${modified} (roll ${roll.roll.total}), ${resultText}${loss ? ' and loses a step' : ''}.`);
  for (const id of aborted) {
    if (loss) state = aircraftStepLoss(state, id, events);
    state = applyAbort(state, id, events);
  }
  const combat = airOf(state).combat!;
  return withCombat(state, {
    missionSideIds: combat.missionSideIds.filter((id) => !aborted.includes(id)),
    opposingSideIds: combat.opposingSideIds.filter((id) => !aborted.includes(id)),
    attackerPickId: null,
    round: combat.round + 1,
  });
};

/** Active aircraft of the mission player at the mission hex that are not on the mission (14.4d). */
const nonMissionAircraft = (state: GameState): readonly PieceId[] => {
  const transaction = state.activeTransaction!;
  return activeAircraftAt(state, transaction.ownerId, transaction.targetHexId)
    .map(({ id }) => id).filter((id) => !isMissionAircraft(state, id));
};

const startMissionHexCombat = (state: GameState): GameState | null => {
  const transaction = state.activeTransaction!;
  const enemy = activeAircraftAt(state, transaction.defenderOwnerId, transaction.targetHexId).map(({ id }) => id);
  const mission = airOf(state).aircraft.map(({ pieceId }) => pieceId).filter((id) => alive(state, id));
  if (enemy.length === 0 || mission.length === 0) return null;
  return withAir(state, {
    combat: {
      context: 'MISSION_HEX', attackerId: transaction.ownerId,
      missionSideIds: [...mission, ...nonMissionAircraft(state)], opposingSideIds: enemy,
      abortsPending: [transaction.ownerId, transaction.defenderOwnerId], attackerPickId: null, round: 0,
    },
  });
};

/** 14.4a: missions subject to Flak (and therefore to Interception, 14.5). */
const subjectToFlak = (state: GameState): boolean => {
  const transaction = state.activeTransaction!;
  switch (airOf(state).mission) {
    case 'BARRAGE':
    case 'HIP_SHOOT':
    case 'TRAINBUSTING': return true;
    // 14.4a: Air Transport, Air Drop and Base Transfer roll Flak only inside an enemy Patrol Zone.
    case 'AIR_TRANSPORT':
    case 'AIR_DROP':
    case 'BASE_TRANSFER': return inPatrolZoneOf(state, transaction.defenderOwnerId, transaction.targetHexId);
    case 'FIGHTER_SWEEP': return false;
  }
};

/** 14.5: Active Fighters whose base's Patrol Zone covers the mission hex. */
export const interceptorsFor = (state: GameState): readonly PieceState[] => {
  const transaction = state.activeTransaction!;
  const target = transaction.targetHexId;
  return friendlyAirBases(state, transaction.defenderOwnerId)
    .filter((base) => hexDistanceBetween(hexOf(base)!, target) <= PATROL_ZONE_HEXES)
    .flatMap((base) => activeAircraftAt(state, transaction.defenderOwnerId, hexOf(base)!))
    .filter((piece) => isFighter(state, piece) && aircraftRange(state, piece) >= hexDistanceBetween(hexOf(piece)!, target)
      && !state.air.missionFlownIds.includes(piece.id))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
};

const startInterception = (state: GameState, interceptorId: PieceId): GameState => {
  const transaction = state.activeTransaction!;
  const mission = airOf(state).aircraft.map(({ pieceId }) => pieceId).filter((id) => alive(state, id));
  return logLine(withAir(state, {
    interceptorId,
    combat: {
      context: 'INTERCEPTION', attackerId: transaction.defenderOwnerId,
      missionSideIds: [...mission, ...nonMissionAircraft(state)], opposingSideIds: [interceptorId],
      // 14.3d: voluntary aborts are made before any Air Combat, including an Interception.
      abortsPending: [transaction.defenderOwnerId, transaction.ownerId], attackerPickId: null, round: 0,
    },
  }), `${aircraftName(state, pieceById(state, interceptorId))} intercepts.`);
};

// ─── Flak (14.4) ────────────────────────────────────────────────────────────────────────────────

export interface FlakModifier { readonly reason: string; readonly value: number }

/** 14.4e Flak Roll Modifiers for the current mission aircraft. */
export const flakModifiers = (state: GameState, aircraftIds: readonly PieceId[], mission: AirMissionKind, targetHexId: HexId, ownerId: PlayerId): readonly FlakModifier[] => {
  const defender = opponentOf(state, ownerId);
  const modifiers: FlakModifier[] = [];
  if (aircraftIds.length >= 3) modifiers.push({ reason: 'Three or more aircraft', value: FLAK_MODIFIERS.threeOrMoreAircraft });
  if (piecesAt(state, targetHexId).some((piece) => piece.ownerId === defender && isHq(state, piece))) modifiers.push({ reason: 'HQ in the target hex', value: FLAK_MODIFIERS.headquarters });
  const base = enemyAirBaseAt(state, ownerId, targetHexId);
  if (base && airBaseLevel(state, base) > 0) modifiers.push({ reason: `Air Base Level ${airBaseLevel(state, base)}`, value: airBaseLevel(state, base) });
  if (inPatrolZoneOf(state, defender, targetHexId)) {
    const fighter = aircraftIds.some((id) => { const piece = pieceById(state, id); return piece !== undefined && isFighter(state, piece); });
    modifiers.push(fighter
      ? { reason: 'Enemy Patrol Zone, mission has a Fighter', value: FLAK_MODIFIERS.patrolZoneWithFighter }
      : { reason: 'Enemy Patrol Zone, mission has no Fighter', value: FLAK_MODIFIERS.patrolZoneWithoutFighter });
    if (mission === 'TRAINBUSTING') modifiers.push({ reason: 'Trainbusting in a Patrol Zone', value: FLAK_MODIFIERS.patrolZoneTrainbusting });
  }
  return modifiers;
};

/** 14.4f Mission Loss Table: the aircraft that may take the Flak loss. Several candidates are a tie for the owner. */
const missionLossCandidates = (state: GameState, die: number): readonly PieceId[] => {
  const ids = airOf(state).aircraft.map(({ pieceId }) => pieceId);
  if (ids.length === 1) return ids;
  const entry = MISSION_LOSS_TABLE[ids.length as 2 | 3 | 4][die - 1]!;
  if (entry.startsWith('#')) return [ids[Number(entry.slice(1)) - 1]!];
  const strengths = ids.map((id) => aircraftBarrageStrength(state, pieceById(state, id)!));
  const wanted = entry === 'W' ? Math.min(...strengths) : Math.max(...strengths);
  return ids.filter((_, index) => strengths[index] === wanted);
};

const rollFlak = (input: GameState, events: RuleEvent[]): Transition | GameState => {
  let state = input;
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  const ids = air.aircraft.map(({ pieceId }) => pieceId);
  const modifiers = flakModifiers(state, ids, air.mission, transaction.targetHexId, transaction.ownerId);
  const roll = rollTwoDice(state.rng);
  state = { ...state, rng: roll.rng };
  const total = roll.roll.total + modifiers.reduce((sum, { value }) => sum + value, 0);
  const hit = total >= FLAK_HIT_MINIMUM;
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'FLAK', roll: roll.roll });
  events.push({ kind: 'FLAK_ROLLED', sequence: events.length, modifiedRoll: total, hit });
  state = logLine(withAir(state, { flakTotal: total }), `Flak: ${total} (roll ${roll.roll.total}${modifiers.map(({ value }) => ` +${value}`).join('')})${hit ? ', one mission aircraft step is lost' : ', no effect'}.`);
  if (!hit) return withAir(state, { stage: 'RESOLVE' });
  const die = rollDie(state.rng);
  state = { ...state, rng: die.rng };
  const candidates = missionLossCandidates(state, die.value);
  if (candidates.length === 1) return withAir(flakLoss(state, candidates[0]!, events), { stage: 'RESOLVE' });
  return ask(state, events, decisionFor(state, 'MISSION_LOSS', transaction.ownerId,
    `Flak hits the mission (Mission Loss die ${die.value}): choose which of the equally ${MISSION_LOSS_TABLE[ids.length as 2 | 3 | 4][die.value - 1] === 'W' ? 'weakest' : 'strongest'} aircraft loses a step.`,
    candidates.map((id) => ({ id: `loss:${id}`, label: ratingLabel(state, pieceById(state, id)!), hexId: null }))));
};

/** 14.4f: an eliminated aircraft is removed; a reduced one finishes the mission with reduced values. */
const flakLoss = (input: GameState, pieceId: PieceId, events: RuleEvent[]): GameState => {
  let state = aircraftStepLoss(input, pieceId, events);
  state = logLine(state, `${aircraftName(state, pieceById(state, pieceId))} ${alive(state, pieceId) ? 'is reduced' : 'is destroyed'} by Flak.`);
  return alive(state, pieceId) ? state : withAir(state, { aircraft: airOf(state).aircraft.filter((entry) => entry.pieceId !== pieceId) });
};

// ─── Mission resolution (14.6-14.8, 14.11) ──────────────────────────────────────────────────────

export interface AirBarragePreview {
  readonly strength: number;
  readonly initialColumn: number;
  readonly finalColumn: number;
  readonly spotter: boolean;
  readonly shifts: readonly { readonly reason: string; readonly shift: number }[];
}

/** 14.7, 10.0a: an air barrage on combat units has no supply cost; Strategic Bombers are always unspotted. */
export const previewAirBarrage = (
  state: GameState,
  ownerId: PlayerId,
  aircraft: readonly { readonly pieceId: PieceId; readonly baseHexId: HexId }[],
  targetHexId: HexId,
): AirBarragePreview => {
  const pieces = aircraft.flatMap(({ pieceId }) => pieceById(state, pieceId) ?? []);
  const strategic = pieces.some((piece) => isStrategicBomber(state, piece));
  const strength = missionBarrageStrength(state, pieces.map(({ id }) => id));
  const initialColumn = barrageColumnIndex(strength);
  const target = barrageTargetShifts(state, ownerId, targetHexId, !strategic);
  const shifts = [...target.shifts];
  // 14.7c: right one when every aircraft is within 10 hexes of its base; never for Strategic Bombers.
  // An off-map airfield's aircraft fly in over `baseHexId` (their launch hex) from one hex further out.
  const offMap = (pieceId: PieceId) => { const piece = pieceById(state, pieceId); return piece !== undefined && atOffMapAirfield(state, piece); };
  if (!strategic && aircraft.length > 0 && aircraft.every(({ pieceId, baseHexId }) =>
    hexDistanceBetween(baseHexId, targetHexId) + (offMap(pieceId) ? OFF_MAP_AIRFIELD_DISTANCE : 0) <= SHORT_RANGE_HEXES)) {
    shifts.push({ reason: 'Short range', shift: 1 });
  }
  const finalColumn = Math.max(0, Math.min(BARRAGE_TABLE_COLUMNS.length - 1, initialColumn + shifts.reduce((total, { shift }) => total + shift, 0)));
  return { strength, initialColumn, finalColumn, spotter: target.spotter, shifts };
};

const resolveBarrageOnUnits = (input: GameState, events: RuleEvent[]): GameState => {
  let state = input;
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  const preview = previewAirBarrage(state, transaction.ownerId, air.aircraft, transaction.targetHexId);
  if (preview.strength < 1 || enemyCombatUnitsAt(state, transaction.ownerId, transaction.targetHexId).length === 0) {
    return logLine(state, 'The barrage has no strength left (or no target) and has no effect.');
  }
  const roll = rollTwoDice(state.rng);
  state = { ...state, rng: roll.rng };
  events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'BARRAGE', roll: roll.roll });
  const cell = BARRAGE_TABLE_ROWS[roll.roll.total]![preview.finalColumn]!;
  let result = parseBarrageResult(cell);
  // Barrage Table [1/2]: an Air barrage treats it as DG.
  if (result.kind === 'BRACKETED_HALF') result = { ...result, kind: 'DG' };
  let losses = result.kind === 'STEPS' ? result.steps : 0;
  if (result.kind === 'HALF') {
    const die = rollDie(state.rng);
    state = { ...state, rng: die.rng };
    losses = die.value >= 4 ? 1 : 0;
  }
  if (result.kind !== 'NONE') state = setModeForHex(state, transaction.targetHexId, transaction.defenderOwnerId, events);
  state = { ...state, activeTransaction: { ...state.activeTransaction!, roll: roll.roll, result: cell } };
  return logLine(withAir(state, { targetLosses: losses }),
    `Barrage ${preview.strength} on the ${BARRAGE_TABLE_COLUMNS[preview.initialColumn]!.label} column, shifted to ${BARRAGE_TABLE_COLUMNS[preview.finalColumn]!.label}: roll ${roll.roll.total}, ${cell}${losses > 0 ? `, ${losses} step${losses === 1 ? '' : 's'} lost` : result.kind === 'NONE' ? ', no effect' : ', DG'}.`);
};

/** 10.0c: a port the other side holds that can still take a hit (19.0b: never more than four). */
const enemyPortTarget = (state: GameState, playerId: PlayerId, hexId: HexId): boolean => {
  const port = portAt(state, hexId);
  return port !== undefined && port.controllerId !== null && port.controllerId !== playerId && port.damage < PORT_MAXIMUM_HITS;
};

/** 10.0c Barrage vs Facility Table against an Air Base or a port, or for Trainbusting (one die, no shifts). */
const resolveFacility = (input: GameState, events: RuleEvent[]): GameState => {
  let state = input;
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  const strength = missionBarrageStrength(state, air.aircraft.map(({ pieceId }) => pieceId));
  if (strength < 1) return logLine(state, 'The mission has no Barrage Strength left and has no effect.');
  const column = facilityColumnIndex(strength);
  const die = rollDie(state.rng);
  state = { ...state, rng: die.rng };
  const cell = FACILITY_TABLE_ROWS[die.value]![column]!;
  const result = parseFacilityResult(cell);
  state = { ...state, activeTransaction: { ...state.activeTransaction!, result: cell } };
  const label = `Barrage vs Facility ${strength} (${FACILITY_TABLE_COLUMNS[column]!.label}): die ${die.value}, ${cell === '-' ? 'no effect' : cell}`;
  if (air.mission === 'TRAINBUSTING') {
    if (!result.trainbusting) return logLine(state, `${label}; no Trainbusting.`);
    events.push({ kind: 'TRAINBUSTING_CHANGED', sequence: events.length, hexId: transaction.targetHexId, ownerId: transaction.ownerId, placed: true });
    state = { ...state, air: { ...state.air, trainbusting: [...state.air.trainbusting, { hexId: transaction.targetHexId, ownerId: transaction.ownerId }] } };
    return logLine(state, `${label}; a Trainbusting marker is placed.`);
  }
  // 10.0cB: against a port only the numbered results count, as hits (19.0b).
  if (air.target === 'PORT') {
    if (result.levels === 0) return logLine(state, `${label}; the port takes no damage.`);
    const before = portAt(state, transaction.targetHexId)?.damage ?? 0;
    state = damagePort(state, transaction.targetHexId, result.levels, 'BARRAGE', events);
    const after = portAt(state, transaction.targetHexId)?.damage ?? before;
    return logLine(state, `${label}; the port takes ${after - before} hit${after - before === 1 ? '' : 's'} (now ${after} of ${PORT_MAXIMUM_HITS}).`);
  }
  let lines = label;
  const base = enemyAirBaseAt(state, transaction.ownerId, transaction.targetHexId);
  // 10.0cA: "(#)" checks every enemy plane in the hex, Active or Inactive, one die each.
  if (result.aircraftCheck !== null) {
    for (const plane of aircraftAt(state, transaction.targetHexId).filter((piece) => piece.ownerId === transaction.defenderOwnerId)) {
      const check = rollDie(state.rng);
      state = { ...state, rng: check.rng };
      if (check.value >= result.aircraftCheck) {
        state = aircraftStepLoss(state, plane.id, events);
        lines += `; ${aircraftName(state, plane)} loses a step (${check.value})`;
      }
    }
  }
  // 15.0c: numbered results reduce the Level, never below 1; Air Strips are never reduced.
  if (result.levels > 0 && base && !isAirStrip(state, base)) {
    const level = Math.max(1, airBaseLevel(state, base) - result.levels);
    if (level !== airBaseLevel(state, base)) {
      state = { ...state, pieceState: upsertPieceState(state.pieceState, withAirBaseLevel(base, level)) };
      events.push({ kind: 'AIR_BASE_LEVEL_CHANGED', sequence: events.length, pieceId: base.id, level });
      lines += `; the Air Base drops to Level ${level}`;
    }
  }
  return logLine(state, `${lines}.`);
};

const resolveMission = (input: GameState, events: RuleEvent[]): Transition | GameState => {
  let state = input;
  const air = airOf(state);
  if (air.aircraft.length === 0) return logLine(withAir(state, { stage: 'RETURN' }), 'No mission aircraft remain; the mission is over.');
  switch (air.mission) {
    case 'AIR_TRANSPORT':
    case 'AIR_DROP': {
      // 14.4g: Flak may have cut the Transports' capacity below the load; the owner picks what is destroyed.
      const loss = air.cargo ? cargoLoss(state, air.cargo, air.aircraft.map(({ pieceId }) => pieceId)) : { excess: 0, options: [] };
      if (loss.options.length > 0) {
        return ask(state, events, decisionFor(state, 'CARGO_LOSS', state.activeTransaction!.ownerId,
          `Flak cut the Transports' capacity: the load is ${loss.excess / 2}T too heavy. Choose cargo to destroy.`,
          loss.options.map((option) => ({ id: option.id, label: option.label, hexId: null }))));
      }
      state = resolveCargo(state, events);
      break;
    }
    case 'FIGHTER_SWEEP':
      state = logLine(state, 'The sweep is complete.');
      break;
    case 'BASE_TRANSFER':
      break;
    case 'BARRAGE':
    case 'HIP_SHOOT':
      state = air.target === 'AIR_BASE' || air.target === 'PORT' ? resolveFacility(state, events) : resolveBarrageOnUnits(state, events);
      break;
    case 'TRAINBUSTING':
      state = resolveFacility(state, events);
      break;
  }
  return withAir(state, { stage: airOf(state).targetLosses > 0 ? 'TARGET_LOSS' : 'RETURN' });
};

// ─── Return to base (14.1c, 14.11) ──────────────────────────────────────────────────────────────

/** Friendly Air Bases an aircraft may return to from the mission hex. */
export const returnBases = (state: GameState, entry: AirReturn): readonly HexId[] => {
  const piece = pieceById(state, entry.pieceId)!;
  const bases = friendlyAirBases(state, piece.ownerId).map((base) => hexOf(base)!);
  if (entry.requiredHexId !== null && bases.includes(entry.requiredHexId)) return [entry.requiredHexId];
  return bases.filter((hexId) => hexDistanceBetween(entry.fromHexId, hexId) <= (entry.rangeHexes ?? aircraftRange(state, piece)));
};

const landAt = (input: GameState, entry: AirReturn, hexId: HexId | null, events: RuleEvent[]): GameState => {
  let state = withAir(input, { returns: airOf(input).returns.filter(({ pieceId }) => pieceId !== entry.pieceId) });
  const piece = pieceById(state, entry.pieceId);
  if (!piece || piece.location.kind !== 'ON_MAP') return state;
  if (hexId === null) {
    // No friendly base within range: the aircraft cannot return and is lost.
    state = { ...state, pieceState: upsertPieceState(state.pieceState, { ...piece, location: { kind: 'ELIMINATED' } }) };
    events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId: piece.id, remainingSteps: null });
    return logLine(state, `${aircraftName(state, piece)} has no friendly Air Base in range and is lost.`);
  }
  const base = friendlyAirBaseAt(state, piece.ownerId, hexId)!;
  const room = activeAircraftAt(state, piece.ownerId, hexId).filter(({ id }) => id !== piece.id).length < activeAircraftLimit(state, base);
  const active = entry.staysActive && room;
  state = { ...state, pieceState: upsertPieceState(state.pieceState, withAircraftActive({ ...piece, location: { kind: 'ON_MAP', hexId }, stackOrder: nextStackOrder(state.pieceState.pieces, hexId, piece.id) }, active)) };
  events.push({ kind: 'AIRCRAFT_STATUS_CHANGED', sequence: events.length, pieceId: piece.id, active, hexId });
  return state;
};

const landOffMap = (input: GameState, entry: AirReturn, events: RuleEvent[]): GameState => {
  const state = withAir(input, { returns: airOf(input).returns.filter(({ pieceId }) => pieceId !== entry.pieceId) });
  const piece = pieceById(state, entry.pieceId)!;
  events.push({ kind: 'AIRCRAFT_STATUS_CHANGED', sequence: events.length, pieceId: piece.id, active: entry.staysActive, hexId: null });
  return { ...state, pieceState: upsertPieceState(state.pieceState, withAircraftActive(piece, entry.staysActive)) };
};

const returnStep = (state: GameState, events: RuleEvent[]): Transition | GameState => {
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  if (air.aircraft.length > 0) {
    // 14.2f G: the surviving mission aircraft return to base, normally becoming Inactive.
    const transfer = air.mission === 'BASE_TRANSFER';
    const returns: AirReturn[] = air.aircraft.filter(({ pieceId }) => alive(state, pieceId)).map(({ pieceId, baseHexId }) => {
      const piece = pieceById(state, pieceId)!;
      // 14.9e: a carrying Transport returns the way it flew: Inactive where it landed, or to a base within its normal or half range.
      const route = air.cargo?.routes.find((entry) => entry.pieceId === pieceId)?.route;
      return {
        pieceId, fromHexId: transaction.targetHexId, originHexId: baseHexId,
        rangeHexes: route && routeFlight(route) === 'HALF' ? routeReach(state, piece, route) : undefined,
        requiredHexId: transfer || (route !== undefined && routeStays(route) && air.mission === 'AIR_TRANSPORT') ? transaction.targetHexId : null,
        staysActive: transfer && isFighter(state, piece) && hexDistanceBetween(baseHexId, transaction.targetHexId) <= aircraftRange(state, piece),
      };
    });
    return withAir(state, { aircraft: [], returns: [...air.returns, ...returns] });
  }
  const entry = air.returns[0];
  if (!entry) return finishMission(state, events);
  if (!alive(state, entry.pieceId)) return withAir(state, { returns: air.returns.slice(1) });
  // An off-map airfield's aircraft fly back to it, normally Inactive (§6).
  if (atOffMapAirfield(state, pieceById(state, entry.pieceId)!)) return landOffMap(state, entry, events);
  const bases = returnBases(state, entry);
  if (bases.length <= 1) return landAt(state, entry, bases[0] ?? null, events);
  const piece = pieceById(state, entry.pieceId)!;
  const origin = entry.originHexId !== undefined && bases.includes(entry.originHexId) ? entry.originHexId : null;
  // The base it took off from comes first and is named, so the default choice is the obvious one; the rest are nearest first.
  const ordered = stableSort(bases, (left, right) => Number(right === origin) - Number(left === origin)
    || hexDistanceBetween(entry.fromHexId, left) - hexDistanceBetween(entry.fromHexId, right) || String(left).localeCompare(String(right)));
  return ask(state, events, decisionFor(state, 'AIR_RETURN', piece.ownerId,
    `${ratingLabel(state, piece)} returns to base${entry.staysActive ? ' and stays Active' : ' and becomes Inactive'}: choose a friendly Air Base within ${aircraftRange(state, piece)} hexes of ${entry.fromHexId}.${origin === null ? '' : ` It took off from ${origin}.`}`,
    ordered.map((hexId) => ({
      id: `base:${hexId}`, hexId,
      label: `${hexId === origin ? 'Original Air Base' : 'Air Base'} at ${hexId} (${hexDistanceBetween(entry.fromHexId, hexId)} hexes)`,
    }))));
};

const finishMission = (state: GameState, events: RuleEvent[]): Transition => {
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  // The result names everything that happened after the declaration, for the history and notices.
  events.push({ kind: 'TRANSACTION_RESOLVED', sequence: events.length, transactionId: transaction.id, result: air.log.slice(1).join(' ') || `${AIR_MISSION_LABELS[air.mission]} complete.` });
  // 9.14f: a drop that captured an Air Base leaves its aircraft to displace; their owner places them now, as after a move.
  const settled = settleInterrupts({ ...state, activeTransaction: null, pendingDecision: null }, null);
  for (const event of settled.events) events.push({ ...event, sequence: events.length });
  return { state: settled.state, events };
};

const targetLossStep = (state: GameState, events: RuleEvent[]): Transition | GameState => {
  const transaction = state.activeTransaction!;
  const air = airOf(state);
  const defenders = transaction.defenderIds.flatMap((id) => { const piece = pieceById(state, id); return piece && piece.location.kind === 'ON_MAP' ? [piece] : []; });
  if (air.targetLosses <= 0 || defenders.length === 0) return withAir(state, { targetLosses: 0, stage: 'RETURN' });
  // 10.0a: the targeted player selects the units that absorb the losses.
  if (defenders.length === 1) return applyTargetLoss(state, defenders[0]!.id, events);
  return ask(state, events, decisionFor(state, 'STEP_LOSS', transaction.defenderOwnerId,
    `Air barrage: ${air.targetLosses} step${air.targetLosses === 1 ? '' : 's'} to lose. Choose the unit that loses the next step.`,
    defenders.map((piece) => ({ id: `piece:${piece.id}`, label: `${pieceLabelOf(state, piece)} (${piece.remainingSteps ?? 0} step${piece.remainingSteps === 1 ? '' : 's'})`, hexId: null }))));
};

const pieceLabelOf = (state: GameState, piece: PieceState): string => state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)?.name ?? 'Unit';

const applyTargetLoss = (input: GameState, pieceId: PieceId, events: RuleEvent[]): GameState => {
  const piece = pieceById(input, pieceId)!;
  const remaining = (piece.remainingSteps ?? 1) - 1;
  events.push({ kind: 'STEP_LOST', sequence: events.length, pieceId, remainingSteps: remaining > 0 ? remaining : null });
  const state = { ...input, pieceState: upsertPieceState(input.pieceState, remaining > 0 ? { ...piece, remainingSteps: remaining } : { ...piece, location: { kind: 'ELIMINATED' } }) };
  return withAir(state, { targetLosses: airOf(state).targetLosses - 1 });
};

// ─── Driver ─────────────────────────────────────────────────────────────────────────────────────

/** Run the Air Mission Sequence (14.2f) until a player must choose or the mission ends. */
export const continueAirMission = (input: GameState): Transition => {
  let state = input;
  const events: RuleEvent[] = [];
  for (let guard = 0; guard < 400; guard += 1) {
    if (state.activeTransaction === null) return { state, events: renumber(events) };
    const air = airOf(state);
    let step: Transition | GameState;
    switch (air.stage) {
      case 'AIR_COMBAT': {
        if (air.combat === null) {
          // 14.2f C: Air Combat when Active enemy aircraft are in the mission hex (an enemy Air Base).
          step = startMissionHexCombat(state) ?? withAir(state, { stage: 'INTERCEPTION' });
        } else step = airCombatStep(state, events);
        break;
      }
      case 'INTERCEPTION': {
        if (air.combat !== null) { step = airCombatStep(state, events); break; }
        const transaction = state.activeTransaction!;
        const interceptors = !air.interceptionOffered && air.aircraft.length > 0 && subjectToFlak(state)
          && inPatrolZoneOf(state, transaction.defenderOwnerId, transaction.targetHexId) ? interceptorsFor(state) : [];
        if (interceptors.length === 0) { step = withAir(state, { stage: 'FLAK', interceptionOffered: true }); break; }
        const offered = withAir(state, { interceptionOffered: true });
        step = ask(offered, events, decisionFor(offered, 'INTERCEPTION', transaction.defenderOwnerId,
          `Enemy ${AIR_MISSION_LABELS[air.mission]} entering your Patrol Zone at ${transaction.targetHexId} with ${air.aircraft.map(({ pieceId }) => ratingLabel(state, pieceById(state, pieceId)!)).join(', ')}. Intercept with one Active Fighter?`,
          [
            { id: 'decline', label: 'Do not intercept', hexId: null },
            ...interceptors.map((piece) => ({ id: `intercept:${piece.id}`, label: `Intercept with ${ratingLabel(state, piece)} from ${hexOf(piece)}`, hexId: null })),
          ]));
        break;
      }
      case 'FLAK':
        step = air.aircraft.length > 0 && subjectToFlak(state) ? rollFlak(state, events) : withAir(state, { stage: 'RESOLVE' });
        break;
      case 'RESOLVE':
        step = resolveMission(state, events);
        break;
      case 'TARGET_LOSS':
        step = targetLossStep(state, events);
        break;
      case 'RETURN':
        step = returnStep(state, events);
        break;
    }
    if ('events' in step) {
      // A decision was requested or the mission finished.
      return { state: step.state, events: renumber(step.events === events ? events : [...events, ...step.events]) };
    }
    state = step;
  }
  throw new Error('Air mission did not settle.');
};

/** Apply the owner's answer to an air mission decision, then continue the sequence. */
export const resolveAirDecision = (input: GameState, choiceId: string): Transition => {
  const pending = input.pendingDecision!;
  let state: GameState = { ...input, pendingDecision: null };
  const events: RuleEvent[] = [];
  const air = airOf(state);
  switch (pending.kind) {
    case 'AIR_ABORT': {
      const combat = air.combat!;
      if (choiceId === 'fight') state = withCombat(state, { abortsPending: combat.abortsPending.slice(1) });
      else {
        const pieceId = choiceId.slice('abort:'.length) as PieceId;
        state = applyAbort(state, pieceId, events);
        state = withCombat(state, {
          missionSideIds: combat.missionSideIds.filter((id) => id !== pieceId),
          opposingSideIds: combat.opposingSideIds.filter((id) => id !== pieceId),
        });
        state = logLine(state, `${aircraftName(state, pieceById(state, pieceId))} aborts before the Air Combat.`);
      }
      break;
    }
    case 'AIR_COMBAT_PICK':
      if (choiceId.startsWith('pick:')) state = withCombat(state, { attackerPickId: choiceId.slice('pick:'.length) as PieceId });
      else state = resolveRound(state, air.combat!.attackerPickId!, choiceId.slice('meet:'.length) as PieceId, events);
      break;
    case 'INTERCEPTION':
      state = choiceId === 'decline'
        ? logLine(withAir(state, { stage: 'FLAK' }), 'No interception.')
        : startInterception(state, choiceId.slice('intercept:'.length) as PieceId);
      break;
    case 'MISSION_LOSS':
      state = withAir(flakLoss(state, choiceId.slice('loss:'.length) as PieceId, events), { stage: 'RESOLVE' });
      break;
    case 'CARGO_LOSS':
      state = applyCargoLoss(state, choiceId, events);
      break;
    case 'STEP_LOSS':
      state = applyTargetLoss(state, choiceId.slice('piece:'.length) as PieceId, events);
      break;
    case 'AIR_RETURN':
      state = landAt(state, air.returns[0]!, choiceId.slice('base:'.length) as HexId, events);
      break;
    default:
      throw new Error(`Decision ${pending.kind} does not belong to an air mission.`);
  }
  const continued = continueAirMission(state);
  return { state: continued.state, events: renumber([...events, ...continued.events]) };
};

// ─── Queries for candidates and the UI ──────────────────────────────────────────────────────────

/** Active aircraft of `playerId` at friendly bases that have not flown this phase. */
export const readyAircraft = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  [...friendlyAirBases(state, playerId).flatMap((base) => activeAircraftAt(state, playerId, hexOf(base)!)),
    ...offMapAirfields(state, playerId).flatMap((field) => aircraftAtAirfield(state, field).filter((piece) => isActiveAircraft(piece)))]
    .filter((piece) => !state.air.missionFlownIds.includes(piece.id))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

/**
 * Hexes a mission of this kind could target now, before choosing aircraft: within range of a ready
 * aircraft and holding the right kind of target. Trainbusting may target any hex in range.
 */
export const airMissionTargets = (state: GameState, playerId: PlayerId, mission: AirMissionKind): readonly { readonly hexId: HexId; readonly target: AirMissionState['target'] }[] => {
  if (flightWeatherViolation(state, mission)) return [];
  if (mission === 'AIR_TRANSPORT' || mission === 'AIR_DROP') return transportTargets(state, playerId, mission).map((hexId) => ({ hexId, target: null }));
  const ready = readyAircraft(state, playerId).filter((piece) => mission !== 'HIP_SHOOT' || (mayHipShoot(state, piece) && !isStrategicBomber(state, piece)));
  if (ready.length === 0) return [];
  const inRange = (hexId: HexId, factor = 1) => ready.some((piece) => hexOf(piece) !== hexId && airDistance(state, piece, hexId) <= aircraftRange(state, piece) * factor);
  const enemy = opponentOf(state, playerId);
  const results: { hexId: HexId; target: AirMissionState['target'] }[] = [];
  for (const { id: hexId } of state.scenario.mapDefinition.hexes) {
    switch (mission) {
      case 'FIGHTER_SWEEP':
        if (activeAircraftAt(state, enemy, hexId).length > 0 && inRange(hexId)) results.push({ hexId, target: null });
        break;
      case 'BASE_TRANSFER':
        if (friendlyAirBaseAt(state, playerId, hexId) && inRange(hexId, 2)) results.push({ hexId, target: null });
        break;
      case 'TRAINBUSTING':
        if (!state.ledger.barragedHexIds.includes(hexId) && !trainbustingAt(state, hexId) && inRange(hexId)) results.push({ hexId, target: null });
        break;
      case 'BARRAGE':
      case 'HIP_SHOOT': {
        if (!inRange(hexId) || (mission === 'BARRAGE' && state.ledger.barragedHexIds.includes(hexId))) break;
        if (mission === 'HIP_SHOOT' && !hasCorrectSpotter(state, playerId, hexId)) break;
        if (enemyCombatUnitsAt(state, playerId, hexId).length > 0) results.push({ hexId, target: 'COMBAT_UNITS' });
        if (enemyAirBaseAt(state, playerId, hexId)) results.push({ hexId, target: 'AIR_BASE' });
        if (enemyPortTarget(state, playerId, hexId)) results.push({ hexId, target: 'PORT' });
        break;
      }
    }
  }
  return results;
};

/** Ready aircraft able to reach `hexId` for this mission, best first. */
export const aircraftForTarget = (state: GameState, playerId: PlayerId, mission: AirMissionKind, hexId: HexId): readonly PieceState[] =>
  stableSort(readyAircraft(state, playerId).filter((piece) => hexOf(piece) !== hexId
    && airDistance(state, piece, hexId) <= aircraftRange(state, piece) * (mission === 'BASE_TRANSFER' ? 2 : 1)
    && (mission !== 'HIP_SHOOT' || (mayHipShoot(state, piece) && !isStrategicBomber(state, piece)))),
  (left, right) => (mission === 'FIGHTER_SWEEP' ? Number(isFighter(state, right)) - Number(isFighter(state, left)) || airCombatRating(state, right) - airCombatRating(state, left) : 0)
    || aircraftBarrageStrength(state, right) - aircraftBarrageStrength(state, left) || String(left.id).localeCompare(String(right.id)));

export const AIR_MISSION_KINDS: readonly AirMissionKind[] = ['FIGHTER_SWEEP', 'BASE_TRANSFER', 'AIR_TRANSPORT', 'AIR_DROP', 'HIP_SHOOT', 'BARRAGE', 'TRAINBUSTING'];
