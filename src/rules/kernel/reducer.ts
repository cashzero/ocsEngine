import { parseRuleActionId, type RuleActionId } from './ids.js';
import { revision, stableSort, type PieceId } from '../../core/index.js';
import { setHexControl } from '../../domain/map/index.js';
import { upsertPieceState } from '../../domain/piece/index.js';
import { queryMovementPath } from '../movement/movement.js';
import { nextStackOrderAtHex } from '../stacking/stacking.js';
import {
  commitRuleTransaction,
  queryBarrage,
  resolveResultDecision,
  validateCombatOrBarrageDeclaration,
  validateTransactionCommit,
} from '../combat/combat.js';
import { validateModeChange, validateReserveRelease } from '../mode/mode.js';
import {
  applySequenceLifecycle,
  placeReinforcement,
  validateReinforcementPlacement,
} from '../lifecycle/lifecycle.js';
import { nextSequence } from '../sequence/sequence.js';
import {
  outOfSupplyStatusId,
  querySupply,
  supplyCheckCost,
  validateSupplyCheck,
} from '../supply/supply.js';
import {
  declareTransaction,
  reservationFromChoice,
  validateDecisionResponse,
  validateTransactionCancel,
  validateTransactionDeclaration,
} from '../transaction/transaction.js';
import { violation } from '../validation/violation.js';
import { validateGameState } from './state.js';
import type {
  ActionValidation,
  GameAction,
  GameState,
  PieceUsageState,
  RuleEvent,
  RuleViolation,
  TransitionResult,
} from './model.js';

const actionKindRule: Readonly<Record<GameAction['kind'], string>> = {
  ADVANCE_SEQUENCE: '2.2', CHANGE_MODE: '5.4', RELEASE_RESERVE: '5.7b',
  MOVE_PIECE: '6.1', CHECK_SUPPLY: '12.6', DECLARE_COMBAT: '9.1',
  DECLARE_BARRAGE: '10.0', RESPOND_DECISION: '9.2', COMMIT_TRANSACTION: '9.9',
  CANCEL_TRANSACTION: '9.2', PLACE_REINFORCEMENT: '13.6',
};

const commonViolations = (state: GameState, action: GameAction): RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (!parseRuleActionId(action.actionId).ok) issues.push(violation('INVALID_ACTION_ID', ['actionId'], 'Action ID is invalid.', 'engine'));
  if (action.expectedRevision !== state.revision) issues.push(violation('STALE_REVISION', ['expectedRevision'], `Expected ${action.expectedRevision}; current is ${state.revision}.`, 'engine'));
  if (!state.scenario.players.some(({ id }) => id === action.actorId)) issues.push(violation('UNKNOWN_ACTOR', ['actorId'], 'Actor is not declared by the Scenario.', 'engine'));
  if (state.sequence.phase === 'COMPLETE') issues.push(violation('GAME_ALREADY_COMPLETE', ['kind'], 'No actions are accepted after completion.', '2.2'));
  if (state.pendingDecision !== null) {
    if (action.kind !== 'RESPOND_DECISION' && action.kind !== 'CANCEL_TRANSACTION') {
      issues.push(violation('PENDING_DECISION_LOCK', ['kind'], 'Only the pending response or a pre-commit cancellation is accepted.', 'engine'));
    } else if (action.kind === 'RESPOND_DECISION'
      && action.actorId !== state.pendingDecision.ownerId) {
      issues.push(violation('WRONG_DECISION_OWNER', ['actorId'], 'Actor does not own the pending decision.', 'engine'));
    }
  } else if (action.kind === 'RESPOND_DECISION') {
    issues.push(violation('NO_PENDING_DECISION', ['decisionId'], 'There is no pending decision.', 'engine'));
  }
  if (state.activeTransaction !== null
    && !['RESPOND_DECISION', 'COMMIT_TRANSACTION', 'CANCEL_TRANSACTION'].includes(action.kind)) {
    issues.push(violation('ACTIVE_TRANSACTION_LOCK', ['kind'], 'Active transaction must resolve or cancel first.', 'engine'));
  }
  return issues;
};

