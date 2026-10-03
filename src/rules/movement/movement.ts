import { stableSort, type HexId, type PieceId, type PlayerId } from '../../core/index.js';
import { trainbustingTicks } from '../air/aircraft.js';
import type { PieceState } from '../../domain/piece/index.js';
import type { GameState, MobilityType, RuleViolation } from '../kernel/model.js';
import type { RuleFact, RuleQueryResult } from '../query/model.js';
import {
  adjacentHexIds as adjacentOf,
  definitionOf,
  enemyCombatUnitsAt,
  friendlyCombatUnitsAt,
  isAttackCapable,
  isEligibleMover,
  isTransportPoint,
  mobilityOf,
  movementAllowanceTicks as allowanceFor,
  pieceById,
  piecesAt,
  usageOf,
} from '../pieces.js';
import { movementCostModel, type MovementStepCost } from '../terrain.js';
import { violation } from '../validation/violation.js';
import { inEnemyZoc } from '../zoc/zoc.js';
import { traceSupplyAvailableAt } from '../supply/supply.js';
import { isFueled } from '../supply/fuel.js';
import { needsFuel } from '../pieces.js';

export type { MovementStepCost } from '../terrain.js';

export interface MovementPathValue {
  readonly path: readonly HexId[];
  readonly steps: readonly MovementStepCost[];
  /** TEC cost of the path. */
  readonly totalTicks: number;
  /** MP actually charged: the cost, or the whole remaining allowance for a minimum move (6.1c). */
  readonly spentTicks: number;
  readonly allowanceTicks: number;
  readonly remainingTicks: number;
  readonly minimumMoveUsed: boolean;
  /** Friendly units whose presence negated an enemy ZOC and so may not spend MP this phase (4.5b). */
  readonly negatorIds: readonly PieceId[];
}

export const movementAllowanceTicks = (state: GameState, pieceId: PieceId): number => {
  const piece = pieceById(state, pieceId);
  return piece ? allowanceFor(state, piece) : 0;
};
const movementAllowanceTicks_ = allowanceFor;

export const pieceMobilityType = (state: GameState, pieceId: PieceId): MobilityType | null => {
  const piece = pieceById(state, pieceId);
  return piece ? mobilityOf(state, piece) : null;
};

export const phaseAllowsMovement = (state: GameState): boolean =>
  ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase) && state.sequence.segment === 'MOVEMENT';

/**
 * Friendly combat units in `hexId` able to negate an enemy ZOC for `mover` (4.5b): units that have
 * finished moving this phase, units that may not move this phase, and unmoved units (which are then
 * locked in place).
 */
const negatorsAt = (state: GameState, mover: PieceState, hexId: HexId): readonly PieceState[] =>
  friendlyCombatUnitsAt(state, mover.ownerId, hexId).filter((piece) => piece.id !== mover.id
    && !(state.currentMoverId === piece.id));

