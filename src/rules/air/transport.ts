import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState, type PieceState } from '../../domain/piece/index.js';
import { nextStackOrder } from '../combat/combat.js';
import type { AirCargoDeclaration, AirCargoState, AirMissionKind, AirRoute, DropPlan, GameAction, GameState, RuleEvent, RuleViolation } from '../kernel/model.js';
import { rollTwoDice } from '../kernel/rng.js';
import {
  definitionOf, enemyCombatUnitsAt, hexDistanceBetween, hexOf, isCombatUnit, mobilityOf, movementAllowanceTicks, opponentOf,
  pieceById, piecesAt, reTicksOf, stepOf, usageOf, withUsage,
} from '../pieces.js';
import { captureAt, mergeSupplyAt } from '../supply/transport.js';
import { spendReservations } from '../supply/supply.js';
import { AIR_TRANSPORT_FAILURE_MAXIMUM } from '../tables/ocs-4.3.js';
import { hexTerrainIds } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { describeAirBaseCapture } from './base.js';
import {
  activeAircraftAt,
  airBaseAt,
  airBaseLevel,
  aircraftName,
  aircraftRange,
  aircraftTransportCapacity,
  friendlyAirBaseAt,
  friendlyAirBases,
  hasIntegralGlider,
  isActiveAircraft,
  isAircraft,
  isAirStrip,
} from './aircraft.js';

/**
 * Air Transport (14.9) and Air Drop (14.10). Capacities and costs are counted in half-Tokens (hT; 1T = 2) so that the 1/2T
 * Transports and the halved equivalents of Leg units (4.7b) stay whole numbers.
 */

type Transition = { readonly state: GameState; readonly events: readonly RuleEvent[] };
type Declaration = Extract<GameAction, { readonly kind: 'DECLARE_AIR_MISSION' }>;

export const isTransportMission = (mission: AirMissionKind): boolean => mission === 'AIR_TRANSPORT' || mission === 'AIR_DROP';

/** 14.9c: Leg units in Move Mode whose MA is 10 MP or less can fly. */
export const MAXIMUM_CARGO_MA_TICKS = 10 * 4;
/** 4.7b: a Leg unit with an MA of 1 to 6 in Move Mode counts half its size. */
const HALVED_MA_TICKS = 6 * 4;
/** 14.9f, 15.2C: Tokens an Air Strip unloads per Movement Segment; an Air Base unloads this times its Level. */
export const UNLOAD_TOKENS_PER_LEVEL = 2;
/** 14.10b: a Drop Plan is made at least two Game Turns before the drop. */
export const DROP_PLAN_LEAD_TURNS = 2;

const hT = (tokens: number): number => tokens * 2;
export const halfTokenText = (halfTokens: number): string => halfTokens % 2 === 0 ? `${halfTokens / 2}T` : halfTokens === 1 ? '1/2T' : `${(halfTokens - 1) / 2} 1/2T`;

// ─── Routes (14.9e) ─────────────────────────────────────────────────────────────────────────────

export const routeStays = (route: AirRoute): boolean => route === 'DOUBLE' || route === 'NORMAL_STAY' || route === 'HALF_STAY';
export const routeFlight = (route: AirRoute): 'DOUBLE' | 'NORMAL' | 'HALF' => route === 'DOUBLE' ? 'DOUBLE' : route.startsWith('HALF') ? 'HALF' : 'NORMAL';

/** The farthest destination a plane flying this way can reach. */
export const routeReach = (state: GameState, piece: PieceState, route: AirRoute): number => {
  const range = aircraftRange(state, piece);
  const flight = routeFlight(route);
  return flight === 'DOUBLE' ? 2 * range : flight === 'HALF' ? Math.floor(range / 2) : range;
};

/** 14.9e C: flying at half range doubles the capacity. */
export const routeCapacity = (state: GameState, piece: PieceState, route: AirRoute): number =>
  aircraftTransportCapacity(state, piece) * (routeFlight(route) === 'HALF' ? 2 : 1);

/** The farthest a plane of this range reaches flying this way. */
export const reachForRange = (range: number, route: AirRoute): number => {
  const flight = routeFlight(route);
  return flight === 'DOUBLE' ? 2 * range : flight === 'HALF' ? Math.floor(range / 2) : range;
};

/** How a plane of this range could fly to a destination `distance` hexes away: Air Drops have no base to end Inactive at, so no DOUBLE or STAY. */
export const routesForRange = (range: number, distance: number, mission: AirMissionKind): readonly AirRoute[] => {
  const candidates: readonly AirRoute[] = mission === 'AIR_DROP' ? ['NORMAL', 'HALF'] : ['NORMAL', 'NORMAL_STAY', 'HALF', 'HALF_STAY', 'DOUBLE'];
  return candidates.filter((route) => distance <= reachForRange(range, route));
};

export const routesAllowed = (state: GameState, piece: PieceState, distance: number, mission: AirMissionKind): readonly AirRoute[] =>
  routesForRange(aircraftRange(state, piece), distance, mission);

/** Hex distance, for the command deck. */
export const distanceBetween = (left: HexId, right: HexId): number => hexDistanceBetween(left, right);

export const ROUTE_LABELS: Readonly<Record<AirRoute, string>> = {
  NORMAL: 'Normal range',
  NORMAL_STAY: 'Normal range, stays Inactive at the destination',
  HALF: 'Half range, double capacity',
  HALF_STAY: 'Half range, double capacity, stays Inactive at the destination',
  DOUBLE: 'Double range, stays Inactive at the destination',
};

// ─── Cargo ──────────────────────────────────────────────────────────────────────────────────────

/** 4.7: what a unit costs to carry, in half-Tokens (1 RE = 4T; halved for a Leg unit with MA 1-6 in Move Mode). */
export const unitCargoCost = (state: GameState, unit: PieceState): number => {
  const ticks = reTicksOf(state, unit);
  const ma = Number(stepOf(state, unit)?.movementPointTicks ?? 0);
  return ma > 0 && ma <= HALVED_MA_TICKS ? ticks : ticks * 2;
};

