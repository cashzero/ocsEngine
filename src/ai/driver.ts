import { parseDispatchRequestId, type DispatchRequestId, type GameplayView, type GameSession } from '../gameplay/index.js';
import type { GameAction } from '../rules/index.js';
import { createBotActionAccess } from './access.js';
import type {
  BotError,
  BotErrorCode,
  BotMatchOptions,
  BotMatchResult,
  BotPhaseMemory,
  BotSeat,
} from './model.js';
import { createBotRng } from './rng.js';

const now = (): number => globalThis.performance?.now() ?? Date.now();

const stepKeyOf = (view: GameplayView): string => {
  const sequence = view.projection?.sequence;
  return sequence === undefined ? 'locked'
    : `${sequence.gameTurn}:${sequence.playerTurnIndex}:${sequence.phase}:${sequence.segment}`;
};

const requestId = (seat: BotSeat, ordinal: number): DispatchRequestId => {
  const parsed = parseDispatchRequestId(`bot:${seat.seatId}:${ordinal}`);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
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

/**
 * Plays every bound bot seat through the Gameplay session until the game finishes or something goes wrong.
 * Only legal actions offered by the session are dispatched; a stall or a rejection stops the match and is
 * reported, never papered over by passing the phase.
 */
export const runBotMatch = async (options: BotMatchOptions): Promise<BotMatchResult> => {
  const { session, seats } = options;
  const retries = Math.max(0, options.retries ?? 3);
  const started = now();
  const errors: BotError[] = [];
  const actionCounts: Record<string, number> = {};
  const memories = new Map<string, BotPhaseMemory>();
  let accepted = 0;
  let rejected = 0;
  let decideMs = 0;
  let dispatchMs = 0;
  let ordinal = 0;
  let lastRevision = -1;
  let decisionsAtRevision = 0;

  const stop = (stopReason: BotMatchResult['stopReason']): BotMatchResult => ({
    stopReason, accepted, rejected, errors, actionCounts, decideMs, dispatchMs, elapsedMs: now() - started,
  });
  const fail = (code: BotErrorCode, message: string, seat: BotSeat | null, stepKey: string, action: GameAction | null, violations: readonly string[] = []) => {
    errors.push({
      code, message, seatId: seat?.seatId ?? null, revision: Number(session.getRevision()), stepKey,
      actionKind: action?.kind ?? null, violations,
    });
    return stop(code);
  };

  while (accepted < options.maxActions) {
    const lifecycle = session.getMetadata().lifecycle;
    if (lifecycle === 'FINISHED') return stop('FINISHED');
    if (lifecycle !== 'ACTIVE') return fail('FATAL', `Session is ${lifecycle}.`, null, '', null);
    const turn = seatToAct(session, seats);
    if (turn === null) return fail('NO_BOT_FOR_ACTOR', 'No bot seat may act and the game is not finished.', null, '', null);
    const { seat, view } = turn;
    const stepKey = stepKeyOf(view);
    let memory = memories.get(seat.seatId);
    if (memory?.stepKey !== stepKey) {
      memory = { stepKey, actions: 0, notes: new Map() };
      memories.set(seat.seatId, memory);
    }
    const budget = options.stepBudget ?? ownPieceCount(view) * 6 + 50;
    if (memory.actions >= budget) {
      return fail('BOT_BUDGET_EXCEEDED', `${memory.actions} actions in one step without ending it.`, seat, stepKey, null);
    }
    const revision = Number(view.stateRevision);
    decisionsAtRevision = revision === lastRevision ? decisionsAtRevision + 1 : 0;
    lastRevision = revision;

    const decideStart = now();
    const decision = seat.policy.decide({
      seatId: seat.seatId, playerId: seat.playerId, view, memory,
      actions: createBotActionAccess(session, seat.seatId),
      rng: createBotRng(seat.seed, String(view.metadata.stateHash), decisionsAtRevision),
    });
    const decideTime = now() - decideStart;
    decideMs += decideTime;
    if (decision === null) return fail('BOT_STALLED', 'The policy found no legal action.', seat, stepKey, null);

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
      const result = await session.dispatch({ requestId: requestId(seat, ordinal), seatId: seat.seatId, action });
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
    options.onDecision?.({
      ordinal: accepted, seatId: seat.seatId, policy: `${seat.policy.id}@${seat.policy.version}`, stepKey, revision,
      kind: view.pendingDecision !== null ? 'DECISION' : 'ACTION', action: chosen, intent: decision.intent,
      score: decision.score, breakdown: decision.breakdown, status, attempts: used, rejections, decideMs: decideTime, dispatchMs: dispatchTime,
    });
    if (status === 'FATAL') return fail('FATAL', 'The session faulted on a bot action.', seat, stepKey, chosen, violations);
    if (status !== 'ACCEPTED') {
      return fail('FAILED_ACTION', `The session rejected ${used} legal-looking action(s).`, seat, stepKey, chosen, violations);
    }
    if (used > 1) errors.push({
      code: 'FAILED_ACTION', message: `Accepted only after ${used - 1} rejection(s).`, seatId: seat.seatId,
      revision, stepKey, actionKind: decision.action.kind, violations,
    });
    accepted += 1;
    memories.set(seat.seatId, { ...memory, actions: memory.actions + 1 });
    actionCounts[chosen.kind] = (actionCounts[chosen.kind] ?? 0) + 1;
  }
  return session.getMetadata().lifecycle === 'FINISHED' ? stop('FINISHED') : stop('MAX_ACTIONS');
};