/** Why a unit may not begin or continue moving now, independent of the path. */
export const moverViolations = (state: GameState, actorId: PlayerId, piece: PieceState | undefined): RuleViolation[] => {
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], 'Unknown Piece.', '6.1')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the mover.', '6.3a'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the designated player can move units in this phase.', '6.3a'));
  if (!phaseAllowsMovement(state)) issues.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Ground movement requires a Movement Segment.', '6.0'));
  if (piece.location.kind !== 'ON_MAP') issues.push(violation('PIECE_NOT_ON_MAP', ['pieceId'], 'Mover must begin on the map.', '6.1'));
  if (piece.mode === null || definitionOf(state, piece)?.family !== 'GROUND') issues.push(violation('PIECE_CANNOT_MOVE', ['pieceId'], 'Only ground units move.', '6.1b'));
  else if (mobilityOf(state, piece) === null) issues.push(violation('UNKNOWN_MOBILITY_TYPE', ['pieceId'], 'Piece face has no Leg, Truck, or Tracked mobility type.', '3.1a'));
  else if (!isEligibleMover(state, piece)) {
    issues.push(state.sequence.phase === 'REACTION'
      ? violation('REACTION_REQUIRES_RELEASED_RESERVE', ['pieceId'], 'Only released Reserves can move in the Reaction Phase.', '7.0a')
      : violation('EXPLOITATION_REQUIRES_EXPLOIT_OR_RESERVE', ['pieceId'], 'Only Exploit Mode units and released Reserves can move in the Exploitation Phase.', '11.0a'));
  }
  const usage = usageOf(state, piece);
  if (state.air.builderIds.includes(piece.id)) {
    issues.push(violation('ENGINEER_BUILT', ['pieceId'], 'An Engineer-Capable unit that performed construction cannot move in the same phase.', '13.8d'));
  } else if (usage.moved && state.currentMoverId !== piece.id) {
    issues.push(violation('MOVEMENT_ALREADY_FINISHED', ['pieceId'], 'This unit finished moving when another unit began to move.', '6.1g'));
  }
  if (usage.negationLocked) issues.push(violation('NEGATING_UNIT_LOCKED', ['pieceId'], 'This unit negated an enemy ZOC for another unit and cannot spend MP this phase.', '4.5b'));
  // 12.5a: Truck and Track combat units spend no MP until fuel is paid (retreats and advances excepted, 12.5b).
  if (needsFuel(state, piece) && issues.length === 0 && !isFueled(state, piece)) {
    issues.push(violation('FUEL_REQUIRED', ['pieceId'], 'This Truck or Track unit needs fuel before it can spend any MP.', '12.5a'));
  }
  if (movementAllowanceTicks_(state, piece) <= 0) issues.push(violation('NO_MOVEMENT_ALLOWANCE', ['pieceId'], 'The unit has no Movement Allowance in this mode and phase.', '6.1b'));
  return issues;
};

/** 6.1g: the player may declare the unit now moving finished without beginning another one. */
export const validateEndMove = (state: GameState, actorId: PlayerId, pieceId: PieceId): RuleViolation[] => {
  const piece = pieceById(state, pieceId);
  if (!piece) return [violation('UNKNOWN_PIECE', ['pieceId'], 'Unknown Piece.', '6.1g')];
  const issues: RuleViolation[] = [];
  if (piece.ownerId !== actorId) issues.push(violation('NOT_PIECE_OWNER', ['actorId'], 'Actor does not own the mover.', '6.3a'));
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Only the designated player can move units in this phase.', '6.3a'));
  if (!phaseAllowsMovement(state)) issues.push(violation('INVALID_MOVEMENT_PHASE', ['sequence'], 'Ground movement requires a Movement Segment.', '6.0'));
  if (state.currentMoverId !== pieceId) issues.push(violation('NOT_CURRENT_MOVER', ['pieceId'], 'Only the unit now moving can finish its move.', '6.1g'));
  return issues;
};

const enterableHex = (state: GameState, piece: PieceState, hexId: HexId): RuleViolation | null => {
  if (enemyCombatUnitsAt(state, piece.ownerId, hexId).length > 0) {
    return violation('ENEMY_OCCUPIED_HEX', ['path'], 'Units cannot enter a Hex with enemy combat units; declare an overrun instead.', '4.8c');
  }
  const enemyOther = piecesAt(state, hexId).some((other) => other.ownerId !== piece.ownerId);
  if (enemyOther && !isAttackCapable(state, piece)) {
    return violation('NON_COMBAT_ENEMY_REQUIRES_ATTACK_CAPABLE', ['path'], 'Only Attack-Capable units can enter a Hex with enemy non-combat units.', '4.4c');
  }
  return null;
};

/**
 * 6.1g: a unit beginning to move ends the previous unit's move. A Transport Point that has loaded, unloaded or
 * moved may still hold MP and SP, so the player is told what moving `movingId` would give up.
 */
