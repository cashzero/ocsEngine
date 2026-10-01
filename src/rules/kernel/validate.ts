import { parseRuleActionId } from './ids.js';
import type { ActionValidation, GameAction, GameState, RuleViolation } from './model.js';
import { validateBarrageDeclaration, validateCombatDeclaration } from '../combat/combat.js';
import { validateCombineAircraft, validateReduceAirBase, validateRefit } from '../air/base.js';
import { validateAirMission } from '../air/mission.js';
import { arrivingReinforcements, validateReinforcementPlacement } from '../lifecycle/lifecycle.js';
import { validateModeChange, validateReserveRelease } from '../mode/mode.js';
import { queryMovementPath } from '../movement/movement.js';
import { unitsNeedingRecovery, validateFormationTraceChoice, validateRecovery, validateSupplyCheck } from '../supply/supply.js';
import { validateFuelPayment } from '../supply/fuel.js';
import { validateBreakout } from '../lifecycle/supply-phase.js';
import {
  validateBlowDump,
  validateCollapseExtender,
  validateCombine,
  validateDissolveExtender,
  validateDivide,
  validateFormExtender,
  validateLoad,
  validateUnload,
} from '../supply/transport.js';
import { validateDecisionResponse, validateTransactionCancel, validateTransactionCommit } from '../transaction/transaction.js';
import { violation } from '../validation/violation.js';

const commonViolations = (state: GameState, action: GameAction): RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (!parseRuleActionId(action.actionId).ok) issues.push(violation('INVALID_ACTION_ID', ['actionId'], 'Action ID is invalid.', 'engine'));
  if (action.expectedRevision !== state.revision) issues.push(violation('STALE_REVISION', ['expectedRevision'], `Expected ${action.expectedRevision}; current is ${state.revision}.`, 'engine'));
  if (!state.scenario.players.some(({ id }) => id === action.actorId)) issues.push(violation('UNKNOWN_ACTOR', ['actorId'], 'Actor is not declared by the Scenario.', 'engine'));
  if (state.sequence.phase === 'COMPLETE') issues.push(violation('GAME_ALREADY_COMPLETE', ['kind'], 'No actions are accepted after completion.', '2.2'));
  if (state.pendingDecision !== null) {
    if (action.kind !== 'RESPOND_DECISION' && action.kind !== 'CANCEL_TRANSACTION') {
      issues.push(violation('PENDING_DECISION_LOCK', ['kind'], 'Only the pending response or a withdrawal is accepted.', 'engine'));
    } else if (action.kind === 'RESPOND_DECISION' && action.actorId !== state.pendingDecision.ownerId) {
      issues.push(violation('WRONG_DECISION_OWNER', ['actorId'], 'Actor does not own the pending decision.', 'engine'));
    }
  } else if (action.kind === 'RESPOND_DECISION') {
    issues.push(violation('NO_PENDING_DECISION', ['decisionId'], 'There is no pending decision.', 'engine'));
  }
  if (state.activeTransaction !== null && !['RESPOND_DECISION', 'COMMIT_TRANSACTION', 'CANCEL_TRANSACTION'].includes(action.kind)) {
    issues.push(violation('ACTIVE_TRANSACTION_LOCK', ['kind'], 'The current combat must be resolved first.', 'engine'));
  }
  return issues;
};