/** Why `unit` cannot be loaded at the base now, or null (14.9c, 14.9d). */
export const cargoUnitProblem = (state: GameState, unit: PieceState, ownerId: PlayerId, baseHexId: HexId): string | null => {
  if (unit.ownerId !== ownerId || unit.location.kind !== 'ON_MAP' || !isCombatUnit(state, unit)) return 'only your combat units can be carried';
  if (hexOf(unit) !== baseHexId) return 'it is not in the Air Base hex';
  if (unit.mode !== 'MOVE') return 'it must be in Move Mode (14.9c)';
  if (mobilityOf(state, unit) !== 'leg') return 'only Leg units fly (14.9c)';
  if (Number(stepOf(state, unit)?.movementPointTicks ?? 0) > MAXIMUM_CARGO_MA_TICKS) return 'its MA is over 10 Leg MP (14.9c)';
  const usage = usageOf(state, unit);
  if (usage.railCarried) return 'it already moved by rail this phase (4.7d)';
  if (usage.seaCarried) return 'it was shipped this phase (4.7d)';
  const printed = movementAllowanceTicks({ ...state, usage: withUsage(state, { ...usage, airCarried: false }) }, unit);
  if (usage.movementSpentTicks > printed / 2) return 'it has already spent more than half its MA (14.9d)';
  return null;
};

/** Tokens of supply in dumps standing in the Air Base hex, per dump. */
export const baseDumps = (state: GameState, ownerId: PlayerId, baseHexId: HexId): readonly PieceState[] =>
  piecesAt(state, baseHexId).filter((piece) => piece.ownerId === ownerId && definitionOf(state, piece)?.family === 'RESOURCE' && (piece.resourceQuantity ?? 0) > 0)
    .sort((left, right) => (right.resourceQuantity ?? 0) - (left.resourceQuantity ?? 0) || String(left.id).localeCompare(String(right.id)));

export const cargoTokens = (cargo: AirCargoDeclaration): number => cargo.supply.reduce((total, { tokens }) => total + tokens, 0);

/** Load in half-Tokens. */
export const cargoWeight = (state: GameState, cargo: AirCargoDeclaration): number =>
  cargo.unitIds.reduce((total, id) => total + unitCargoCost(state, pieceById(state, id)!), 0) + hT(cargoTokens(cargo));

const routeOf = (cargo: AirCargoDeclaration, pieceId: PieceId): AirRoute | undefined => cargo.routes.find((entry) => entry.pieceId === pieceId)?.route;

/** The planes of the mission that carry the cargo: those loaded at the cargo's Air Base with a capacity. */
export const carrierIds = (state: GameState, cargo: AirCargoDeclaration, aircraftIds: readonly PieceId[]): readonly PieceId[] =>
  aircraftIds.filter((id) => {
    const plane = pieceById(state, id);
    return plane !== undefined && plane.location.kind === 'ON_MAP' && hexOf(plane) === cargo.baseHexId && aircraftTransportCapacity(state, plane) > 0;
  });

/** Capacity of the surviving carriers, flown the way each was declared (14.9a, 14.9e, 14.10f). */
export const cargoCapacity = (state: GameState, cargo: AirCargoDeclaration, aircraftIds: readonly PieceId[]): number =>
  carrierIds(state, cargo, aircraftIds).reduce((total, id) => total + routeCapacity(state, pieceById(state, id)!, routeOf(cargo, id) ?? 'NORMAL'), 0);

/** 14.9f, 14.10e D: cargo on planes that stay Inactive at the destination or tow their own glider is not counted against the unloading limit. */
export const exemptCapacity = (state: GameState, cargo: AirCargoDeclaration, aircraftIds: readonly PieceId[]): number =>
  carrierIds(state, cargo, aircraftIds).reduce((total, id) => {
    const plane = pieceById(state, id)!;
    const route = routeOf(cargo, id) ?? 'NORMAL';
    return total + (routeStays(route) || hasIntegralGlider(state, plane) ? routeCapacity(state, plane, route) : 0);
  }, 0);

/** Tokens of the load that count against the destination's unloading limit. */
export const countedUnloadTokens = (state: GameState, cargo: AirCargoDeclaration, aircraftIds: readonly PieceId[]): number =>
  Math.ceil(Math.max(0, cargoWeight(state, cargo) - exemptCapacity(state, cargo, aircraftIds)) / 2);

/** 15.0b C, 15.2C: Tokens a base can unload per Movement Segment. */
export const unloadLimitTokens = (state: GameState, base: PieceState): number =>
  UNLOAD_TOKENS_PER_LEVEL * (isAirStrip(state, base) ? 1 : airBaseLevel(state, base));

export const unloadedAt = (state: GameState, hexId: HexId): number =>
  state.air.unloaded.filter((entry) => entry.hexId === hexId).reduce((total, entry) => total + entry.tokens, 0);

/** 14.10e, 14.10f: by glider when every carrier tows its own, by parachute when none does. */
export const dropMethod = (state: GameState, cargo: AirCargoDeclaration, aircraftIds: readonly PieceId[]): 'PARACHUTE' | 'GLIDER' | 'MIXED' | null => {
  const carriers = carrierIds(state, cargo, aircraftIds).map((id) => pieceById(state, id)!);
  if (carriers.length === 0) return null;
  const gliders = carriers.filter((plane) => hasIntegralGlider(state, plane)).length;
  return gliders === 0 ? 'PARACHUTE' : gliders === carriers.length ? 'GLIDER' : 'MIXED';
};

// ─── Drop Plans (14.10b, 14.10c) ────────────────────────────────────────────────────────────────

export const isParaUnit = (state: GameState, unit: PieceState): boolean => definitionOf(state, unit)?.counter?.symbol === 'AIRBORNE';

export const planOf = (state: GameState, unitId: PieceId): DropPlan | undefined => state.air.dropPlans.find((plan) => plan.unitIds.includes(unitId));

