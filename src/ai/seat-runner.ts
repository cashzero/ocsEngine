import { parseDispatchRequestId, type DispatchRequestId, type GameplayView, type GameSession } from '../gameplay/index.js';
import type { GameAction } from '../rules/index.js';
import { createBotActionAccess } from './access.js';
import type { BotDecisionTrace, BotError, BotErrorCode, BotObservationOptions, BotPhaseMemory, BotSeat } from './model.js';
import { createDecisionObservation } from './observation.js';
import { createBotRng } from './rng.js';

const now = (): number => globalThis.performance?.now() ?? Date.now();

const stepKeyOf = (view: GameplayView): string => {
  const sequence = view.projection?.sequence;
  return sequence === undefined ? 'locked'
    : `${sequence.gameTurn}:${sequence.playerTurnIndex}:${sequence.phase}:${sequence.segment}`;
};

/** The seat that must act now: the owner of a pending decision first (often the defender), then the acting player. */
const seatToAct = (session: GameSession, seats: readonly BotSeat[]): { seat: BotSeat; view: GameplayView } | null => {
  const deciding = seats.find((seat) => session.getPendingDecision(seat.seatId) !== null);
  if (deciding !== undefined) return { seat: deciding, view: session.getView(deciding.seatId) };
  // Projections are costly; build one and reuse it when it belongs to the acting seat.
  const first = session.getView(seats[0]!.seatId);
  const sequence = first.projection?.sequence;
  if (sequence === undefined || first.projection!.pendingDecision !== null) return null;
  const acting = seats.find(({ playerId }) => playerId === sequence.actingPlayerId);
  if (acting === undefined) return null;
  return { seat: acting, view: acting === seats[0] ? first : session.getView(acting.seatId) };
};

const ownPieceCount = (view: GameplayView): number => view.projection?.stacks
  .reduce((total, { pieces }) => total + pieces.filter(({ ownerId }) => ownerId === view.playerId).length, 0) ?? 0;

/** Most positions whose per-step memory is kept for a restore; older ones are forgotten. */
const MEMORY_SNAPSHOTS_KEPT = 1500;

const cloneMemories = (memories: ReadonlyMap<string, BotPhaseMemory>): Map<string, BotPhaseMemory> =>
  new Map([...memories].map(([seatId, memory]) => [seatId, { stepKey: memory.stepKey, actions: memory.actions, notes: structuredClone(memory.notes) }]));

export interface BotSeatRunnerOptions {
  readonly session: GameSession;
  /** The seats the computer plays; any other seat is left to a person. */
  readonly seats: readonly BotSeat[];
  /** Cap on one seat's accepted actions in one phase/segment; defaults to 6 per own piece + 50. */
  readonly stepBudget?: number;
  /** Rejected choices retried from the decision's alternatives before the runner reports a stall. */
  readonly retries?: number;
  /**
   * Distinguishes this runner's dispatch request IDs from those of an earlier runner on the same game: a session
   * refuses a request ID it has already seen, and a loaded game remembers the IDs of every accepted action.
   */
  readonly nonce?: string;
  readonly onDecision?: (trace: BotDecisionTrace) => void;
  readonly observation?: BotObservationOptions;
}

/** What one `step()` did. */
export type BotStep =
  /** One action or decision was dispatched and accepted. */
  | { readonly kind: 'ACTED'; readonly trace: BotDecisionTrace }
  /** The game is over. */
  | { readonly kind: 'FINISHED' }
  /** No computer seat has anything to do now: a person is to act, or the session is not accepting actions. */
  | { readonly kind: 'WAITING'; readonly reason: 'PERSON_TO_ACT' | 'SESSION_INACTIVE' }
  /** The computer cannot go on; the error says why. Nothing is skipped or passed on its behalf. */
  | { readonly kind: 'STUCK'; readonly error: BotError };

export interface BotSeatRunnerTotals {
  readonly accepted: number;
  readonly rejected: number;
  readonly errors: readonly BotError[];
  readonly actionCounts: Readonly<Record<string, number>>;
  readonly actionCountsBySeat: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly decideMs: number;
  readonly dispatchMs: number;
}

