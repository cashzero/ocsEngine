import {
  parseRuleDecisionId,
  parseRuleTransactionId,
  type RuleDecisionId,
  type RuleTransactionId,
} from '../kernel/ids.js';
import type {
  GameAction,
  GameState,
  PendingDecision,
  ResourceReservation,
  RuleTransaction,
  RuleTransactionKind,
  RuleViolation,
} from '../kernel/model.js';
import { queryResourceSources } from '../supply/supply.js';
import { violation } from '../validation/violation.js';

const transactionId = (actionId: string): RuleTransactionId => {
  const parsed = parseRuleTransactionId(`transaction:${actionId}`);
  if (!parsed.ok) throw new Error('Generated transaction ID is invalid.');
  return parsed.value;
};

const decisionId = (actionId: string): RuleDecisionId => {
  const parsed = parseRuleDecisionId(`decision:${actionId}`);
  if (!parsed.ok) throw new Error('Generated decision ID is invalid.');
  return parsed.value;
};

export interface TransactionDeclaration {
  readonly kind: RuleTransactionKind;
  readonly ownerId: GameState['sequence']['actingPlayerId'];
  readonly actionId: string;
  readonly attackerIds: RuleTransaction['attackerIds'];
  readonly defenderIds: RuleTransaction['defenderIds'];
  readonly targetHexId: RuleTransaction['targetHexId'];
  readonly requiredQuantity: number;
  readonly allowUnsupplied: boolean;
}

export const declareTransaction = (
  state: GameState,
  declaration: TransactionDeclaration,
): { readonly transaction: RuleTransaction; readonly decision: PendingDecision } => {
  const id = transactionId(declaration.actionId);
  const sources = queryResourceSources(
    state,
    declaration.ownerId,
    declaration.targetHexId,
    declaration.requiredQuantity,
  );
  const options = [
    ...sources.map((source) => ({ id: `resource:${source.pieceId}`, label: `${source.pieceId} (${source.availableQuantity})` })),
    ...(declaration.allowUnsupplied ? [{ id: 'UNSUPPLIED', label: 'Proceed without combat supply' }] : []),
  ];
  return {
    transaction: {
      id,
      kind: declaration.kind,
      step: 'AWAITING_RESOURCE',
      ownerId: declaration.ownerId,
      originRevision: state.revision,
      attackerIds: [...declaration.attackerIds],
      defenderIds: [...declaration.defenderIds],
      targetHexId: declaration.targetHexId,
      reservations: [],
      roll: null,
      result: null,
    },
    decision: {
      id: decisionId(declaration.actionId),
      kind: 'RESOURCE_SOURCE',
      ownerId: declaration.ownerId,
      transactionId: id,
      options,
    },
  };
};

export const reservationFromChoice = (
  state: GameState,
  choiceId: string,
  quantity: number,
): ResourceReservation | null => {
  if (!choiceId.startsWith('resource:')) return null;
  const pieceId = choiceId.slice('resource:'.length);
  const piece = state.pieceState.pieces.find(({ id }) => id === pieceId);
  const definition = piece
    ? state.scenario.pieceCatalog.definitions.find(({ id }) => id === piece.definitionId)
    : undefined;
  return piece && definition?.resource
    ? {
      resourcePieceId: piece.id,
      quantity,
      unitDefinitionId: definition.resource.unitDefinitionId,
    }
    : null;
};

