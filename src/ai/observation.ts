import type { CandidateRequest, CandidateResult, GameAction } from '../rules/index.js';
import type { BotDecision, BotDecisionObservation, BotMovementCorrection, BotMovementGroup, BotMovementSupply,
  BotObservedCandidateId, BotObservedQueryId, BotPolicyObservationWriter } from './model.js';

export type BotQueryObserver = (
  request: Omit<CandidateRequest, 'actorId'>,
  result: CandidateResult,
  cacheHit: boolean,
) => void;

type ObservationMetadata = Pick<BotDecisionObservation,
  'runId' | 'decisionOrdinal' | 'seatId' | 'playerId' | 'revision' | 'stateHash' | 'stepKey' | 'policy'>;

export const createDecisionObservation = (metadata: ObservationMetadata) => {
  const candidates: Extract<BotDecisionObservation, { coverage: 'QUERY_ONLY' }>['candidates'][number][] = [];
  const candidateIds = new Map<GameAction, BotObservedCandidateId>();
  const queries: BotDecisionObservation['queries'][number][] = [];
  const queryIds = new Map<string, BotObservedQueryId>();
  const queryCalls: BotDecisionObservation['queryCalls'][number][] = [];
  const attempts: BotDecisionObservation['attempts'][number][] = [];
  const movementGroups: BotMovementGroup[] = [];
  const movementCandidates = new Set<BotObservedCandidateId>();

  const identify = (action: GameAction): BotObservedCandidateId => {
    const existing = candidateIds.get(action);
    if (existing !== undefined) return existing;
    const id: BotObservedCandidateId = `candidate:${candidates.length}`;
    candidateIds.set(action, id);
    candidates.push({ id, action, policyEvaluation: 'NOT_INSTRUMENTED' });
    return id;
  };

  const query: BotQueryObserver = (request, result, cacheHit) => {
    const key = JSON.stringify([request.kind, request.pieceId, request.budget]);
    let id = queryIds.get(key);
    if (id === undefined) {
      id = `query:${queries.length}`;
      queryIds.set(key, id);
      queries.push({ id, kind: request.kind, pieceId: request.pieceId, budget: request.budget,
        truncated: result.truncated, reasons: result.reasons, candidates: result.actions.map(identify) });
    }
    queryCalls.push({ queryId: id, cacheHit });
  };

  const policy: BotPolicyObservationWriter = {
    movement: input => {
      const { scored, ...metadata } = input;
      const snapshot = structuredClone(metadata);
      const bases = scored.map(({ action, terms }) => {
        const candidateId = identify(action);
        movementCandidates.add(candidateId);
        return { candidateId, baseTerms: structuredClone(terms), baseScore: terms.reduce((total, term) => total + term.value, 0) };
      });
      let eligibleOrder: BotObservedCandidateId[] = [];
      let checkedOrder: BotObservedCandidateId[] = [];
      let improvingOrder: BotObservedCandidateId[] = [];
      let limit = 0;
      const supplyCheckedOrder: BotObservedCandidateId[] = [];
      const corrections = new Map<BotObservedCandidateId, Extract<BotMovementCorrection, { status: 'EVALUATED' }>>();
      const supplies = new Map<BotObservedCandidateId, BotMovementSupply>();
      return {
        corrections: (eligible, checked, cap) => {
          eligibleOrder = eligible.map(identify);
          checkedOrder = checked.map(identify);
          limit = cap;
        },
        correction: (action, explanation, applied, retainedTerms) => {
          corrections.set(identify(action), structuredClone({ status: 'EVALUATED', allowed: explanation.allowed,
            applied, explanation, retainedTerms }));
        },
        improving: actions => { improvingOrder = actions.map(identify); },
        supply: (action, explanation, preserved) => {
          const candidateId = identify(action);
          supplyCheckedOrder.push(candidateId);
          supplies.set(candidateId, structuredClone({ status: 'EVALUATED', explanation, preserved }));
        },
        finish: selected => {
          const candidates = bases.map(base => {
            const correction: BotMovementCorrection = corrections.get(base.candidateId) ?? { status: 'NOT_EVALUATED',
              reason: eligibleOrder.includes(base.candidateId) ? 'CORRECTION_BUDGET' : 'NOT_ELIGIBLE' };
            const retainedTerms = correction.status === 'EVALUATED' ? correction.retainedTerms : base.baseTerms;
            const finalSupply: BotMovementSupply = supplies.get(base.candidateId) ?? { status: 'NOT_EVALUATED',
              reason: improvingOrder.includes(base.candidateId) ? 'EARLIER_CANDIDATE_SELECTED' : 'NOT_IMPROVING' };
            return { ...base, retainedTerms, retainedScore: retainedTerms.reduce((total, term) => total + term.value, 0),
              correction, finalSupply };
          });
          movementGroups.push({ ...snapshot, conditionCoverage: 'COMPOSITE_ONLY', candidates, correctionLimit: limit,
            correctionEligibleOrder: eligibleOrder, correctionCheckedOrder: checkedOrder, improvingOrder,
            supplyCheckedOrder, selectedCandidateId: selected === null ? null : identify(selected) });
        },
      };
    },
  };

  return {
    query,
    policy,
    attempt: (action: GameAction, result: Omit<BotDecisionObservation['attempts'][number], 'candidateId'>): void => {
      attempts.push({ candidateId: identify(action), ...result });
    },
    finish: (decision: BotDecision | null): BotDecisionObservation => {
      const choice = decision === null ? null : {
        candidateId: identify(decision.action), intent: decision.intent, score: decision.score,
        breakdown: decision.breakdown, alternatives: decision.alternatives.map(identify),
      };
      const common = { ...metadata, queries, queryCalls, choice, attempts };
      const [first, ...remaining] = movementGroups;
      return first === undefined
        ? structuredClone({ ...common, schemaVersion: 1, coverage: 'QUERY_ONLY', candidates })
        : structuredClone({ ...common, schemaVersion: 2, coverage: 'QUERY_AND_MOVEMENT', movementGroups: [first, ...remaining],
          candidates: candidates.map<BotDecisionObservation['candidates'][number]>(candidate => movementCandidates.has(candidate.id)
            ? { ...candidate, policyEvaluation: 'MOVEMENT_DESTINATION' } : candidate) });
    },
  };
};