/** Drop Plans may be made in a player's own Aircraft Refit Phase (14.10b). */
const inPlanningPhase = (state: GameState, actorId: PlayerId): boolean =>
  state.sequence.phase === 'AIRCRAFT_REFIT' && state.sequence.actingPlayerId === actorId;

/** "Either before the game begins or at least two turns in advance": the first Refit Phase of the game counts as before it begins. */
export const earliestPlanTurn = (state: GameState): number =>
  state.sequence.gameTurn <= state.scenario.turnStart.turn ? state.sequence.gameTurn : state.sequence.gameTurn + DROP_PLAN_LEAD_TURNS;

export const validatePlanAirDrop = (state: GameState, action: Extract<GameAction, { readonly kind: 'PLAN_AIR_DROP' }>): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (!inPlanningPhase(state, action.actorId)) issues.push(violation('INVALID_DROP_PLAN_PHASE', ['sequence'], 'Drop Plans are made in your Aircraft Refit Phase.', '14.10b'));
  if (!state.scenario.mapDefinition.hexes.some(({ id }) => id === action.hexId)) issues.push(violation('UNKNOWN_DROP_HEX', ['hexId'], 'The drop hex is not on the map.', '14.10b'));
  if (action.unitIds.length === 0 || new Set(action.unitIds).size !== action.unitIds.length) {
    return [...issues, violation('INVALID_DROP_UNITS', ['unitIds'], 'Plan a drop for one or more distinct units.', '14.10b')];
  }
  if (!Number.isInteger(action.turn) || action.turn < earliestPlanTurn(state)) {
    issues.push(violation('DROP_PLAN_TOO_LATE', ['turn'], `A drop must be planned at least ${DROP_PLAN_LEAD_TURNS} turns ahead (turn ${earliestPlanTurn(state)} or later now).`, '14.10b'));
  }
  if (action.turn > state.configuration.turnLimit) issues.push(violation('DROP_AFTER_GAME_END', ['turn'], 'The game ends before that turn.', '14.10b'));
  for (const [index, id] of action.unitIds.entries()) {
    const unit = pieceById(state, id);
    if (!unit || unit.ownerId !== action.actorId || unit.location.kind !== 'ON_MAP' || !isCombatUnit(state, unit)) {
      issues.push(violation('DROP_UNIT_NOT_YOURS', ['unitIds', index], 'Only your combat units on the map can be planned.', '14.10a'));
    } else if (mobilityOf(state, unit) !== 'leg' && !isParaUnit(state, unit)) {
      issues.push(violation('DROP_UNIT_NOT_ELIGIBLE', ['unitIds', index], 'Only Para units, or Leg units that a glider can carry, drop.', '14.10a'));
    }
    if (planOf(state, id)) issues.push(violation('UNIT_ALREADY_PLANNED', ['unitIds', index], 'No unit is ever on more than one Drop Plan.', '14.10b'));
  }
  return issues;
};

const planId = (ownerId: PlayerId, hexId: HexId, turn: number, unitIds: readonly PieceId[]): string => `drop:${ownerId}:${turn}:${hexId}:${unitIds[0]}`;

export const applyPlanAirDrop = (state: GameState, action: Extract<GameAction, { readonly kind: 'PLAN_AIR_DROP' }>): Transition => {
  const plan: DropPlan = { id: planId(action.actorId, action.hexId, action.turn, action.unitIds), ownerId: action.actorId, unitIds: [...action.unitIds], hexId: action.hexId, turn: action.turn };
  return {
    state: { ...state, air: { ...state.air, dropPlans: [...state.air.dropPlans, plan] } },
    events: [{ kind: 'DROP_PLAN_CHANGED', sequence: 0, planId: plan.id, change: 'PLANNED', turn: plan.turn }],
  };
};

export const validateUpdateDropPlan = (state: GameState, action: Extract<GameAction, { readonly kind: 'UPDATE_AIR_DROP_PLAN' }>): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (!inPlanningPhase(state, action.actorId)) issues.push(violation('INVALID_DROP_PLAN_PHASE', ['sequence'], 'Drop Plans change in your Aircraft Refit Phase.', '14.10c'));
  const plan = state.air.dropPlans.find((entry) => entry.id === action.planId);
  if (!plan || plan.ownerId !== action.actorId) return [...issues, violation('UNKNOWN_DROP_PLAN', ['planId'], 'No such Drop Plan of yours.', '14.10c')];
  if (action.unitIds.length === 0 || action.unitIds.some((id) => !plan.unitIds.includes(id)) || new Set(action.unitIds).size !== action.unitIds.length) {
    issues.push(violation('INVALID_DROP_UNITS', ['unitIds'], 'Choose distinct units that are on this plan.', '14.10c'));
  }
  if (action.change === 'DELAY' && plan.turn + 1 > state.configuration.turnLimit) issues.push(violation('DROP_AFTER_GAME_END', ['change'], 'The game ends before the next turn.', '14.10c'));
  return issues;
};

export const applyUpdateDropPlan = (state: GameState, action: Extract<GameAction, { readonly kind: 'UPDATE_AIR_DROP_PLAN' }>): Transition => {
  const plan = state.air.dropPlans.find((entry) => entry.id === action.planId)!;
  const leaving = new Set<PieceId>(action.unitIds);
  const staying = plan.unitIds.filter((id) => !leaving.has(id));
  const others = state.air.dropPlans.filter((entry) => entry.id !== plan.id);
  const kept: DropPlan[] = staying.length > 0 ? [{ ...plan, unitIds: staying }] : [];
  const events: RuleEvent[] = [];
  let moved: DropPlan[] = [];
  if (action.change === 'DELAY') {
    // "The exact same drop is now pushed back to the next turn."
    const delayed: DropPlan = { ...plan, id: planId(plan.ownerId, plan.hexId, plan.turn + 1, action.unitIds), unitIds: [...action.unitIds], turn: plan.turn + 1 };
    const merged = others.find((entry) => entry.ownerId === delayed.ownerId && entry.hexId === delayed.hexId && entry.turn === delayed.turn);
    moved = merged ? [] : [delayed];
    if (merged) others.splice(others.indexOf(merged), 1, { ...merged, unitIds: [...merged.unitIds, ...action.unitIds] });
    events.push({ kind: 'DROP_PLAN_CHANGED', sequence: 0, planId: plan.id, change: 'DELAYED', turn: plan.turn + 1 });
  } else {
    events.push({ kind: 'DROP_PLAN_CHANGED', sequence: 0, planId: plan.id, change: 'CANCELLED', turn: plan.turn });
  }
  return { state: { ...state, air: { ...state.air, dropPlans: [...others, ...kept, ...moved] } }, events };
};