export interface BotSeatRunner {
  /** Decide and dispatch one action for the seat that must act. Calls must not overlap. */
  readonly step: () => Promise<BotStep>;
  /** Forget what each seat remembers of the current step; call after the game was restored or loaded. */
  readonly reset: () => void;
  readonly totals: () => BotSeatRunnerTotals;
}

/**
 * Plays computer seats one action at a time through the Gameplay session (the same `dispatch` a person's click
 * reaches). Only legal actions offered by the session are dispatched; a stall or a rejection is reported as STUCK,
 * never papered over by passing the phase. The headless match loop and the browser's playback both drive this.
 */
export const createBotSeatRunner = (options: BotSeatRunnerOptions): BotSeatRunner => {
  const { session, seats } = options;
  const retries = Math.max(0, options.retries ?? 3);
  const nonce = options.nonce === undefined ? '' : `${options.nonce}:`;
  const errors: BotError[] = [];
  const actionCounts: Record<string, number> = {};
  const actionCountsBySeat: Record<string, Record<string, number>> = {};
  let memories = new Map<string, BotPhaseMemory>();
  /**
   * What each seat remembered of its step just before the first decision at a revision. A policy plans within a step
   * (which units are done, what it has claimed), so going back to a checkpoint must give it back that memory: the same
   * position then gets the same decisions. A game loaded mid-step has none and the policy plans the rest of the step afresh.
   */
  const snapshots = new Map<number, Map<string, BotPhaseMemory>>();
  let accepted = 0;
  let rejected = 0;
  let decideMs = 0;
  let dispatchMs = 0;
  let ordinal = 0;
  let lastRevision = -1;
  let decisionsAtRevision = 0;
  let observationOrdinal = 0;

  const requestId = (seat: BotSeat): DispatchRequestId => {
    const parsed = parseDispatchRequestId(`bot:${seat.seatId}:${nonce}${ordinal}`);
    if (!parsed.ok) throw new Error(parsed.error.message);
    return parsed.value;
  };
  const fail = (code: BotErrorCode, message: string, seat: BotSeat | null, stepKey: string, action: GameAction | null, violations: readonly string[] = []): BotStep => {
    const error: BotError = {
      code, message, seatId: seat?.seatId ?? null, revision: Number(session.getRevision()), stepKey,
      actionKind: action?.kind ?? null, violations,
    };
    errors.push(error);
    return { kind: 'STUCK', error };
  };

  const step = async (): Promise<BotStep> => {
    const lifecycle = session.getMetadata().lifecycle;
    if (lifecycle === 'FINISHED') return { kind: 'FINISHED' };
    if (lifecycle === 'FAULTED' || lifecycle === 'CLOSED') return fail('FATAL', `Session is ${lifecycle}.`, null, '', null);
    if (lifecycle !== 'ACTIVE') return { kind: 'WAITING', reason: 'SESSION_INACTIVE' };
    const turn = seatToAct(session, seats);
    if (turn === null) return { kind: 'WAITING', reason: 'PERSON_TO_ACT' };
    const { seat, view } = turn;
    const stepKey = stepKeyOf(view);
    const revision = Number(view.stateRevision);
    // A restored checkpoint puts the game back: the seats remember what they did before that position, not what came after.
    if (revision < lastRevision) {
      const earlier = snapshots.get(revision);
      memories = earlier === undefined ? new Map() : cloneMemories(earlier);
      for (const kept of [...snapshots.keys()]) if (kept >= revision) snapshots.delete(kept);
    }
    if (revision !== lastRevision && !snapshots.has(revision)) {
      try {
        snapshots.set(revision, cloneMemories(memories));
        if (snapshots.size > MEMORY_SNAPSHOTS_KEPT) snapshots.delete(snapshots.keys().next().value!);
      } catch { /* A note that cannot be copied means no snapshot here: a restore to this position re-plans the step. */ }
    }
    let memory = memories.get(seat.seatId);
    if (memory?.stepKey !== stepKey) {
      memory = { stepKey, actions: 0, notes: new Map() };
      memories.set(seat.seatId, memory);
    }
    const budget = options.stepBudget ?? ownPieceCount(view) * 6 + 50;
    if (memory.actions >= budget) {
      return fail('BOT_BUDGET_EXCEEDED', `${memory.actions} actions in one step without ending it.`, seat, stepKey, null);
    }
    decisionsAtRevision = revision === lastRevision ? decisionsAtRevision + 1 : 0;
    lastRevision = revision;

    const decideStart = now();
    const observation = options.observation === undefined ? undefined : createDecisionObservation({
      runId: options.observation.runId, decisionOrdinal: observationOrdinal++,
      seatId: seat.seatId, playerId: seat.playerId, revision, stateHash: String(view.metadata.stateHash),
      stepKey, policy: `${seat.policy.id}@${seat.policy.version}`,
    });
    const decision = seat.policy.decide({
      seatId: seat.seatId, playerId: seat.playerId, view, memory,
      actions: createBotActionAccess(session, seat.seatId, observation?.query),
      rng: createBotRng(seat.seed, String(view.metadata.stateHash), decisionsAtRevision),
    });
    const decideTime = now() - decideStart;
    decideMs += decideTime;
    if (decision === null) {
      const result = fail('BOT_STALLED', 'The policy found no legal action.', seat, stepKey, null);
      if (observation) options.observation?.onDecision(observation.finish(null));
      return result;
    }

    const attempts = [decision.action, ...decision.alternatives.slice(0, retries)];
    let status: 'ACCEPTED' | 'REJECTED' | 'DUPLICATE' | 'FATAL' = 'REJECTED';
    let used = 0;
    let dispatchTime = 0;
    let violations: readonly string[] = [];
    let chosen = decision.action;
    const rejections: { action: GameAction; violations: readonly string[] }[] = [];
    for (const action of attempts) {
      used += 1;
      chosen = action;
      const dispatchStart = now();
      const result = await session.dispatch({ requestId: requestId(seat), seatId: seat.seatId, action });
      observation?.attempt(action, { requestId: result.requestId, status: result.status,
        violations: result.violations.map(({ code }) => code), revision: Number(result.revision) });
      ordinal += 1;
      dispatchTime += now() - dispatchStart;
      status = result.status;
      if (status === 'ACCEPTED') break;
      violations = result.violations.map(({ code }) => code);
      if (status === 'FATAL') break;
      rejected += 1;
      rejections.push({ action, violations });
    }
    dispatchMs += dispatchTime;
    const trace: BotDecisionTrace = {
      ordinal: accepted, seatId: seat.seatId, policy: `${seat.policy.id}@${seat.policy.version}`, stepKey, revision,
      kind: view.pendingDecision !== null ? 'DECISION' : 'ACTION', action: chosen, intent: decision.intent,
      score: decision.score, breakdown: decision.breakdown, status, attempts: used, rejections, decideMs: decideTime, dispatchMs: dispatchTime,
    };
    const publish = (): void => {
      if (observation) options.observation?.onDecision(observation.finish(decision));
    };
    options.onDecision?.(trace);
    if (status === 'FATAL') {
      const result = fail('FATAL', 'The session faulted on a bot action.', seat, stepKey, chosen, violations);
      publish();
      return result;
    }
    if (status !== 'ACCEPTED') {
      const result = fail('FAILED_ACTION', `The session rejected ${used} legal-looking action(s).`, seat, stepKey, chosen, violations);
      publish();
      return result;
    }
    if (used > 1) errors.push({
      code: 'FAILED_ACTION', message: `Accepted only after ${used - 1} rejection(s).`, seatId: seat.seatId,
      revision, stepKey, actionKind: decision.action.kind, violations,
    });
    accepted += 1;
    memories.set(seat.seatId, { ...memory, actions: memory.actions + 1 });
    actionCounts[chosen.kind] = (actionCounts[chosen.kind] ?? 0) + 1;
    const seatCounts = actionCountsBySeat[seat.seatId] ??= {};
    seatCounts[chosen.kind] = (seatCounts[chosen.kind] ?? 0) + 1;
    publish();
    return { kind: 'ACTED', trace };
  };

  return {
    step,
    reset: () => { memories = new Map(); snapshots.clear(); lastRevision = -1; decisionsAtRevision = 0; },
    totals: () => ({ accepted, rejected, errors, actionCounts, actionCountsBySeat, decideMs, dispatchMs }),
  };
};
