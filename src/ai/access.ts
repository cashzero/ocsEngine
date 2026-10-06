import type { PieceId } from '../core/index.js';
import type { GameSession, SeatId } from '../gameplay/index.js';
import type { GameAction, ReachableHex, TraceCoverage } from '../rules/index.js';
import type { BotActionAccess } from './model.js';

/** Default candidate budget: enough for every option a policy weighs, bounded for large stacks of combinations. */
export const DEFAULT_CANDIDATE_BUDGET = 400;

/** Session queries for one seat at one revision; repeated questions in the same decision are answered once. */
export const createBotActionAccess = (session: GameSession, seatId: SeatId): BotActionAccess => {
  let families: readonly GameAction['kind'][] | null = null;
  const candidateCache = new Map<string, readonly GameAction[]>();
  const rangeCache = new Map<PieceId, readonly ReachableHex[]>();
  let coverage: TraceCoverage | null = null;
  return {
    families: () => families ??= session.getActionFamilies(seatId).filter(({ enabled }) => enabled).map(({ kind }) => kind),
    candidates: (kind, pieceId = null, budget = DEFAULT_CANDIDATE_BUDGET) => {
      const key = `${kind}|${pieceId ?? ''}|${budget}`;
      let actions = candidateCache.get(key);
      if (actions === undefined) {
        actions = session.getActionCandidates(seatId, { kind, pieceId, budget }).actions;
        candidateCache.set(key, actions);
      }
      return actions;
    },
    movementRange: (pieceId) => {
      let range = rangeCache.get(pieceId);
      if (range === undefined) {
        range = session.getMovementRange(seatId, pieceId).value ?? [];
        rangeCache.set(pieceId, range);
      }
      return range;
    },
    explain: (action) => session.validateDraft(session.createDraft(seatId, action)),
    traceCoverage: () => coverage ??= session.getTraceCoverage(seatId, null).value ?? { hexIds: [], directHexIds: [] },
  };
};
