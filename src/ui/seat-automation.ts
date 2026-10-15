import type { ScenarioDefinition } from '../domain/scenario/index.js';
import { isBotSeat, type GameSession, type HistoryRecord, type SeatBinding, type SeatId } from '../gameplay/index.js';
import type { ComputerError, ComputerPlayers, ComputerRunner } from './computer-players.js';
import type { AutomationInfo, ComputerAction, ComputerStuck, PlaybackSpeed } from './model.js';

/** Pause between one computer action and the next, so a person can follow what happens. INSTANT only yields to the page. */
export const PLAYBACK_DELAYS_MS: Readonly<Record<PlaybackSpeed, number>> = { SLOW: 1200, NORMAL: 500, FAST: 120, INSTANT: 0 };

/** Shortest time between two redraws while playing INSTANT: the computers go on, the page draws a few times a second. */
export const INSTANT_REDRAW_MS = 250;

export interface SeatAutomationHost {
  /** The computer player; without one, a game with computer seats stops at once and says so. */
  readonly computers: ComputerPlayers | undefined;
  readonly session: () => GameSession;
  readonly scenario: ScenarioDefinition;
  /** The game's turn limit, which the computer's strategy plans against. */
  readonly turnLimit: number;
  /** A person's operation is under way; the computer waits for it to finish. */
  readonly personBusy: () => boolean;
  /** The automation's state or the game changed: redraw. */
  readonly changed: () => void;
  /** What a record says to the viewer, and the hex it touched when the viewer may look there. */
  readonly describe: (record: HistoryRecord) => { readonly text: string; readonly hexId: string | null };
  /** The seat the game waits for: the owner of a pending decision, else the seat that acts in this step. */
  readonly requiredSeat: () => SeatId | null;
  readonly viewSeat: () => SeatId;
}

const STUCK_TEXT: Readonly<Record<string, string>> = {
  BOT_STALLED: 'The computer found no legal action to take.',
  FAILED_ACTION: 'The game refused the actions the computer chose.',
  BOT_BUDGET_EXCEEDED: 'The computer kept acting in one step without finishing it.',
  FATAL: 'The game stopped working while the computer played.',
  NO_BOT_FOR_ACTOR: 'No computer seat could act.',
  UNKNOWN_POLICY: 'This game names a computer strategy this version does not have.',
  COMPUTER_UNAVAILABLE: 'This screen has no computer player to play the seat.',
  EXCEPTION: 'The computer failed with an error.',
};

const detailOf = (error: ComputerError): string => [
  error.actionKind === null ? null : `action ${error.actionKind}`,
  `revision ${error.revision}`,
  error.violations.length > 0 ? error.violations.join(', ') : null,
].filter((part) => part !== null).join(' · ');

/**
 * Plays the game's computer seats for the UI: one action per tick at the chosen speed, paused on request, stopped
 * (never skipped past) when a computer cannot go on. It drives the same session a person's clicks reach.
 */
export class SeatAutomation {
  readonly #host: SeatAutomationHost;
  #runner: ComputerRunner | null = null;
  #bindings: readonly SeatBinding[] = [];
  #playing = true;
  #manualSteps = 0;
  #speed: PlaybackSpeed = 'FAST';
  #follow = true;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #working = false;
  #disposed = false;
  #played = 0;
  #last: ComputerAction | null = null;
  #stuck: ComputerStuck | null = null;
  #generation = 0;

  constructor(host: SeatAutomationHost) {
    this.#host = host;
    this.rebuild();
  }

  /** A computer action is being decided or dispatched: the controller waits for the result before redrawing. */
  get working(): boolean { return this.#working; }
  /** Some seat is played by a computer. */
  get present(): boolean { return this.#bindings.some(isBotSeat); }
  /** Plays INSTANT: redraws are spaced out so the page stays responsive. */
  get coalescing(): boolean { return this.present && this.#playing && this.#speed === 'INSTANT'; }

  /** Read the seats again (a save was loaded or a seat changed hands) and start from a clean slate. */
  rebuild(): void {
    this.#generation += 1;
    this.#cancelTimer();
    this.#bindings = this.#host.session().getBindings();
    this.#stuck = null;
    this.#runner = null;
    if (!this.present) return;
    if (this.#host.computers === undefined) {
      const seat = this.#bindings.find(isBotSeat)!;
      this.#stuck = { seatId: seat.seatId, seatLabel: seat.label, code: 'COMPUTER_UNAVAILABLE', message: STUCK_TEXT.COMPUTER_UNAVAILABLE!, detail: '' };
      return;
    }
    const { runner, unknown } = this.#host.computers.create({
      session: this.#host.session(), scenario: this.#host.scenario, turnLimit: this.#host.turnLimit,
      nonce: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    });
    this.#runner = runner;
    const missing = unknown[0];
    if (missing !== undefined) {
      this.#stuck = {
        seatId: missing.seatId, seatLabel: this.#labelOf(missing.seatId), code: 'UNKNOWN_POLICY', message: STUCK_TEXT.UNKNOWN_POLICY!,
        detail: `policy ${missing.policyId}`,
      };
    }
  }