export const validateTransactionDeclaration = (
  state: GameState,
  action: Extract<GameAction, { readonly kind: 'DECLARE_COMBAT' | 'DECLARE_BARRAGE' }>,
): readonly RuleViolation[] => {
  const issues: RuleViolation[] = [];
  const attackers = action.kind === 'DECLARE_COMBAT' ? action.attackerIds : action.firerIds;
  const defenders = action.kind === 'DECLARE_COMBAT' ? action.defenderIds : action.targetPieceIds;
  if (action.actorId !== state.sequence.actingPlayerId) issues.push(violation('WRONG_ACTOR', ['actorId'], 'Actor does not own the current sequence step.', '2.3'));
  if (attackers.length === 0 || defenders.length === 0
    || new Set(attackers).size !== attackers.length
    || new Set(defenders).size !== defenders.length) {
    issues.push(violation('INVALID_TRANSACTION_PARTICIPANTS', ['participants'], 'Participants must be non-empty unique lists.', action.kind === 'DECLARE_COMBAT' ? '9.1' : '10.0'));
  }
  const attackerPieces = attackers.map((id) => state.pieceState.pieces.find((piece) => piece.id === id));
  const defenderPieces = defenders.map((id) => state.pieceState.pieces.find((piece) => piece.id === id));
  if (attackerPieces.some((piece) => !piece || piece.ownerId !== action.actorId)) {
    issues.push(violation('INVALID_ATTACKER', ['participants'], 'Every attacker/firer must exist and be owned by actor.', action.kind === 'DECLARE_COMBAT' ? '9.1' : '10.0'));
  }
  if (defenderPieces.some((piece) => !piece || piece.ownerId === action.actorId
    || piece.location.kind !== 'ON_MAP' || piece.location.hexId !== action.targetHexId)) {
    issues.push(violation('INVALID_DEFENDER', ['participants'], 'Every target must be enemy and occupy target Hex.', action.kind === 'DECLARE_COMBAT' ? '9.1' : '10.0'));
  }
  if (action.kind === 'DECLARE_COMBAT') {
    const allowed = action.combatKind === 'REGULAR'
      ? state.sequence.phase === 'COMBAT' && state.sequence.segment === 'COMBAT'
      : ['MOVEMENT', 'REACTION', 'EXPLOITATION'].includes(state.sequence.phase)
        && state.sequence.segment === 'MOVEMENT';
    if (!allowed) issues.push(violation('INVALID_COMBAT_PHASE', ['sequence'], `${action.combatKind} is not allowed in this segment.`, action.combatKind === 'REGULAR' ? '9.1' : '8.1'));
  } else {
    const allowed = state.sequence.segment === 'BARRAGE'
      && ['MOVEMENT', 'REACTION', 'COMBAT', 'EXPLOITATION'].includes(state.sequence.phase);
    if (!allowed) issues.push(violation('INVALID_BARRAGE_PHASE', ['sequence'], 'Barrage requires an allowed Barrage Segment.', '10.0e'));
  }
  return issues;
};

export const validateDecisionResponse = (
  state: GameState,
  decisionIdValue: string,
  choiceId: string,
): readonly RuleViolation[] => {
  const decision = state.pendingDecision;
  if (!decision || decision.id !== decisionIdValue) {
    return [violation('UNKNOWN_PENDING_DECISION', ['decisionId'], 'Decision ID does not match pending decision.', 'engine')];
  }
  return decision.options.some(({ id }) => id === choiceId)
    ? []
    : [violation('INVALID_DECISION_CHOICE', ['choiceId'], 'Choice is not allowed by pending decision.', 'engine')];
};

export const validateTransactionCancel = (
  state: GameState,
  actorId: GameState['sequence']['actingPlayerId'],
  id: RuleTransactionId,
): readonly RuleViolation[] => {
  const transaction = state.activeTransaction;
  if (!transaction || transaction.id !== id) return [violation('UNKNOWN_TRANSACTION', ['transactionId'], 'Transaction is not active.', 'engine')];
  const issues: RuleViolation[] = [];
  if (transaction.ownerId !== actorId) issues.push(violation('WRONG_TRANSACTION_OWNER', ['actorId'], 'Actor does not own transaction.', 'engine'));
  if (transaction.roll !== null || !['AWAITING_RESOURCE', 'READY'].includes(transaction.step)) {
    issues.push(violation('TRANSACTION_PAST_CANCEL_POINT', ['transactionId'], 'Transaction cannot cancel after RNG commit.', '9.2'));
  }
  return issues;
};
