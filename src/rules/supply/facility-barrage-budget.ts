import type { GameAction, GameState, ResourceReservation } from '../kernel/model.js';
import type { RuleFact } from '../query/model.js';
import { findBarragePaymentPlan } from '../combat/combat.js';
import { advanceRationsPreserved } from './ration-budget.js';
import { spendReservations } from './supply.js';

/** Current-turn commitments only: Reaction before the non-phasing player's turn still precedes their Supply.
 * Combat and Exploitation follow their actor's Supply; they must not charge a second ration for that turn. */
export const facilityBarrageBudgetFacts = (state: GameState, action: GameAction): readonly RuleFact[] => {
  const declaration = action.kind === 'DECLARE_BARRAGE' && action.target !== undefined && action.target !== 'COMBAT_UNITS' ? action : null;
  const payment = action.kind === 'RESPOND_DECISION' && state.pendingDecision?.kind === 'SUPPLY_SOURCE'
    && state.activeTransaction?.kind === 'BARRAGE' && (state.activeTransaction.barrageTarget ?? 'COMBAT_UNITS') !== 'COMBAT_UNITS';
  if (!declaration && !payment) return [];
  const fact = (key: string, value: string | number | boolean): RuleFact => ({ key, value, visibility: 'OWNER_ONLY', ownerId: action.actorId });
  const applicable = state.sequence.phase === 'REACTION' && state.sequence.playerTurnIndex === 0
    && state.sequence.phasingPlayerId !== action.actorId;
  if (!applicable) return [fact('supply.rationBudgetApplicable', false), fact('supply.rationCommitmentsPreserved', true)];
  const original: GameState = { ...state, activeTransaction: null, pendingDecision: null };
  const accepts = (reservations: readonly ResourceReservation[]): boolean => {
    const after: GameState = { ...original, pieceState: spendReservations(original, reservations) };
    return advanceRationsPreserved(original, after, action.actorId, []);
  };
  const plan = findBarragePaymentPlan(state, declaration, accepts);
  const preserves = action.kind === 'RESPOND_DECISION' ? findBarragePaymentPlan(state, null, accepts, action.choiceId) !== null : plan !== null;
  return [fact('supply.rationBudgetApplicable', true), fact('supply.rationCommitmentsPreserved', preserves),
    ...(plan?.[0] ? [fact('supply.barrageRationSafeChoice', plan[0])] : [])];
};
