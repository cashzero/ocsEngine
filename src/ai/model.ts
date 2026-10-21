import type { HexId, PieceId, PlayerId } from '../core/index.js';
import type {
  DispatchStatus,
  DispatchRequestId,
  DraftValidation,
  GameplayView,
  GameSession,
  SeatId,
} from '../gameplay/index.js';
import type { ActionFamily, CandidateResult, FeedSource, GameAction, PlannedAttack, ProjectedPiece, ReachableHex, RuleExplanation, TraceCoverage } from '../rules/index.js';

export type BotPolicyId = string;

/** Deterministic random numbers in [0, 1) for one decision; never the rules dice. */
export interface BotRng {
  readonly next: () => number;
  /** A whole number in [0, size). */
  readonly index: (size: number) => number;
  /** Picks by non-negative weight; null when every weight is 0. */
  readonly weighted: <T>(entries: readonly { readonly value: T; readonly weight: number }[]) => T | null;
}

/** The seat's legal actions and queries at the current revision, cached for one decision. */
export interface BotActionAccess {
  /** Action kinds the Rule Engine currently enables for the seat. */
  readonly families: () => readonly ActionFamily['kind'][];
  readonly candidates: (kind: GameAction['kind'], pieceId?: PieceId | null, budget?: number) => readonly GameAction[];
  readonly movementRange: (pieceId: PieceId) => readonly ReachableHex[];
  /** Whether an action built by the policy is legal now, with the facts a player sees (odds, DRM, cost). */
  readonly explain: (action: GameAction) => DraftValidation;
  /** Hexes the seat's trace supply reaches for any unit (12.6), or for one unit with 12.6f and 13.1d applied. */
  readonly traceCoverage: (pieceId?: PieceId | null) => TraceCoverage;
  /** Where each friendly dump can feed a unit out of trace (12.6c): for one unit (13.1d applies) or any unit. */
  readonly feedCoverage: (pieceId?: PieceId | null) => readonly FeedSource[];
  /** Hexes within draw range (12.3a) of SP standing in `hexId`. */
  readonly drawReach: (hexId: HexId) => ReadonlySet<string>;
  /** What these own units would count attacking `targetHexId` from beside it, per terrain the defender may choose (9.4b). */
  readonly attackStrength: (attackerIds: readonly PieceId[], targetHexId: HexId) => PlannedAttack;
}

/** What one seat remembers within the current phase/segment; reset when the step changes. */
export interface BotPhaseMemory {
  readonly stepKey: string;
  /** Accepted actions of this seat in the current step. */
  readonly actions: number;
  /** Free-form per-step notes a policy keeps (pieces already tried, plans). */
  readonly notes: Map<string, unknown>;
}

export interface BotDecisionContext {
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly view: GameplayView;
  readonly actions: BotActionAccess;
  readonly rng: BotRng;
  readonly memory: BotPhaseMemory;
  /** Internal passive writer, supplied only when decision observation is enabled. */
  readonly observation?: BotPolicyObservationWriter;
}

export interface BotScoreTerm {
  readonly term: string;
  readonly value: number;
}

export interface BotDecision {
  readonly action: GameAction;
  /** Readable purpose, for traces and later for the player. */
  readonly intent: string;
  readonly score: number;
  readonly breakdown: readonly BotScoreTerm[];
  /** Next-best legal actions, tried in order if the chosen one is rejected. */
  readonly alternatives: readonly GameAction[];
}

export interface BotPolicy {
  readonly id: BotPolicyId;
  /** Raised whenever decisions change, so traces and results name the behavior that produced them. */
  readonly version: string;
  /** Null only when the policy cannot find any legal action; the driver reports that as a stall. */
  readonly decide: (context: BotDecisionContext) => BotDecision | null;
}

export interface BotSeat {
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly policy: BotPolicy;
  /** uint32; with the state hash it fixes every random choice of this seat. */
  readonly seed: number;
}

export type BotErrorCode =
  | 'FAILED_ACTION'
  | 'BOT_STALLED'
  | 'BOT_BUDGET_EXCEEDED'
  | 'FATAL'
  | 'NO_BOT_FOR_ACTOR';

export interface BotError {
  readonly code: BotErrorCode;
  readonly message: string;
  readonly seatId: SeatId | null;
  readonly revision: number;
  readonly stepKey: string;
  readonly actionKind: GameAction['kind'] | null;
  readonly violations: readonly string[];
}

export interface BotDecisionTrace {
  readonly ordinal: number;
  readonly seatId: SeatId;
  readonly policy: string;
  readonly stepKey: string;
  readonly revision: number;
  readonly kind: 'ACTION' | 'DECISION';
  readonly action: GameAction;
  readonly intent: string;
  readonly score: number;
  readonly breakdown: readonly BotScoreTerm[];
  readonly status: DispatchStatus;
  readonly attempts: number;
  /** Actions the session rejected before `action` (empty when the first choice was accepted). */
  readonly rejections: readonly { readonly action: GameAction; readonly violations: readonly string[] }[];
  readonly decideMs: number;
  readonly dispatchMs: number;
}

export type BotObservedCandidateId = `candidate:${number}`;
export type BotObservedQueryId = `query:${number}`;

export type BotMovementCorrection =
  | { readonly status: 'NOT_EVALUATED'; readonly reason: 'NOT_ELIGIBLE' | 'CORRECTION_BUDGET' }
  | { readonly status: 'EVALUATED'; readonly allowed: boolean; readonly applied: boolean;
    readonly explanation: RuleExplanation; readonly retainedTerms: readonly BotScoreTerm[] };