/** Plans whose Game Turn has passed lapse: a drop is for a specific turn (14.10b). */
export const lapseDropPlans = (state: GameState): GameState => {
  const remaining = state.air.dropPlans.filter((plan) => plan.turn >= state.sequence.gameTurn);
  return remaining.length === state.air.dropPlans.length ? state : { ...state, air: { ...state.air, dropPlans: remaining } };
};

// ─── Declaration checks ─────────────────────────────────────────────────────────────────────────

/** Everything about an Air Transport or Air Drop declaration beyond the general mission checks (14.9, 14.10). */
export const validateTransportMission = (state: GameState, action: Declaration, planes: readonly PieceState[]): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const cargo = action.cargo;
  const drop = action.mission === 'AIR_DROP';
  if (!cargo) return [...issues, violation('CARGO_REQUIRED', ['cargo'], `${drop ? 'An Air Drop' : 'An Air Transport'} carries cargo.`, drop ? '14.10' : '14.9')];
  const base = friendlyAirBaseAt(state, action.actorId, cargo.baseHexId);
  if (!base) return [...issues, violation('CARGO_BASE_REQUIRED', ['cargo', 'baseHexId'], 'The cargo is loaded at a friendly Air Base.', '14.9')];
  const destination = friendlyAirBaseAt(state, action.actorId, action.targetHexId);
  if (!drop) {
    if (!destination) issues.push(violation('TRANSPORT_NEEDS_FRIENDLY_BASE', ['targetHexId'], 'Air Transport missions are flown to a friendly Air Base.', '14.9e'));
    if (action.targetHexId === cargo.baseHexId) issues.push(violation('TRANSPORT_TO_SAME_BASE', ['targetHexId'], 'The cargo is already at that base.', '14.9'));
  }
  const ids = planes.map(({ id }) => id);
  const carriers = carrierIds(state, cargo, ids);
  if (carriers.length === 0) issues.push(violation('NO_CARRYING_TRANSPORT', ['aircraftIds'], 'Fly at least one Transport from the Air Base the cargo is loaded at.', '14.9a'));
  // Every carrier names how it flies, and reaches the destination that way (14.9e).
  for (const route of cargo.routes) {
    if (!carriers.includes(route.pieceId)) issues.push(violation('ROUTE_FOR_NON_CARRIER', ['cargo', 'routes'], 'A flight style is chosen only for carrying Transports.', '14.9e'));
  }
  for (const id of carriers) {
    const plane = pieceById(state, id)!;
    const route = routeOf(cargo, id);
    if (!route) { issues.push(violation('ROUTE_REQUIRED', ['cargo', 'routes'], `${aircraftName(state, plane)} needs a flight style (14.9e).`, '14.9e')); continue; }
    if (drop && routeStays(route)) issues.push(violation('DROP_ROUTE_NOT_ALLOWED', ['cargo', 'routes'], 'An Air Drop has no Air Base to end Inactive at.', '14.9e'));
    if (hexDistanceBetween(hexOf(plane)!, action.targetHexId) > routeReach(state, plane, route)) {
      issues.push(violation('ROUTE_OUT_OF_RANGE', ['cargo', 'routes'], `${aircraftName(state, plane)} cannot reach that hex flying that way (${routeReach(state, plane, route)} hexes).`, '14.9e'));
    }
  }
  // Aircraft that carry nothing fly an ordinary mission at their normal range.
  for (const plane of planes.filter(({ id }) => !carriers.includes(id))) {
    if (hexDistanceBetween(hexOf(plane)!, action.targetHexId) > aircraftRange(state, plane)) {
      issues.push(violation('MISSION_OUT_OF_RANGE', ['aircraftIds'], `${aircraftName(state, plane)} has a range of ${aircraftRange(state, plane)} hexes.`, '14.2d'));
    }
  }
  if (cargo.unitIds.length === 0 && cargo.supply.length === 0) issues.push(violation('EMPTY_CARGO', ['cargo'], 'Load units or supply.', '14.9'));
  if (new Set(cargo.unitIds).size !== cargo.unitIds.length) issues.push(violation('INVALID_CARGO_UNITS', ['cargo', 'unitIds'], 'Each unit is loaded once.', '14.9'));
  for (const [index, id] of cargo.unitIds.entries()) {
    const unit = pieceById(state, id);
    const problem = unit ? cargoUnitProblem(state, unit, action.actorId, cargo.baseHexId) : 'no such unit';
    if (problem) issues.push(violation('CARGO_UNIT_NOT_LOADABLE', ['cargo', 'unitIds', index], `${unit ? definitionOf(state, unit)?.name ?? 'The unit' : 'The unit'}: ${problem}.`, '14.9c'));
  }
  const dumps = baseDumps(state, action.actorId, cargo.baseHexId);
  const usedDumps = new Set<PieceId>();
  for (const [index, entry] of cargo.supply.entries()) {
    const dump = dumps.find(({ id }) => id === entry.sourcePieceId);
    if (!dump || usedDumps.has(entry.sourcePieceId) || !Number.isInteger(entry.tokens) || entry.tokens <= 0 || entry.tokens > (dump.resourceQuantity ?? 0)) {
      issues.push(violation('CARGO_SUPPLY_UNAVAILABLE', ['cargo', 'supply', index], 'Load Tokens from distinct dumps standing in the Air Base hex.', '14.9c'));
    }
    usedDumps.add(entry.sourcePieceId);
  }
  const weight = cargoWeight(state, cargo);
  const capacity = cargoCapacity(state, cargo, ids);
  if (weight > capacity) issues.push(violation('CARGO_OVER_CAPACITY', ['cargo'], `The load is ${halfTokenText(weight)} but the Transports carry ${halfTokenText(capacity)}.`, '14.9a'));
  if (!drop && destination) {
    // 14.9f, 15.0b C: unloading is limited per Movement Segment unless the excess Transports end Inactive at the destination.
    const limit = unloadLimitTokens(state, destination);
    const used = unloadedAt(state, action.targetHexId);
    const counted = countedUnloadTokens(state, cargo, ids);
    if (counted > limit - used) {
      issues.push(violation('UNLOAD_LIMIT', ['cargo'], `This base can unload ${limit}T per Movement Segment (${used}T already); ${counted}T of this load count. Have the extra Transports stay Inactive there, or carry less.`, isAirStrip(state, destination) ? '15.2C' : '14.9f'));
    }
  }
  if (drop) {
    const method = dropMethod(state, cargo, ids);
    if (method === 'MIXED') issues.push(violation('MIXED_DROP_CARRIERS', ['aircraftIds'], 'A drop is flown wholly by glider-towing Transports or wholly by parachute.', '14.10e'));
    if (cargo.unitIds.length > 0) {
      if (state.sequence.phase !== 'MOVEMENT') issues.push(violation('DROP_UNITS_MOVEMENT_PHASE', ['sequence'], 'Combat units are dropped only in the Movement Phase.', '14.10b'));
      for (const [index, id] of cargo.unitIds.entries()) {
        const unit = pieceById(state, id);
        const plan = planOf(state, id);
        if (!plan || plan.hexId !== action.targetHexId || plan.turn !== state.sequence.gameTurn) {
          issues.push(violation('NO_DROP_PLAN', ['cargo', 'unitIds', index], 'This unit is not on a Drop Plan for this hex and turn.', '14.10b'));
        }
        if (unit && method === 'PARACHUTE' && !isParaUnit(state, unit)) {
          issues.push(violation('NOT_A_PARA_UNIT', ['cargo', 'unitIds', index], 'Only Para units land by parachute; other units need glider Transports.', '14.10a'));
        }
      }
    }
  }
  return issues;
};