const endsOtherMoverFacts = (state: GameState, actorId: PlayerId, movingId: PieceId): RuleFact[] => {
  const previous = state.currentMoverId !== null && state.currentMoverId !== movingId ? pieceById(state, state.currentMoverId) : undefined;
  if (!previous || previous.ownerId !== actorId || previous.location.kind !== 'ON_MAP' || !isTransportPoint(state, previous)) return [];
  const remainingTicks = allowanceFor(state, previous) - usageOf(state, previous).movementSpentTicks;
  if (remainingTicks <= 0) return [];
  const cargoIds = new Set(state.pieceState.relations.flatMap((relation) => relation.kind === 'CARGO' && relation.containerId === previous.id ? [relation.cargoId] : []));
  const loadTokens = state.pieceState.pieces.reduce((total, piece) => cargoIds.has(piece.id) ? total + (piece.resourceQuantity ?? 0) : total, 0);
  const owner = { visibility: 'OWNER_ONLY', ownerId: actorId } as const;
  return [
    { key: 'movement.endsOtherMover.pieceId', value: previous.id, ...owner },
    { key: 'movement.endsOtherMover.remainingTicks', value: remainingTicks, ...owner },
    { key: 'movement.endsOtherMover.loadTokens', value: loadTokens, ...owner },
  ];
};

export const queryMovementPath = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
  path: readonly HexId[],
): RuleQueryResult<MovementPathValue> => {
  const piece = pieceById(state, pieceId);
  const violations = moverViolations(state, actorId, piece);
  if (piece && piece.location.kind === 'ON_MAP' && path[0] !== piece.location.hexId) {
    violations.push(violation('PATH_ORIGIN_MISMATCH', ['path', 0], 'Path must begin at the Piece location.', '6.1'));
  }
  if (path.length < 2) violations.push(violation('EMPTY_MOVEMENT_PATH', ['path'], 'Movement path needs origin and destination.', '6.1'));
  const mobility = piece ? mobilityOf(state, piece) : null;
  const allowanceTicks = piece ? movementAllowanceTicks_(state, piece) : 0;
  const usage = piece ? usageOf(state, piece) : null;
  const alreadySpent = usage?.movementSpentTicks ?? 0;
  const steps: MovementStepCost[] = [];
  const negatorIds: PieceId[] = [];
  let enteredAll = false;
  if (piece && mobility !== null) {
    const costs = movementCostModel(state, mobility);
    for (let index = 1; index < path.length; index += 1) {
      const step = costs.evaluate(path[index - 1]!, path[index]!);
      if (step.kind === 'NON_ADJACENT') { violations.push(violation('NON_ADJACENT_PATH_STEP', ['path', index], 'Path step is absent or non-adjacent.', '6.1')); continue; }
      if (step.kind === 'PROHIBITED') {
        violations.push(step.reverse
          ? violation('PROHIBITED_REVERSE_MOVE', ['path', index], 'A unit may not leave terrain it could not have entered by the same hexside.', '6.1d')
          : violation('PROHIBITED_TERRAIN', ['path', index], 'Ground units cannot enter prohibited terrain.', '6.2c'));
        continue;
      }
      const toHexId = step.cost.toHexId;
      enteredAll ||= step.all;
      const zone = trainbustingTicks(state, piece.ownerId, toHexId, mobility === 'leg');
      steps.push(step.all ? { ...step.cost, totalTicks: Math.max(step.cost.totalTicks, Math.ceil(allowanceTicks - alreadySpent)) }
        : zone > 0 ? { ...step.cost, totalTicks: step.cost.totalTicks + zone } : step.cost);
      const blocked = enterableHex(state, piece, toHexId);
      if (blocked) violations.push({ ...blocked, path: ['path', index] });
      if (piece.mode === 'STRAT' && inEnemyZoc(state, piece.ownerId, toHexId)) {
        violations.push(violation('STRAT_ENTERING_ZOC', ['path', index], 'Strat Mode units cannot enter an enemy ZOC.', '5.8a'));
      }
      if (mobility === 'truck' && inEnemyZoc(state, piece.ownerId, toHexId)) {
        const negators = negatorsAt(state, piece, toHexId);
        if (negators.length > 0) negatorIds.push(...negators.map(({ id }) => id));
        else if (index < path.length - 1) {
          violations.push(violation('TRUCK_MOVEMENT_STOPS_IN_ZOC', ['path', index], 'A unit using Truck MP must stop on entering an un-negated enemy ZOC (or overrun).', '4.5a'));
        }
      }
    }
  }
  const totalTicks = steps.reduce((total, step) => total + step.totalTicks, 0);
  const unmoved = alreadySpent === 0 && !(usage?.moved ?? false);
  const withinAllowance = totalTicks + alreadySpent <= allowanceTicks + 1e-9 && !(enteredAll && !unmoved);
  // 6.1c: one Hex regardless of cost, never into prohibited terrain (reported above), MA above zero.
  const minimumMoveUsed = !withinAllowance && path.length === 2 && unmoved && allowanceTicks > 0
    && state.configuration.minimumMoveTicks > 0;
  if (!withinAllowance && !minimumMoveUsed && piece && mobility !== null) {
    violations.push(violation('INSUFFICIENT_MOVEMENT_ALLOWANCE', ['path'], `${totalTicks / 4} MP exceed the remaining allowance.`, '6.1b'));
  }
  const destination = path.at(-1);
  if (piece?.mode === 'STRAT' && destination && violations.length === 0
    && !traceSupplyAvailableAt(state, piece.ownerId, destination)) {
    violations.push(violation('STRAT_MUST_END_IN_TRACE_SUPPLY', ['path'], 'Strat Mode units must end movement where trace supply is possible.', '5.8b'));
  }
  const allowed = violations.length === 0;
  const spent = minimumMoveUsed ? Math.max(0, Math.ceil(allowanceTicks - alreadySpent)) : totalTicks;
  return {
    allowed,
    value: {
      path: [...path], steps, totalTicks, spentTicks: spent, allowanceTicks,
      remainingTicks: Math.max(0, allowanceTicks - alreadySpent - spent), minimumMoveUsed,
      negatorIds: [...new Set(negatorIds)],
    },
    reasons: allowed
      ? [{ code: 'MOVEMENT_PATH_LEGAL', allowed: true, message: `${spent / 4} MP.`, rule: '6.1-6.3' }]
      : violations.map((entry) => ({ code: entry.code, allowed: false, message: entry.message, rule: entry.rule })),
    facts: [
      { key: 'movement.totalTicks', value: totalTicks, visibility: 'PUBLIC', ownerId: null },
      { key: 'movement.allowanceTicks', value: allowanceTicks, visibility: 'OWNER_ONLY', ownerId: actorId },
      { key: 'movement.remainingTicks', value: Math.max(0, allowanceTicks - alreadySpent - spent), visibility: 'OWNER_ONLY', ownerId: actorId },
      ...endsOtherMoverFacts(state, actorId, pieceId),
    ],
    dependencies: [{ aggregate: 'GAME', revision: state.revision, key: `movement:${pieceId}` }],
  };
};