export const validateGameAction = (state: GameState, action: GameAction): ActionValidation => {
  const issues = commonViolations(state, action);
  if (issues.length === 0) {
    switch (action.kind) {
      case 'ADVANCE_SEQUENCE':
        if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the sequence step.', '2.3'));
        if (state.currentMoverId !== null) issues.push(violation('CURRENT_MOVER_LOCK', ['kind'], 'Current mover must finish first.', '6.1'));
        break;
      case 'CHANGE_MODE': issues.push(...validateModeChange(state, action.actorId, action.pieceId, action.mode)); break;
      case 'RELEASE_RESERVE': issues.push(...validateReserveRelease(state, action.actorId, action.pieceId)); break;
      case 'MOVE_PIECE': {
        const result = queryMovementPath(state, action.actorId, action.pieceId, action.path);
        issues.push(...result.reasons.filter(({ allowed }) => !allowed).map((reason) =>
          violation(reason.code, ['path'], reason.message, reason.rule)));
        break;
      }
      case 'CHECK_SUPPLY':
        issues.push(...validateSupplyCheck(
          state,
          action.actorId,
          action.pieceIds,
          action.sourcePieceId,
        ));
        break;
      case 'DECLARE_COMBAT':
      case 'DECLARE_BARRAGE':
        issues.push(...validateTransactionDeclaration(state, action));
        issues.push(...validateCombatOrBarrageDeclaration(state, action));
        break;
      case 'RESPOND_DECISION':
        issues.push(...validateDecisionResponse(state, action.decisionId, action.choiceId));
        break;
      case 'CANCEL_TRANSACTION':
        issues.push(...validateTransactionCancel(state, action.actorId, action.transactionId));
        break;
      case 'COMMIT_TRANSACTION':
        issues.push(...validateTransactionCommit(state, action.actorId, action.transactionId));
        break;
      case 'PLACE_REINFORCEMENT':
        issues.push(...validateReinforcementPlacement(state, action));
        break;
    }
  }
  return { allowed: issues.length === 0, violations: issues };
};

const nextRevision = (state: GameState): GameState['revision'] => {
  const next = revision(state.revision + 1);
  if (!next.ok) throw new RangeError('GameState revision exhausted.');
  return next.value;
};

const usageFor = (state: GameState, pieceId: PieceId): PieceUsageState => state.usage
  .find((entry) => entry.pieceId === pieceId) ?? {
    pieceId, movementSpentTicks: 0, moved: false, fired: false,
    attacked: false, barraged: false, reserveReleased: false,
  };

const setUsage = (state: GameState, usage: PieceUsageState): readonly PieceUsageState[] => {
  const exists = state.usage.some(({ pieceId }) => pieceId === usage.pieceId);
  return stableSort(exists
    ? state.usage.map((entry) => entry.pieceId === usage.pieceId ? usage : entry)
    : [...state.usage, usage], (left, right) => String(left.pieceId).localeCompare(String(right.pieceId)));
};

