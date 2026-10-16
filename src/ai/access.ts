import type { PieceId } from '../core/index.js';
import type { GameSession, SeatId } from '../gameplay/index.js';
import type { FeedSource, GameAction, ReachableHex, TraceCoverage } from '../rules/index.js';
import type { BotActionAccess } from './model.js';

/** Default candidate budget: enough for every option a policy weighs, bounded for large stacks of combinations. */
export const DEFAULT_CANDIDATE_BUDGET = 400;

/** Session queries for one seat at one revision; repeated questions in the same decision are answered once. */
export const createBotActionAccess = (session: GameSession, seatId: SeatId): BotActionAccess => {
  let families: readonly GameAction['kind'][] | null = null;
  const candidateCache = new Map<string, readonly GameAction[]>();
  const rangeCache = new Map<PieceId, readonly ReachableHex[]>();
  const coverageCache = new Map<string, TraceCoverage>();
  const feedCache = new Map<string, readonly FeedSource[]>();
  const drawCache = new Map<string, ReadonlySet<string>>();
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
    attackStrength: (attackerIds, targetHexId) => session.getAttackStrength(seatId, attackerIds, targetHexId).value,
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