/** The cargo as the mission carries it. */
export const startingCargo = (state: GameState, action: Declaration): AirCargoState | null => {
  if (!action.cargo || !isTransportMission(action.mission)) return null;
  return { ...action.cargo, drop: action.mission === 'AIR_DROP' ? (dropMethod(state, action.cargo, action.aircraftIds) === 'GLIDER' ? 'GLIDER' : 'PARACHUTE') : null };
};

// ─── Flak and cargo loss (14.4g) ────────────────────────────────────────────────────────────────

export interface CargoLossOption { readonly id: string; readonly label: string }

/**
 * Cargo above the surviving capacity, to be destroyed at the owner's choice (14.4g). The shortfall rounds in favor of
 * survival: a deficit under 1T costs nothing (1T survives when a 1T plane drops to 1/2T).
 */
export const cargoLoss = (state: GameState, cargo: AirCargoState, aircraftIds: readonly PieceId[]): { readonly excess: number; readonly options: readonly CargoLossOption[] } => {
  const excess = cargoWeight(state, cargo) - cargoCapacity(state, cargo, aircraftIds);
  if (excess < 2) return { excess: 0, options: [] };
  const options: CargoLossOption[] = [
    ...cargo.unitIds.map((id) => ({ id: `unit:${id}`, label: `${definitionOf(state, pieceById(state, id)!)?.name ?? 'Unit'} (${halfTokenText(unitCargoCost(state, pieceById(state, id)!))})` })),
    ...cargo.supply.map((entry) => ({ id: `supply:${entry.sourcePieceId}`, label: `1T of supply (${entry.tokens}T loaded from this dump)` })),
  ];
  return { excess, options };
};

export const applyCargoLoss = (input: GameState, choiceId: string, events: RuleEvent[]): GameState => {
  const transaction = input.activeTransaction!;
  const cargo = transaction.air!.cargo!;
  let state = input;
  let next: AirCargoState;
  if (choiceId.startsWith('unit:')) {
    const id = choiceId.slice('unit:'.length) as PieceId;
    const unit = pieceById(state, id)!;
    state = { ...state, pieceState: upsertPieceState(state.pieceState, { ...unit, location: { kind: 'ELIMINATED' } }) };
    next = { ...cargo, unitIds: cargo.unitIds.filter((entry) => entry !== id) };
    events.push({ kind: 'AIR_CARGO_LOST', sequence: events.length, unitIds: [id], tokens: 0, reason: 'FLAK' });
  } else {
    const sourceId = choiceId.slice('supply:'.length) as PieceId;
    const dump = pieceById(state, sourceId)!;
    state = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: dump.id, quantity: 1, unitDefinitionId: definitionOf(state, dump)!.resource!.unitDefinitionId }]) };
    next = { ...cargo, supply: cargo.supply.flatMap((entry) => entry.sourcePieceId !== sourceId ? [entry] : entry.tokens > 1 ? [{ ...entry, tokens: entry.tokens - 1 }] : []) };
    events.push({ kind: 'AIR_CARGO_LOST', sequence: events.length, unitIds: [], tokens: 1, reason: 'FLAK' });
  }
  return { ...state, activeTransaction: { ...transaction, air: { ...transaction.air!, cargo: next, log: [...transaction.air!.log, `Flak cut the Transports' capacity: ${choiceId.startsWith('unit:') ? 'a unit' : '1T of supply'} is lost.`] } } };
};

// ─── Delivery ───────────────────────────────────────────────────────────────────────────────────

const unitName = (state: GameState, unit: PieceState): string => definitionOf(state, unit)?.name ?? 'Unit';

