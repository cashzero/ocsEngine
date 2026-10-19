import type { CandidateRequest, CandidateResult, GameAction } from '../rules/index.js';
import type { BotDecision, BotDecisionObservation, BotObservedCandidateId, BotObservedQueryId } from './model.js';

export type BotQueryObserver = (
  request: Omit<CandidateRequest, 'actorId'>,
  result: CandidateResult,
  cacheHit: boolean,
) => void;

type ObservationMetadata = Pick<BotDecisionObservation,
  'runId' | 'decisionOrdinal' | 'seatId' | 'playerId' | 'revision' | 'stateHash' | 'stepKey' | 'policy'>;

export const createDecisionObservation = (metadata: ObservationMetadata) => {
  const candidates: BotDecisionObservation['candidates'][number][] = [];
  const candidateIds = new Map<GameAction, BotObservedCandidateId>();
  const queries: BotDecisionObservation['queries'][number][] = [];
  const queryIds = new Map<string, BotObservedQueryId>();
  const queryCalls: BotDecisionObservation['queryCalls'][number][] = [];
  const attempts: BotDecisionObservation['attempts'][number][] = [];

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

  return {
    query,
    attempt: (action: GameAction, result: Omit<BotDecisionObservation['attempts'][number], 'candidateId'>): void => {
      attempts.push({ candidateId: identify(action), ...result });
    },
    finish: (decision: BotDecision | null): BotDecisionObservation => {
      const choice = decision === null ? null : {
        candidateId: identify(decision.action), intent: decision.intent, score: decision.score,
        breakdown: decision.breakdown, alternatives: decision.alternatives.map(identify),
      };
      return structuredClone({ ...metadata, schemaVersion: 1, coverage: 'QUERY_ONLY',
        candidates, queries, queryCalls, choice, attempts });
    },
  };
};
