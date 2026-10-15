export * from './core/index.js';
export * from './domain/index.js';
export * from './serialization/index.js';
export * from './testing/index.js';
export * from './rules/index.js';
export * from './gameplay/index.js';
export * from './ui/index.js';
export * from './generation/index.js';
export * from './game-flow/index.js';
export * from './ai/index.js';

import { botSeatsOf, createBotSeatRunner, DEFAULT_BOT_POLICY_ID } from './ai/index.js';
import type { ComputerPlayers } from './ui/index.js';

/**
 * The computer player the UI plays with: the standard strategy, one seat runner per game. The UI never imports the bot;
 * the browser (or a test) passes this to `createUiController`.
 */
export const COMPUTER_PLAYERS: ComputerPlayers = {
  defaultPolicyId: DEFAULT_BOT_POLICY_ID,
  create: ({ session, scenario, turnLimit, nonce }) => {
    const { seats, unknown } = botSeatsOf(session.getBindings(), { scenario, turnLimit });
    return { runner: seats.length === 0 ? null : createBotSeatRunner({ session, seats, nonce }), unknown };
  },
};