/** The hex counts as Friendly for the Success Table when a friendly unit stood in it as the phase began (14.10d). */
export const friendlyAtPhaseStart = (state: GameState, ownerId: PlayerId, hexId: HexId): boolean =>
  state.pieceState.pieces.some((piece) => {
    if (piece.ownerId !== ownerId || piece.location.kind !== 'ON_MAP' || isAircraft(state, piece)) return false;
    const start = state.usage.find((entry) => entry.pieceId === piece.id)?.phaseStartHexId ?? hexOf(piece);
    return start === hexId;
  });

/** 14.10d: Clear is Open ground or a Village, or any hex with an Air Base. */
export const clearForLanding = (state: GameState, hexId: HexId): boolean => {
  const ids = hexTerrainIds(state, hexId);
  const settled = ids.some((id) => id === 'settlement:city' || id === 'settlement:town');
  return airBaseAt(state, hexId) !== undefined || ids.includes('settlement:village') || (ids.includes('terrain:clear') && !settled);
};

/** 14.10d Air Transport Success Table: the highest failing modified roll for this hex. */
export const landingFailureMaximum = (state: GameState, ownerId: PlayerId, hexId: HexId): number =>
  AIR_TRANSPORT_FAILURE_MAXIMUM[friendlyAtPhaseStart(state, ownerId, hexId) ? 'FRIENDLY' : 'ENEMY'][clearForLanding(state, hexId) ? 'CLEAR' : 'CLOSED'];

const landUnit = (state: GameState, unit: PieceState, hexId: HexId, finished: boolean, events: RuleEvent[]): GameState => {
  let next: GameState = {
    ...state,
    pieceState: upsertPieceState(state.pieceState, { ...unit, location: { kind: 'ON_MAP', hexId }, stackOrder: nextStackOrder(state.pieceState.pieces, hexId, unit.id) }),
    // 13.3h: only a combat unit entering a Hex changes its control.
    mapState: isCombatUnit(state, unit) ? setHexControl(state.mapState, hexId, unit.ownerId) : state.mapState,
  };
  const usage = usageOf(state, unit);
  const allowance = movementAllowanceTicks(next, unit);
  // 14.10d: a unit that lands by drop has finished its movement for the phase; one flown to a base may still spend its remaining half.
  next = { ...next, usage: withUsage(next, { ...usage, airCarried: true, ...(finished ? { moved: true, movementSpentTicks: Math.max(usage.movementSpentTicks, allowance) } : {}) }) };
  return captureAt(next, unit.ownerId, hexId, events, false);
};

/** Put supply on the map at the destination as a dump joined to the one there (12.1a). */
const landSupply = (state: GameState, source: PieceState, tokens: number, hexId: HexId, tag: string): GameState => {
  const id = `air-supply:${state.sequence.gameTurn}:${hexId}:${tag}` as PieceId;
  const dump: PieceState = {
    ...source, id, location: { kind: 'ON_MAP', hexId }, resourceQuantity: tokens, statuses: [],
    stackOrder: nextStackOrder(state.pieceState.pieces, hexId, id),
  };
  return mergeSupplyAt({ ...state, pieceState: upsertPieceState(state.pieceState, dump) }, hexId, source.ownerId);
};

/** 14.9: the cargo of an Air Transport arrives at the destination Air Base. */
const deliverTransport = (input: GameState, cargo: AirCargoState, events: RuleEvent[]): GameState => {
  const transaction = input.activeTransaction!;
  const hexId = transaction.targetHexId;
  let state = input;
  for (const id of cargo.unitIds) state = landUnit(state, pieceById(state, id)!, hexId, false, events);
  let tokens = 0;
  for (const entry of cargo.supply) {
    const source = pieceById(state, entry.sourcePieceId)!;
    state = landSupply(state, source, entry.tokens, hexId, `${transaction.id}:${entry.sourcePieceId}`);
    state = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: source.id, quantity: entry.tokens, unitDefinitionId: definitionOf(state, source)!.resource!.unitDefinitionId }]) };
    tokens += entry.tokens;
  }
  const air = transaction.air!;
  const counted = countedUnloadTokens(state, cargo, air.aircraft.map(({ pieceId }) => pieceId));
  state = { ...state, air: { ...state.air, unloaded: [...state.air.unloaded, { hexId, tokens: counted }] } };
  events.push({ kind: 'AIR_CARGO_DELIVERED', sequence: events.length, hexId, unitIds: cargo.unitIds, tokens, drop: false });
  const parts = [...cargo.unitIds.map((id) => unitName(state, pieceById(state, id)!)), ...(tokens > 0 ? [`${tokens}T of supply`] : [])];
  return { ...state, activeTransaction: { ...state.activeTransaction!, air: { ...state.activeTransaction!.air!, log: [...state.activeTransaction!.air!.log, `Delivered ${parts.join(', ')} to ${hexId}.`] } } };
};

