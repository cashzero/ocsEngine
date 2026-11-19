import type { HexId, PieceId } from '../core/index.js';
import type { GameSession, SeatId } from '../gameplay/index.js';
import type { CandidateResult, ExtenderSite, FeedSource, GameAction, HqThrow, PlannedAttack, ReachableHex, TraceCoverage } from '../rules/index.js';
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
  const attackCache = new Map<string, PlannedAttack>();
  const projectedCache = new Map<string, readonly ReachableHex[]>();
  const throwCache = new Map<string, HqThrow>();
  const arrivalCache = new Map<string, readonly HexId[]>();
  const cutCache = new Map<string, readonly PieceId[]>();
  const extenderCache = new Map<string, ExtenderSite>();
  return {
    families: () => families ??= session.getActionFamilies(seatId).filter(({ enabled }) => enabled).map(({ kind }) => kind),
    candidates: (kind, pieceId = null, budget = DEFAULT_CANDIDATE_BUDGET, options) => {
      const key = `${kind}|${pieceId ?? ''}|${budget}|${options?.groundBarrageGroupsByCost ?? false}|${options?.combatSubsets ?? false}`;
      const request = { kind, pieceId, budget, ...options };
      let result = candidateCache.get(key);
      const cacheHit = result !== undefined;
      if (result === undefined) {
        result = session.getActionCandidates(seatId, request);
        candidateCache.set(key, result);
      }
      observeQuery?.(request, result, cacheHit);
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
    projectedReach: (pieceId, fromHexId, mode) => {
      const key = `${pieceId}|${fromHexId}|${mode ?? ''}`;
      let reach = projectedCache.get(key);
      if (reach === undefined) {
        reach = session.getProjectedReach(seatId, pieceId, fromHexId, mode).value ?? [];
        projectedCache.set(key, reach);
      }
      return reach;
    },
    hqThrow: (hqId, fromHexId) => {
      const key = `${hqId}|${fromHexId}`;
      let value = throwCache.get(key);
      if (value === undefined) {
        value = session.getHqThrow(seatId, hqId, fromHexId).value ?? { fed: false, hexIds: [], servableIds: [] };
        throwCache.set(key, value);
      }
      return value;
    },
    traceCut: (pieceId, hexId, mode) => {
      const key = `${pieceId}|${hexId}|${mode ?? ''}`;
      let cut = cutCache.get(key);
      if (cut === undefined) {
        cut = session.getTraceCut(seatId, pieceId, hexId, mode).value?.cutIds ?? [];
        cutCache.set(key, cut);
      }
      return cut;
    },
    railArrivalReach: (fromHexId) => {
      let reach = arrivalCache.get(String(fromHexId));
      if (reach === undefined) {
        reach = (session.getRailArrivalReach(seatId, fromHexId).value ?? []).map(({ hexId }) => hexId);
        arrivalCache.set(String(fromHexId), reach);
      }
      return reach;
    },
    extenderSite: (hexId) => {
      let site = extenderCache.get(String(hexId));
      if (site === undefined) {
        site = session.getExtenderSite(seatId, hexId).value ?? { linked: false, drawHexIds: [] };
        extenderCache.set(String(hexId), site);
      }
      return site;
    },
    explain: (action, previewBarrageFollowUp) => session.validateDraft(session.createDraft(seatId, action), previewBarrageFollowUp),
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
    attackStrength: (attackerIds, targetHexId) => {
      const key = `${targetHexId}|${[...attackerIds].sort().join('+')}`;
      let planned = attackCache.get(key);
      if (planned === undefined) {
        planned = session.getAttackStrength(seatId, attackerIds, targetHexId).value ?? { hedgehogLevel: 0, options: [] };
        attackCache.set(key, planned);
      }
      return planned;
    },
  };
};
