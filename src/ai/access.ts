import type { PieceId } from '../core/index.js';
import type { GameSession, SeatId } from '../gameplay/index.js';
import type { CandidateResult, FeedSource, GameAction, ReachableHex, TraceCoverage } from '../rules/index.js';
import type { BotActionAccess } from './model.js';
import type { BotQueryObserver } from './observation.js';

/** Default candidate budget: enough for every option a policy weighs, bounded for large stacks of combinations. */
export const DEFAULT_CANDIDATE_BUDGET = 400;

/** Session queries for one seat at one revision; repeated questions in the same decision are answered once. */
export const createBotActionAccess = (session: GameSession, seatId: SeatId, observeQuery?: BotQueryObserver): BotActionAccess => {
  let families: readonly GameAction['kind'][] | null = null;
  const candidateCache = new Map<string, CandidateResult>();
  const rangeCache = new Map<PieceId, readonly ReachableHex[]>();
  const coverageCache = new Map<string, TraceCoverage>();
  const feedCache = new Map<string, readonly FeedSource[]>();
  const drawCache = new Map<string, ReadonlySet<string>>();
  return {
    families: () => families ??= session.getActionFamilies(seatId).filter(({ enabled }) => enabled).map(({ kind }) => kind),
    candidates: (kind, pieceId = null, budget = DEFAULT_CANDIDATE_BUDGET) => {
      const key = `${kind}|${pieceId ?? ''}|${budget}`;
      let result = candidateCache.get(key);
      const cacheHit = result !== undefined;
      if (result === undefined) {
        result = session.getActionCandidates(seatId, { kind, pieceId, budget });
        candidateCache.set(key, result);
      }
      observeQuery?.({ kind, pieceId, budget }, result, cacheHit);
      return result.actions;
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
    traceCoverage: (pieceId = null) => {
      let coverage = coverageCache.get(String(pieceId));
      if (coverage === undefined) {
        coverage = session.getTraceCoverage(seatId, pieceId).value ?? { hexIds: [], directHexIds: [] };
        coverageCache.set(String(pieceId), coverage);
      }
      return coverage;
    },
    drawReach: (hexId) => {
      let reach = drawCache.get(String(hexId));
      if (reach === undefined) {
        reach = new Set((session.getDrawReach(seatId, hexId).value ?? []).map(String));
        drawCache.set(String(hexId), reach);
      }
      return reach;
    },
    feedCoverage: (pieceId = null) => {
      let feeds = feedCache.get(String(pieceId));
      if (feeds === undefined) {
        feeds = session.getFeedCoverage(seatId, pieceId).value ?? [];
        feedCache.set(String(pieceId), feeds);
      }
      return feeds;
    },
  };
};