/** 14.10d: each combat unit and each 1T of supply rolls on the Air Transport Success Table. */
const dropCargo = (input: GameState, cargo: AirCargoState, events: RuleEvent[]): GameState => {
  const transaction = input.activeTransaction!;
  const hexId = transaction.targetHexId;
  const owner = transaction.ownerId;
  let state = input;
  const lines: string[] = [];
  const onEnemy = enemyCombatUnitsAt(state, owner, hexId).length > 0;
  const failure = landingFailureMaximum(state, owner, hexId);
  const drm = cargo.drop === 'GLIDER' ? 1 : 0;
  const roll = (what: string): boolean => {
    const dice = rollTwoDice(state.rng);
    state = { ...state, rng: dice.rng };
    events.push({ kind: 'DICE_ROLLED', sequence: events.length, transactionId: transaction.id, purpose: 'AIR_DROP', roll: dice.roll });
    const total = dice.roll.total + drm;
    const success = total > failure;
    lines.push(`${what}: ${total}${drm ? ` (roll ${dice.roll.total} +${drm})` : ''} on the Success Table (fails on ${failure} or less), ${success ? 'lands' : 'is lost'}`);
    return success;
  };
  const lost: PieceId[] = [];
  const landed: PieceId[] = [];
  for (const id of cargo.unitIds) {
    const unit = pieceById(state, id)!;
    // 14.10d: cargo that lands on an enemy combat unit is destroyed.
    if (onEnemy || !roll(unitName(state, unit))) {
      if (onEnemy) lines.push(`${unitName(state, unit)}: lands on an enemy combat unit and is destroyed`);
      state = { ...state, pieceState: upsertPieceState(state.pieceState, { ...unit, location: { kind: 'ELIMINATED' } }) };
      lost.push(id);
    } else {
      const before = events.length;
      state = landUnit(state, unit, hexId, true, events);
      // 9.14f: landing on an enemy Air Base captures it; its aircraft's rolls belong in the mission's result.
      for (const event of events.slice(before)) if (event.kind === 'AIR_BASE_CAPTURED') lines.push(...describeAirBaseCapture(state, event));
      landed.push(id);
    }
  }
  let tokens = 0;
  let lostTokens = 0;
  for (const entry of cargo.supply) {
    const source = pieceById(state, entry.sourcePieceId)!;
    let survived = 0;
    for (let token = 0; token < entry.tokens; token += 1) {
      if (!onEnemy && roll('1T of supply')) survived += 1;
      else if (onEnemy) lines.push('1T of supply: lands on an enemy combat unit and is destroyed');
    }
    state = { ...state, pieceState: spendReservations(state, [{ resourcePieceId: source.id, quantity: entry.tokens, unitDefinitionId: definitionOf(state, source)!.resource!.unitDefinitionId }]) };
    if (survived > 0) state = landSupply(state, source, survived, hexId, `${transaction.id}:${entry.sourcePieceId}`);
    tokens += survived;
    lostTokens += entry.tokens - survived;
  }
  // The attempt used up the plan whether or not it succeeded; planned units need no trace supply the turn they drop (12.6h).
  const attempted = new Set<PieceId>([...landed, ...lost]);
  const plans = state.air.dropPlans.flatMap((plan) => {
    const rest = plan.unitIds.filter((id) => !attempted.has(id));
    return rest.length > 0 ? [{ ...plan, unitIds: rest }] : [];
  });
  state = { ...state, air: { ...state.air, dropPlans: plans, droppedIds: [...state.air.droppedIds, ...landed.filter((id) => cargo.unitIds.includes(id))] } };
  events.push({ kind: 'AIR_CARGO_DELIVERED', sequence: events.length, hexId, unitIds: landed, tokens, drop: true });
  if (lost.length > 0 || lostTokens > 0) events.push({ kind: 'AIR_CARGO_LOST', sequence: events.length, unitIds: lost, tokens: lostTokens, reason: 'LANDING' });
  return { ...state, activeTransaction: { ...state.activeTransaction!, air: { ...state.activeTransaction!.air!, log: [...state.activeTransaction!.air!.log, ...lines.map((line) => `${line}.`)] } } };
};

/** Resolve the mission after Flak: deliver an Air Transport, or drop an Air Drop (step F of 14.2f). The caller handles cargo loss first. */
export const resolveCargo = (state: GameState, events: RuleEvent[]): GameState => {
  const air = state.activeTransaction!.air!;
  const cargo = air.cargo;
  if (!cargo || air.aircraft.length === 0) return state;
  if (cargoWeight(state, cargo) === 0) return state;
  return air.mission === 'AIR_DROP' ? dropCargo(state, cargo, events) : deliverTransport(state, cargo, events);
};

// ─── Candidates and UI queries ──────────────────────────────────────────────────────────────────

/** Transports of the player at a base that are ready to fly (Active, no mission this phase). */
export const readyTransports = (state: GameState, playerId: PlayerId): readonly PieceState[] =>
  friendlyAirBases(state, playerId).flatMap((base) => activeAircraftAt(state, playerId, hexOf(base)!))
    .filter((piece) => aircraftTransportCapacity(state, piece) > 0 && !state.air.missionFlownIds.includes(piece.id))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

/** Combat units at the base that could be loaded now, with what each costs in half-Tokens. */
export const loadableUnits = (state: GameState, playerId: PlayerId, baseHexId: HexId): readonly { readonly unit: PieceState; readonly cost: number }[] =>
  piecesAt(state, baseHexId).filter((piece) => cargoUnitProblem(state, piece, playerId, baseHexId) === null)
    .map((unit) => ({ unit, cost: unitCargoCost(state, unit) }))
    .sort((left, right) => String(left.unit.id).localeCompare(String(right.unit.id)));

/** The flight style of each carrier that reaches the destination, preferring the plainest style that works. */
const defaultRoutes = (state: GameState, planes: readonly PieceState[], target: HexId, mission: AirMissionKind): { readonly pieceId: PieceId; readonly route: AirRoute }[] | null => {
  const routes: { pieceId: PieceId; route: AirRoute }[] = [];
  for (const plane of planes) {
    const allowed = routesAllowed(state, plane, hexDistanceBetween(hexOf(plane)!, target), mission);
    const route = allowed[0];
    if (!route) return null;
    routes.push({ pieceId: plane.id, route });
  }
  return routes;
};

