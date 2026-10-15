import type { SeatBinding } from '../gameplay/index.js';
import type { BotGameFacts } from './knowledge.js';
import type { BotPolicy, BotSeat } from './model.js';
import { createHeuristicPolicy } from './policies/heuristic.js';
import { createRandomLegalPolicy } from './policies/random-legal.js';

/** The computer player a New Game offers: the standard heuristic strategy. */
export const DEFAULT_BOT_POLICY_ID = 'heuristic';

/**
 * Prefix of a policy used to test the stall handling: `test-stall:<revision>` plays like the standard computer until
 * the game reaches that revision, then finds no action, so the player sees the stuck state and can take the seat over.
 * It is chosen only by editing a save's seat controller; New Game does not offer it.
 */
const STALL_PREFIX = 'test-stall:';

/**
 * Builds the policy a saved seat controller names, or null when this build does not know it (a save from a newer
 * version, or a typo). Policy ids are stored in saves, so an id must keep meaning the same strategy family.
 */
export const createBotPolicyById = (policyId: string, facts: BotGameFacts): BotPolicy | null => {
  if (policyId === 'heuristic') return createHeuristicPolicy(facts);
  if (policyId === 'random-legal') return createRandomLegalPolicy();
  if (policyId.startsWith(STALL_PREFIX)) {
    const limit = Number(policyId.slice(STALL_PREFIX.length));
    if (!Number.isSafeInteger(limit) || limit < 0) return null;
    const inner = createHeuristicPolicy(facts);
    return { id: policyId, version: inner.version, decide: (context) => Number(context.view.stateRevision) >= limit ? null : inner.decide(context) };
  }
  return null;
};

/** The computer seats of a binding list, each with its policy; seats whose policy is unknown are returned in `unknown`. */
export const botSeatsOf = (
  bindings: readonly SeatBinding[],
  facts: BotGameFacts,
): { readonly seats: readonly BotSeat[]; readonly unknown: readonly { readonly seatId: SeatBinding['seatId']; readonly policyId: string }[] } => {
  const seats: BotSeat[] = [];
  const unknown: { seatId: SeatBinding['seatId']; policyId: string }[] = [];
  for (const binding of bindings) {
    const controller = binding.controller;
    if (controller?.kind !== 'BOT') continue;
    const policy = createBotPolicyById(controller.policyId, facts);
    if (policy === null) unknown.push({ seatId: binding.seatId, policyId: controller.policyId });
    else seats.push({ seatId: binding.seatId, playerId: binding.playerId, policy, seed: controller.seed >>> 0 });
  }
  return { seats, unknown };
};
