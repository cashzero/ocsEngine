import type { BotError, BotMatchOptions, BotMatchResult } from './model.js';
import { createBotSeatRunner } from './seat-runner.js';

const now = (): number => globalThis.performance?.now() ?? Date.now();

/**
 * Plays every bound bot seat through the Gameplay session until the game finishes or something goes wrong.
 * Only legal actions offered by the session are dispatched; a stall or a rejection stops the match and is
 * reported, never papered over by passing the phase.
 */
export const runBotMatch = async (options: BotMatchOptions): Promise<BotMatchResult> => {
  const { session } = options;
  const started = now();
  const extraErrors: BotError[] = [];
  const runner = createBotSeatRunner({
    session, seats: options.seats,
    ...(options.stepBudget === undefined ? {} : { stepBudget: options.stepBudget }),
    ...(options.retries === undefined ? {} : { retries: options.retries }),
    ...(options.onDecision === undefined ? {} : { onDecision: options.onDecision }),
    ...(options.observation === undefined ? {} : { observation: options.observation }),
  });
  const stop = (stopReason: BotMatchResult['stopReason']): BotMatchResult => {
    const { accepted, rejected, errors, actionCounts, actionCountsBySeat, decideMs, dispatchMs } = runner.totals();
    return {
      stopReason, accepted, rejected, errors: [...errors, ...extraErrors], actionCounts, actionCountsBySeat, decideMs, dispatchMs,
      elapsedMs: now() - started,
    };
  };
  // A runner that has nothing to do is not an error for a UI (a person is to act); a headless match with no one to act is.
  const stopWith = (code: 'FATAL' | 'NO_BOT_FOR_ACTOR', message: string): BotMatchResult => {
    extraErrors.push({ code, message, seatId: null, revision: Number(session.getRevision()), stepKey: '', actionKind: null, violations: [] });
    return stop(code);
  };

  while (runner.totals().accepted < options.maxActions) {
    const step = await runner.step();
    if (step.kind === 'FINISHED') return stop('FINISHED');
    if (step.kind === 'STUCK') return stop(step.error.code);
    if (step.kind === 'WAITING') {
      return step.reason === 'SESSION_INACTIVE'
        ? stopWith('FATAL', `Session is ${session.getMetadata().lifecycle}.`)
        : stopWith('NO_BOT_FOR_ACTOR', 'No bot seat may act and the game is not finished.');
    }
  }
  return session.getMetadata().lifecycle === 'FINISHED' ? stop('FINISHED') : stop('MAX_ACTIONS');
};