export const validateAdvance = (state: GameState, actorId: GameAction['actorId']): RuleViolation[] => {
  const issues: RuleViolation[] = [];
  if (actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the sequence step.', '2.2'));
  if (state.sequence.phase === 'REINFORCEMENT' && arrivingReinforcements(state, actorId).length > 0) {
    issues.push(violation('REINFORCEMENTS_CANNOT_BE_DELAYED', ['kind'], 'Every arriving reinforcement must be placed before the phase ends.', '13.6'));
  }
  if (state.sequence.phase === 'SUPPLY' && unitsNeedingRecovery(state, actorId).length > 0) {
    issues.push(violation('INTERNALS_MUST_RECOVER', ['kind'], 'Units with Low or Exhausted internal stocks must recover them from dumps in reach first.', '12.10eA'));
  }
  return issues;
};

export const validateGameAction = (state: GameState, action: GameAction): ActionValidation => {
  const issues = commonViolations(state, action);
  if (issues.length === 0) {
    switch (action.kind) {
      case 'ADVANCE_SEQUENCE': issues.push(...validateAdvance(state, action.actorId)); break;
      case 'CHANGE_MODE': issues.push(...validateModeChange(state, action.actorId, action.pieceId, action.mode)); break;
      case 'RELEASE_RESERVE': issues.push(...validateReserveRelease(state, action.actorId, action.pieceId)); break;
      case 'MOVE_PIECE': {
        const result = queryMovementPath(state, action.actorId, action.pieceId, action.path);
        issues.push(...result.reasons.filter(({ allowed }) => !allowed).map((reason) => violation(reason.code, ['path'], reason.message, reason.rule)));
        break;
      }
      case 'CHECK_SUPPLY': issues.push(...validateSupplyCheck(state, action.actorId, action.pieceIds, action.sourcePieceId)); break;
      case 'DECLARE_COMBAT': issues.push(...validateCombatDeclaration(state, action)); break;
      case 'DECLARE_BARRAGE': issues.push(...validateBarrageDeclaration(state, action)); break;
      case 'RESPOND_DECISION': issues.push(...validateDecisionResponse(state, action.decisionId, action.choiceId)); break;
      case 'CANCEL_TRANSACTION': issues.push(...validateTransactionCancel(state, action.actorId, action.transactionId)); break;
      case 'COMMIT_TRANSACTION': issues.push(...validateTransactionCommit(state, action.actorId, action.transactionId)); break;
      case 'PLACE_REINFORCEMENT': issues.push(...validateReinforcementPlacement(state, action)); break;
      case 'PAY_FUEL': issues.push(...validateFuelPayment(state, action.actorId, action.method, action.pieceId, action.sourcePieceId)); break;
      case 'RECOVER_INTERNALS': issues.push(...validateRecovery(state, action.actorId, action.pieceId, action.sourcePieceIds)); break;
      case 'CHOOSE_FORMATION_TRACE': issues.push(...validateFormationTraceChoice(state, action.actorId, action.formationId, action.routeKey)); break;
      case 'ATTEMPT_BREAKOUT': issues.push(...validateBreakout(state, action.actorId, action.pieceId)); break;
      case 'BLOW_DUMP': issues.push(...validateBlowDump(state, action.actorId, action.dumpId, action.tokens)); break;
      case 'LOAD_SUPPLY': issues.push(...validateLoad(state, action.actorId, action.truckId, action.dumpId, action.tokens)); break;
      case 'UNLOAD_SUPPLY': issues.push(...validateUnload(state, action.actorId, action.truckId, action.tokens)); break;
      case 'COMBINE_TRANSPORT': issues.push(...validateCombine(state, action.actorId, action.truckIds)); break;
      case 'DIVIDE_TRANSPORT': issues.push(...validateDivide(state, action.actorId, action.truckId, action.points)); break;
      case 'FORM_EXTENDER': issues.push(...validateFormExtender(state, action.actorId, action.truckId)); break;
      case 'DISSOLVE_EXTENDER': issues.push(...validateDissolveExtender(state, action.actorId, action.extenderId)); break;
      case 'COLLAPSE_EXTENDER': issues.push(...validateCollapseExtender(state, action.actorId, action.extenderId, action.hexId)); break;
      case 'DECLARE_AIR_MISSION': issues.push(...validateAirMission(state, action)); break;
      case 'REFIT_AIRCRAFT': issues.push(...validateRefit(state, action)); break;
      case 'REDUCE_AIR_BASE': issues.push(...validateReduceAirBase(state, action)); break;
      case 'COMBINE_AIRCRAFT': issues.push(...validateCombineAircraft(state, action)); break;
    }
  }
  return { allowed: issues.length === 0, violations: issues };
};