const dispatch = (state: GameState, action: GameAction): { state: GameState; events: readonly RuleEvent[] } => {
  switch (action.kind) {
    case 'ADVANCE_SEQUENCE': {
      const to = nextSequence(state);
      return applySequenceLifecycle(state, to);
    }
    case 'CHANGE_MODE': {
      const piece = state.pieceState.pieces.find(({ id }) => id === action.pieceId)!;
      const definition = state.scenario.pieceCatalog.definitions.find(({id}) => id === piece.definitionId)!;
      const face = action.mode === 'COMBAT' || action.mode === 'MOVE'
        ? definition.faces.find(({id}) => id === action.mode.toLowerCase()) : undefined;
      return {
        state: { ...state, pieceState: upsertPieceState(state.pieceState, { ...piece, mode: action.mode, currentFaceId: face?.id ?? piece.currentFaceId }) },
        events: [{ kind: 'MODE_CHANGED', sequence: 0, pieceId: piece.id, from: piece.mode, to: action.mode }],
      };
    }
    case 'RELEASE_RESERVE': {
      const usage = usageFor(state, action.pieceId);
      return { state: { ...state, usage: setUsage(state, { ...usage, reserveReleased: true }) }, events: [] };
    }
    case 'MOVE_PIECE': {
      const query = queryMovementPath(state, action.actorId, action.pieceId, action.path);
      const piece = state.pieceState.pieces.find(({ id }) => id === action.pieceId)!;
      const destination = action.path.at(-1)!;
      const usage = usageFor(state, piece.id);
      const spent = query.value!.totalTicks;
      return {
        state: {
          ...state,
          pieceState: upsertPieceState(state.pieceState, {
            ...piece,
            location: { kind: 'ON_MAP', hexId: destination },
            stackOrder: nextStackOrderAtHex(state.pieceState, destination, piece.id),
          }),
          usage: setUsage(state, {
            ...usage,
            moved: true,
            movementSpentTicks: usage.movementSpentTicks + spent,
          }),
          mapState: setHexControl(state.mapState, destination, action.actorId),
        },
        events: [{ kind: 'PIECE_MOVED', sequence: 0, pieceId: piece.id, path: action.path, spentTicks: spent }],
      };
    }
    case 'CHECK_SUPPLY': {
      let pieceState = state.pieceState;
      const events: RuleEvent[] = [];
      if (action.sourcePieceId !== null) {
        const resource = pieceState.pieces.find(({ id }) => id === action.sourcePieceId)!;
        const quantity = supplyCheckCost(state, action.pieceIds);
        pieceState = upsertPieceState(pieceState, {
          ...resource,
          resourceQuantity: (resource.resourceQuantity ?? 0) - quantity,
        });
        events.push({
          kind: 'SUPPLY_SPENT', sequence: events.length,
          resourcePieceId: resource.id, quantity,
        });
      }
      for (const pieceId of action.pieceIds) {
        const piece = pieceState.pieces.find(({ id }) => id === pieceId)!;
        const inSupply = action.sourcePieceId !== null
          || querySupply(state, action.actorId, pieceId, 'TRACE').allowed;
        const existing = piece.statuses.filter(({ statusDefinitionId }) =>
          statusDefinitionId !== outOfSupplyStatusId);
        pieceState = upsertPieceState(pieceState, {
          ...piece,
          statuses: [...existing, {
            statusDefinitionId: outOfSupplyStatusId,
            value: { kind: 'FLAG', value: !inSupply },
          }],
        });
        events.push({
          kind: 'SUPPLY_STATUS_CHANGED', sequence: events.length, pieceId, inSupply,
        });
      }
      return { state: { ...state, pieceState }, events };
    }
    case 'DECLARE_COMBAT': {
      const declared = declareTransaction(state, {
        kind: action.combatKind === 'OVERRUN' ? 'OVERRUN' : 'COMBAT',
        ownerId: action.actorId,
        actionId: action.actionId,
        attackerIds: action.attackerIds,
        defenderIds: action.defenderIds,
        targetHexId: action.targetHexId,
        requiredQuantity: state.configuration.combatSupplyTokenCost,
        allowUnsupplied: true,
      });
      return {
        state: {
          ...state,
          activeTransaction: declared.transaction,
          pendingDecision: declared.decision,
          currentMoverId: action.combatKind === 'OVERRUN' ? action.attackerIds[0] ?? null : null,
        },
        events: [
          { kind: 'TRANSACTION_DECLARED', sequence: 0, transactionId: declared.transaction.id, transactionKind: declared.transaction.kind },
          { kind: 'DECISION_REQUESTED', sequence: 1, decision: declared.decision },
        ],
      };
    }
    case 'DECLARE_BARRAGE': {
      const calculation = queryBarrage(
        state,
        action.actorId,
        action.firerIds,
        action.targetPieceIds,
        action.targetHexId,
      ).value!;
      const declared = declareTransaction(state, {
        kind: 'BARRAGE',
        ownerId: action.actorId,
        actionId: action.actionId,
        attackerIds: action.firerIds,
        defenderIds: action.targetPieceIds,
        targetHexId: action.targetHexId,
        requiredQuantity: calculation.supplyTokenCost,
        allowUnsupplied: false,
      });
      return {
        state: { ...state, activeTransaction: declared.transaction, pendingDecision: declared.decision },
        events: [
          { kind: 'TRANSACTION_DECLARED', sequence: 0, transactionId: declared.transaction.id, transactionKind: 'BARRAGE' },
          { kind: 'DECISION_REQUESTED', sequence: 1, decision: declared.decision },
        ],
      };
    }
    case 'RESPOND_DECISION': {
      const transaction = state.activeTransaction!;
      if (state.pendingDecision!.kind !== 'RESOURCE_SOURCE') {
        return resolveResultDecision(state, action.choiceId);
      }
      const required = transaction.kind === 'BARRAGE'
        ? queryBarrage(
          state,
          transaction.ownerId,
          transaction.attackerIds,
          transaction.defenderIds,
          transaction.targetHexId,
        ).value!.supplyTokenCost
        : state.configuration.combatSupplyTokenCost;
      const reservation = reservationFromChoice(state, action.choiceId, required);
      const reservations = reservation ? [reservation] : [];
      return {
        state: {
          ...state,
          activeTransaction: { ...transaction, step: 'READY', reservations },
          pendingDecision: null,
        },
        events: reservation
          ? [{ kind: 'RESOURCE_RESERVED', sequence: 0, transactionId: transaction.id, reservation }]
          : [],
      };
    }
    case 'CANCEL_TRANSACTION': {
      const transaction = state.activeTransaction!;
      return {
        state: { ...state, activeTransaction: null, pendingDecision: null, currentMoverId: null },
        events: [{ kind: 'TRANSACTION_CANCELLED', sequence: 0, transactionId: transaction.id }],
      };
    }
    case 'COMMIT_TRANSACTION':
      return commitRuleTransaction(state);
    case 'PLACE_REINFORCEMENT':
      return placeReinforcement(state, action);
  }
};

export const applyGameAction = (state: GameState, action: GameAction): TransitionResult => {
  const validation = validateGameAction(state, action);
  if (!validation.allowed) return { ok: false, state, events: [], violations: validation.violations };
  const transition = dispatch(state, action);
  const candidate = { ...transition.state, revision: nextRevision(state) };
  const invariantIssues = validateGameState(candidate);
  if (invariantIssues.length > 0) {
    return {
      ok: false,
      state,
      events: [],
      violations: invariantIssues.map((entry) => violation(
        'STATE_INVARIANT_VIOLATION',
        entry.path,
        `${entry.code}: ${entry.message}`,
        'engine',
      )),
    };
  }
  return { ok: true, state: candidate, events: transition.events };
};
