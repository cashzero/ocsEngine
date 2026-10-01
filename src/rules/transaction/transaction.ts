import type { GameState, RuleViolation } from '../kernel/model.js';
import type { RuleTransactionId } from '../kernel/ids.js';
import { violation } from '../validation/violation.js';

/** 9.2: a pending decision must match the current decision and one of its options. */
export const validateDecisionResponse = (
  state: GameState,
  decisionIdValue: string,
  choiceId: string,
): readonly RuleViolation[] => {
  const decision = state.pendingDecision;
  if (!decision || decision.id !== decisionIdValue) {
    return [violation('UNKNOWN_PENDING_DECISION', ['decisionId'], 'Decision ID does not match the pending decision.', 'engine')];
  }
  return decision.options.some(({ id }) => id === choiceId)
    ? []
    : [violation('INVALID_DECISION_CHOICE', ['choiceId'], 'Choice is not offered by the pending decision.', 'engine')];
};

/**
 * A declared combat or barrage can be withdrawn while its owner is still choosing where its supply
 * comes from; nothing is spent until the dice are rolled (10.1b: a cancelled barrage has not fired).
 */
export const validateTransactionCancel = (
  state: GameState,
  actorId: GameState['sequence']['actingPlayerId'],
  id: RuleTransactionId,
): readonly RuleViolation[] => {
  const transaction = state.activeTransaction;
  if (!transaction || transaction.id !== id) return [violation('UNKNOWN_TRANSACTION', ['transactionId'], 'Transaction is not active.', 'engine')];
  const issues: RuleViolation[] = [];
  if (transaction.ownerId !== actorId) issues.push(violation('WRONG_TRANSACTION_OWNER', ['actorId'], 'Only the attacker can withdraw the declaration.', 'engine'));
  if (transaction.step !== 'ATTACKER_SUPPLY' && transaction.step !== 'BARRAGE_SUPPLY') issues.push(violation('TRANSACTION_PAST_CANCEL_POINT', ['transactionId'], 'Once the defender responds the combat can no longer be withdrawn.', '9.2'));
  return issues;
};

/** No transaction waits for an explicit commit: dice are rolled as soon as both sides have chosen. */
export const validateTransactionCommit = (
  state: GameState,
  _actorId: GameState['sequence']['actingPlayerId'],
  id: RuleTransactionId,
): readonly RuleViolation[] => [
  violation(state.activeTransaction?.id === id ? 'TRANSACTION_NOT_READY' : 'UNKNOWN_TRANSACTION', ['transactionId'],
    'Combat and barrage resolve automatically once every required choice is made.', '9.2'),
];
