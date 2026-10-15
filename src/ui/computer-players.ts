import type { ScenarioDefinition } from '../domain/scenario/index.js';
import type { GameSession, SeatId } from '../gameplay/index.js';

/**
 * What the UI needs from the computer player, so the UI does not import the bot: the package root hands in the real one
 * (`COMPUTER_PLAYERS`), which keeps the engine layers one-way. Shapes match the bot's seat runner.
 */
export interface ComputerError {
  readonly code: string;
  readonly message: string;
  readonly seatId: SeatId | null;
  readonly revision: number;
  readonly actionKind: string | null;
  readonly violations: readonly string[];
}

export type ComputerStep =
  /** One action or decision was dispatched and accepted. */
  | { readonly kind: 'ACTED'; readonly trace: { readonly seatId: SeatId; readonly intent: string } }
  | { readonly kind: 'FINISHED' }
  /** No computer seat has anything to do now. */
  | { readonly kind: 'WAITING'; readonly reason: string }
  /** The computer cannot go on; nothing is skipped or passed on its behalf. */
  | { readonly kind: 'STUCK'; readonly error: ComputerError };

export interface ComputerRunner {
  /** Decide and dispatch one action for the computer seat that must act. Calls must not overlap. */
  readonly step: () => Promise<ComputerStep>;
  /** Forget what the seats remember of the current step (the game was restored or loaded). */
  readonly reset: () => void;
}

export interface ComputerPlayers {
  /** The policy a seat handed to the computer plays with. */
  readonly defaultPolicyId: string;
  /** Plays the session's computer seats (from its bindings); `unknown` lists seats whose policy this build does not have. */
  readonly create: (input: {
    readonly session: GameSession;
    readonly scenario: ScenarioDefinition;
    readonly turnLimit: number;
    /** Keeps this runner's request IDs apart from an earlier runner's on the same game. */
    readonly nonce: string;
  }) => { readonly runner: ComputerRunner | null; readonly unknown: readonly { readonly seatId: SeatId; readonly policyId: string }[] };
}