/** One sensible Air Transport or Air Drop for each friendly base, destination and kind of cargo, for the rule engine's candidate list. */
export const transportCandidates = (state: GameState, playerId: PlayerId, mission: 'AIR_TRANSPORT' | 'AIR_DROP', limit: number): readonly Omit<Declaration, 'actionId' | 'actorId' | 'expectedRevision'>[] => {
  const results: Omit<Declaration, 'actionId' | 'actorId' | 'expectedRevision'>[] = [];
  const transports = readyTransports(state, playerId);
  const bases = [...new Set(transports.map((piece) => hexOf(piece)!))];
  for (const baseHexId of bases) {
    const planes = transports.filter((piece) => hexOf(piece) === baseHexId).slice(0, 4);
    const dumps = baseDumps(state, playerId, baseHexId);
    const targets = mission === 'AIR_TRANSPORT'
      ? friendlyAirBases(state, playerId).map((base) => hexOf(base)!).filter((hexId) => hexId !== baseHexId)
      : dropTargets(state, playerId);
    for (const targetHexId of targets) {
      const routes = defaultRoutes(state, planes, targetHexId, mission);
      if (!routes) continue;
      const stub: AirCargoDeclaration = { baseHexId, unitIds: [], supply: [], routes };
      const capacity = cargoCapacity(state, stub, planes.map(({ id }) => id));
      const planned = mission === 'AIR_DROP'
        ? loadableUnits(state, playerId, baseHexId).filter(({ unit }) => { const plan = planOf(state, unit.id); return plan?.hexId === targetHexId && plan.turn === state.sequence.gameTurn && (isParaUnit(state, unit) || planes.every((plane) => hasIntegralGlider(state, plane))); })
        : loadableUnits(state, playerId, baseHexId);
      const unitIds: PieceId[] = [];
      let used = 0;
      for (const { unit, cost } of planned) if (used + cost <= capacity) { unitIds.push(unit.id); used += cost; }
      const supply: { sourcePieceId: PieceId; tokens: number }[] = [];
      let room = Math.floor((capacity - used) / 2);
      for (const dump of dumps) {
        if (room <= 0) break;
        const tokens = Math.min(room, dump.resourceQuantity ?? 0);
        supply.push({ sourcePieceId: dump.id, tokens });
        room -= tokens;
      }
      if (unitIds.length === 0 && supply.length === 0) continue;
      results.push({ kind: 'DECLARE_AIR_MISSION', mission, aircraftIds: planes.map(({ id }) => id), targetHexId, target: null, cargo: { baseHexId, unitIds, supply, routes } });
      if (results.length >= limit) return results;
    }
  }
  return results;
};

/** Hexes an Air Drop may reasonably target: planned drops this turn, and the hexes of and next to the player's units. */
export const dropTargets = (state: GameState, playerId: PlayerId): readonly HexId[] => {
  const hexes = new Set<HexId>();
  for (const plan of state.air.dropPlans) if (plan.ownerId === playerId && plan.turn === state.sequence.gameTurn) hexes.add(plan.hexId);
  for (const piece of state.pieceState.pieces) {
    if (piece.ownerId !== playerId || piece.location.kind !== 'ON_MAP' || isAircraft(state, piece) || !isCombatUnit(state, piece)) continue;
    const here = piece.location.hexId;
    for (const hex of state.scenario.mapDefinition.hexes) if (hexDistanceBetween(here, hex.id) <= 1) hexes.add(hex.id);
  }
  return stableSort([...hexes], (left, right) => String(left).localeCompare(String(right)));
};

/**
 * Drop Plans the rule engine can offer a player with Transports: each unplanned Para unit dropped next to the nearest enemy unit.
 * The command deck builds its own plans from the player's choice; these only keep the Aircraft Refit Phase from passing unnoticed.
 */
export interface PlanDropBody { readonly kind: 'PLAN_AIR_DROP'; readonly unitIds: readonly PieceId[]; readonly hexId: HexId; readonly turn: number }

export const dropPlanCandidates = (state: GameState, playerId: PlayerId): readonly PlanDropBody[] => {
  if (state.sequence.phase !== 'AIRCRAFT_REFIT' || state.sequence.actingPlayerId !== playerId) return [];
  if (!state.pieceState.pieces.some((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && aircraftTransportCapacity(state, piece) > 0)) return [];
  const enemy = state.pieceState.pieces.filter((piece) => piece.ownerId !== playerId && piece.location.kind === 'ON_MAP' && isCombatUnit(state, piece));
  const turn = earliestPlanTurn(state);
  if (turn > state.configuration.turnLimit) return [];
  const results: PlanDropBody[] = [];
  for (const unit of state.pieceState.pieces.filter((piece) => piece.ownerId === playerId && piece.location.kind === 'ON_MAP' && isCombatUnit(state, piece) && isParaUnit(state, piece) && !planOf(state, piece.id))) {
    const nearest = stableSort(enemy, (left, right) => hexDistanceBetween(hexOf(unit)!, hexOf(left)!) - hexDistanceBetween(hexOf(unit)!, hexOf(right)!) || String(left.id).localeCompare(String(right.id)))[0];
    if (!nearest) continue;
    const landing = state.scenario.mapDefinition.hexes.map(({ id }) => id).filter((hexId) => hexDistanceBetween(hexId, hexOf(nearest)!) === 1 && enemyCombatUnitsAt(state, playerId, hexId).length === 0)[0];
    if (landing) results.push({ kind: 'PLAN_AIR_DROP', unitIds: [unit.id], hexId: landing, turn });
  }
  return results;
};

export const transportTargets = (state: GameState, playerId: PlayerId, mission: 'AIR_TRANSPORT' | 'AIR_DROP'): readonly HexId[] => {
  const transports = readyTransports(state, playerId);
  if (transports.length === 0) return [];
  const reach = (hexId: HexId): boolean => transports.some((plane) => hexOf(plane) !== hexId && hexDistanceBetween(hexOf(plane)!, hexId) <= (mission === 'AIR_DROP' ? aircraftRange(state, plane) : 2 * aircraftRange(state, plane)));
  const hexes = mission === 'AIR_TRANSPORT' ? friendlyAirBases(state, playerId).map((base) => hexOf(base)!) : dropTargets(state, playerId);
  return hexes.filter(reach);
};

export const opponentOfOwner = (state: GameState, playerId: PlayerId): PlayerId => opponentOf(state, playerId);
export const activeTransportsAt = (state: GameState, playerId: PlayerId, hexId: HexId): readonly PieceState[] =>
  activeAircraftAt(state, playerId, hexId).filter((piece) => aircraftTransportCapacity(state, piece) > 0 && isActiveAircraft(piece));