export interface ReachableHex {
  readonly hexId: HexId;
  readonly costTicks: number;
  readonly path: readonly HexId[];
  /** Movement must stop on entering: enemy ZOC for Truck units (4.5), an "All" cost, or a minimum move (6.1). */
  readonly endsMovement?: boolean;
}

/**
 * Least-cost destinations under the same step rules as `queryMovementPath`. Every Hex constraint
 * (enemy occupation, ZOC stop, Strat ZOC) is path-independent, so one Dijkstra pass is exact.
 */
export const queryReachableHexes = (
  state: GameState,
  actorId: PlayerId,
  pieceId: PieceId,
): RuleQueryResult<readonly ReachableHex[]> => {
  const piece = pieceById(state, pieceId);
  const blockers = moverViolations(state, actorId, piece);
  const mobility = piece ? mobilityOf(state, piece) : null;
  if (!piece || blockers.length > 0 || mobility === null || piece.location.kind !== 'ON_MAP') {
    return {
      allowed: false, value: [],
      reasons: blockers.length > 0 ? blockers.map((entry) => ({ code: entry.code, allowed: false, message: entry.message, rule: entry.rule }))
        : [{ code: 'PIECE_CANNOT_MOVE', allowed: false, message: 'Piece cannot move.', rule: '6.1' }],
      facts: [], dependencies: [],
    };
  }
  const originHexId = piece.location.hexId;
  const allowance = movementAllowanceTicks_(state, piece);
  const usage = usageOf(state, piece);
  const remaining = allowance - usage.movementSpentTicks;
  const unmoved = usage.movementSpentTicks === 0 && !usage.moved;
  const minimumMove = unmoved && allowance > 0 && state.configuration.minimumMoveTicks > 0;
  const costs = movementCostModel(state, mobility);
  const best = new Map<HexId, ReachableHex>();
  const frontier = new Map<HexId, ReachableHex>([[originHexId, { hexId: originHexId, costTicks: 0, path: [originHexId] }]]);
  const terminal = new Set<HexId>();
  const hexAllowed = new Map<HexId, boolean>();
  const stopsIn = new Map<HexId, boolean>();
  const checkHex = (hexId: HexId): boolean => {
    if (!hexAllowed.has(hexId)) {
      const strat = piece.mode === 'STRAT' && inEnemyZoc(state, piece.ownerId, hexId);
      hexAllowed.set(hexId, enterableHex(state, piece, hexId) === null && !strat);
      stopsIn.set(hexId, mobility === 'truck' && inEnemyZoc(state, piece.ownerId, hexId) && negatorsAt(state, piece, hexId).length === 0);
    }
    return hexAllowed.get(hexId)!;
  };
  while (frontier.size > 0) {
    let current: ReachableHex | undefined;
    for (const entry of frontier.values()) {
      if (!current || entry.costTicks < current.costTicks
        || (entry.costTicks === current.costTicks && String(entry.hexId) < String(current.hexId))) current = entry;
    }
    frontier.delete(current!.hexId);
    best.set(current!.hexId, current!);
    if (terminal.has(current!.hexId)) continue;
    for (const next of adjacentOf(current!.hexId)) {
      if (best.has(next)) continue;
      const step = costs.evaluate(current!.hexId, next);
      if (step.kind !== 'COST' || !checkHex(next)) continue;
      const fromOrigin = current!.hexId === originHexId;
      const stepTicks = step.all ? Math.max(step.cost.totalTicks, remaining) : step.cost.totalTicks + trainbustingTicks(state, piece.ownerId, next, mobility === 'leg');
      const costTicks = current!.costTicks + stepTicks;
      const withinBudget = costTicks <= remaining + 1e-9 && !(step.all && !unmoved);
      if (!withinBudget && !(fromOrigin && minimumMove)) continue;
      const existing = frontier.get(next);
      if (existing && existing.costTicks <= costTicks) continue;
      frontier.set(next, { hexId: next, costTicks, path: [...current!.path, next] });
      if (stopsIn.get(next) || !withinBudget || step.all) terminal.add(next);
      else terminal.delete(next);
    }
  }
  let reachable = [...best.values()].filter(({ hexId }) => hexId !== originHexId)
    .map((entry) => terminal.has(entry.hexId) ? { ...entry, endsMovement: true } : entry);
  if (piece.mode === 'STRAT') reachable = reachable.filter(({ hexId }) => traceSupplyAvailableAt(state, piece.ownerId, hexId));
  const ordered = stableSort(reachable, (left, right) => left.costTicks - right.costTicks || String(left.hexId).localeCompare(String(right.hexId)));
  return {
    allowed: true,
    value: ordered,
    reasons: [{ code: 'REACHABLE_HEXES_ENUMERATED', allowed: true, message: `${ordered.length} reachable Hexes.`, rule: '6.1-6.3' }],
    facts: [
      { key: 'movement.reachableCount', value: ordered.length, visibility: 'OWNER_ONLY', ownerId: actorId },
      { key: 'movement.remainingTicks', value: remaining, visibility: 'OWNER_ONLY', ownerId: actorId },
    ],
    dependencies: [{ aggregate: 'GAME', revision: state.revision, key: `reachable:${pieceId}` }],
  };
};