  /** The game moved on (an action, a restore, a new turn): run the computer if it is its turn. */
  kick(): void {
    if (this.#disposed || this.#timer !== null || this.#working) return;
    if (this.#runner === null || this.#stuck !== null) return;
    if (this.#host.session().getMetadata().lifecycle !== 'ACTIVE') return;
    // Only a computer seat that the game waits for has anything to do; a person's turn costs nothing here.
    const required = this.#host.requiredSeat();
    if (required === null || !this.#bindings.some((binding) => binding.seatId === required && isBotSeat(binding))) return;
    if (!this.#playing && this.#manualSteps === 0) return;
    this.#timer = setTimeout(() => { this.#timer = null; void this.#tick(); }, this.#manualSteps > 0 ? 0 : PLAYBACK_DELAYS_MS[this.#speed]);
  }

  play(): void { this.#playing = true; this.#host.changed(); this.kick(); }
  pause(): void { this.#playing = false; this.#manualSteps = 0; this.#cancelTimer(); this.#host.changed(); }
  /** Play exactly one computer action while paused. */
  step(): void { this.#manualSteps = 1; this.kick(); }
  setSpeed(speed: PlaybackSpeed): void { this.#speed = speed; this.#cancelTimer(); this.#host.changed(); this.kick(); }
  setFollow(follow: boolean): void { this.#follow = follow; this.#host.changed(); }

  /** Try again after a stall (the game may have changed since) without handing the seat over. */
  retry(): void {
    this.rebuild();
    this.#host.changed();
    this.kick();
  }

  /** A save was loaded: its seats are read again and the computers go on from the loaded position, even if play was paused before. */
  loaded(): void {
    this.rebuild();
    this.#last = null;
    this.#played = 0;
    this.#playing = true;
    this.#manualSteps = 0;
  }

  /** The game was restored to an earlier position: what the computer last did and remembered no longer applies. */
  restored(): void {
    // The runner finds the earlier position itself and gives the computer back what it remembered there.
    this.#last = null;
    if (this.#stuck?.code !== 'UNKNOWN_POLICY' && this.#stuck?.code !== 'COMPUTER_UNAVAILABLE') this.#stuck = null;
  }

  dispose(): void { this.#disposed = true; this.#cancelTimer(); }

  info(): AutomationInfo | null {
    if (!this.present) return null;
    const required = this.#host.requiredSeat();
    const toAct = required !== null && this.#bindings.some((binding) => binding.seatId === required && isBotSeat(binding))
      && this.#host.session().getMetadata().lifecycle === 'ACTIVE' ? required : null;
    return {
      seats: this.#bindings.map((binding) => ({ seatId: binding.seatId, label: binding.label, computer: isBotSeat(binding) })),
      spectating: this.#bindings.every(isBotSeat),
      playing: this.#playing,
      speed: this.#speed,
      followActions: this.#follow,
      computerToAct: toAct === null ? null : { seatId: toAct, label: this.#labelOf(toAct) },
      played: this.#played,
      last: this.#last,
      stuck: this.#stuck,
      viewSeatId: this.#host.viewSeat(),
    };
  }

  #labelOf(seatId: SeatId): string { return this.#bindings.find((binding) => binding.seatId === seatId)?.label ?? String(seatId); }

  #cancelTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  async #tick(): Promise<void> {
    if (this.#disposed || this.#runner === null || this.#stuck !== null) return;
    // A person is in the middle of an operation: look again shortly, never dispatch over it.
    if (this.#host.personBusy()) { this.#timer = setTimeout(() => { this.#timer = null; this.kick(); }, 40); return; }
    const generation = this.#generation;
    this.#working = true;
    try {
      const result = await this.#runner.step();
      // The seats changed or the game was restored while the step ran: this result belongs to the old arrangement.
      if (generation !== this.#generation || this.#disposed) return;
      if (this.#manualSteps > 0) this.#manualSteps -= 1;
      if (result.kind === 'ACTED') {
        this.#played += 1;
        const session = this.#host.session();
        const records = session.getHistory({ offset: Math.max(0, session.getHistory({ offset: 0, limit: 0, actionKind: null }).total - 1), limit: 1, actionKind: null }).records;
        const record = records[0];
        const described = record === undefined ? null : this.#host.describe(record);
        const spectating = this.#bindings.every(isBotSeat);
        this.#last = {
          seatId: result.trace.seatId, seatLabel: this.#labelOf(result.trace.seatId), text: described?.text ?? 'The computer acted.',
          intent: spectating ? result.trace.intent : null, hexId: described?.hexId ?? null, revision: Number(session.getRevision()),
        };
      } else if (result.kind === 'STUCK') {
        this.#stuck = {
          seatId: result.error.seatId ?? this.#bindings.find(isBotSeat)!.seatId, seatLabel: result.error.seatId === null ? 'Computer' : this.#labelOf(result.error.seatId),
          code: result.error.code, message: STUCK_TEXT[result.error.code] ?? result.error.message, detail: detailOf(result.error),
        };
      }
    } catch (error) {
      if (generation !== this.#generation) return;
      const seat = this.#bindings.find(isBotSeat)!;
      this.#stuck = {
        seatId: seat.seatId, seatLabel: seat.label, code: 'EXCEPTION', message: STUCK_TEXT.EXCEPTION!,
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.#working = false;
    }
    this.#host.changed();
    this.kick();
  }
}