export type BotMovementSupply =
  | { readonly status: 'NOT_EVALUATED'; readonly reason: 'NOT_IMPROVING' | 'EARLIER_CANDIDATE_SELECTED' }
  | { readonly status: 'EVALUATED'; readonly preserved: boolean; readonly explanation: RuleExplanation };

export interface BotMovementGroup {
  readonly pieceId: PieceId;
  readonly role: ProjectedPiece['role'];
  readonly assignedTarget: null | { readonly hexId: HexId;
    readonly purpose: 'CAPTURE' | 'GARRISON' | 'HUNT' | 'FRONT' | 'RESUPPLY' | 'ASSAULT' };
  readonly stay: { readonly origin: HexId; readonly terms: readonly BotScoreTerm[]; readonly score: number };
  readonly conditionCoverage: 'COMPOSITE_ONLY';
  readonly candidates: readonly { readonly candidateId: BotObservedCandidateId;
    readonly baseTerms: readonly BotScoreTerm[]; readonly baseScore: number;
    readonly retainedTerms: readonly BotScoreTerm[]; readonly retainedScore: number;
    readonly correction: BotMovementCorrection; readonly finalSupply: BotMovementSupply }[];
  readonly correctionLimit: number;
  readonly correctionEligibleOrder: readonly BotObservedCandidateId[];
  readonly correctionCheckedOrder: readonly BotObservedCandidateId[];
  readonly improvingOrder: readonly BotObservedCandidateId[];
  readonly supplyCheckedOrder: readonly BotObservedCandidateId[];
  readonly selectedCandidateId: BotObservedCandidateId | null;
}

export interface BotMovementGroupWriter {
  readonly corrections: (eligible: readonly GameAction[], checked: readonly GameAction[], limit: number) => void;
  readonly correction: (action: GameAction, explanation: RuleExplanation, applied: boolean, retainedTerms: readonly BotScoreTerm[]) => void;
  readonly improving: (actions: readonly GameAction[]) => void;
  readonly supply: (action: GameAction, explanation: RuleExplanation, preserved: boolean) => void;
  readonly finish: (selected: GameAction | null) => void;
}

export interface BotPolicyObservationWriter {
  readonly movement: (input: Pick<BotMovementGroup, 'pieceId' | 'role' | 'assignedTarget' | 'stay'> & {
    readonly scored: readonly { readonly action: GameAction; readonly terms: readonly BotScoreTerm[] }[];
  }) => BotMovementGroupWriter;
}

interface BotObservedCandidate {
  readonly id: BotObservedCandidateId;
  readonly action: GameAction;
  readonly policyEvaluation: 'NOT_INSTRUMENTED' | 'MOVEMENT_DESTINATION';
}

interface BotDecisionObservationCommon {
  readonly runId: string;
  readonly decisionOrdinal: number;
  readonly seatId: SeatId;
  readonly playerId: PlayerId;
  readonly revision: number;
  readonly stateHash: string;
  readonly stepKey: string;
  readonly policy: string;
  readonly queries: readonly {
    readonly id: BotObservedQueryId;
    readonly kind: GameAction['kind'];
    readonly pieceId: PieceId | null;
    readonly budget: number;
    readonly truncated: boolean;
    readonly reasons: CandidateResult['reasons'];
    readonly candidates: readonly BotObservedCandidateId[];
  }[];
  readonly queryCalls: readonly { readonly queryId: BotObservedQueryId; readonly cacheHit: boolean }[];
  readonly choice: null | {
    readonly candidateId: BotObservedCandidateId;
    readonly intent: string;
    readonly score: number;
    readonly breakdown: readonly BotScoreTerm[];
    readonly alternatives: readonly BotObservedCandidateId[];
  };
  readonly attempts: readonly {
    readonly candidateId: BotObservedCandidateId;
    readonly requestId: DispatchRequestId;
    readonly status: DispatchStatus;
    readonly violations: readonly string[];
    readonly revision: number;
  }[];
}

export type BotDecisionObservation = BotDecisionObservationCommon & (
  | { readonly schemaVersion: 1; readonly coverage: 'QUERY_ONLY';
    readonly candidates: readonly (Omit<BotObservedCandidate, 'policyEvaluation'> & { readonly policyEvaluation: 'NOT_INSTRUMENTED' })[] }
  | { readonly schemaVersion: 2; readonly coverage: 'QUERY_AND_MOVEMENT';
    readonly candidates: readonly BotObservedCandidate[];
    readonly movementGroups: readonly [BotMovementGroup, ...BotMovementGroup[]] }
);

export interface BotObservationOptions {
  readonly runId: string;
  /** Receives detached data after runner bookkeeping, including decisions with no choice. */
  readonly onDecision: (observation: BotDecisionObservation) => void;
}

export interface BotMatchOptions {
  readonly session: GameSession;
  readonly seats: readonly BotSeat[];
  /** Hard cap on accepted dispatches for the whole match. */
  readonly maxActions: number;
  /** Cap on one seat's accepted actions in one phase/segment; defaults to 6 per own piece + 50. */
  readonly stepBudget?: number;
  /** Rejected choices retried from the decision's alternatives before the match stops. */
  readonly retries?: number;
  readonly onDecision?: (trace: BotDecisionTrace) => void;
  readonly observation?: BotObservationOptions;
}

export type BotMatchStopReason =
  | 'FINISHED'
  | 'MAX_ACTIONS'
  | BotErrorCode;

export interface BotMatchResult {
  readonly stopReason: BotMatchStopReason;
  readonly accepted: number;
  readonly rejected: number;
  readonly errors: readonly BotError[];
  readonly actionCounts: Readonly<Record<string, number>>;
  /** Accepted actions by seat and kind. */
  readonly actionCountsBySeat: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly decideMs: number;
  readonly dispatchMs: number;
  readonly elapsedMs: number;
}
