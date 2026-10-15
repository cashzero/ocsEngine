# Computer players in the UI

## Scope

How a seat played by a computer shows up on screen: choosing it in New Game, a person against the computer, two
computers against each other, the playback controls, save/load, Undo, a computer that cannot go on, and handing a seat
from one to the other. The computer's strategy and its driving loop are in [docs/ai/](../ai/architecture.md); the New Game
form is in [docs/game-flow/new-game-ui.md](../game-flow/new-game-ui.md).

## Current behavior

### Who plays a seat

- Each seat is a person or a computer: `SeatBinding.controller` (`src/gameplay/model.ts`). Absent means a person. A computer
  seat names its policy and a uint32 seed and is saved with the game, so a loaded game has the same computer players.
- New Game's **Players** box sets each side to **Player** or **Computer**. Two persons is the old hot-seat game. The preview
  bar names the players ("Allied: you · Axis: computer"). A computer's seed is its own field in *Reproducible seeds* and is
  redrawn by Randomize all seeds; it is separate from the map, OOB, deployment and rules seeds, so changing who plays never
  changes the generated game.
- The menu's **Players** section can hand any seat to the computer ("Let the computer play it") or take it back ("Play it
  myself") at any time.

### A person against the computer

- The screen is the person's seat for the whole game; there is never a hand-over screen to or from a computer seat. When the
  game waits for the computer (its Player Turn, or a decision it owns such as the defender's) it acts by itself.
- Every action the computer makes lands in the person's log in the person's words (hidden enemy units are not named), and
  a combat it fights shows the same result card as any other. The End button explains itself while the computer has the
  move ("Axis computer is playing.").
- The person's own actions work as before. Only one operation runs at a time: a click that arrives while a computer action is
  being dispatched (a few milliseconds) is ignored.

### Two computers

- Nobody operates. The panel's **View** menu shows the game from either side; each side's own log words its actions by seat
  name rather than "You". The computer's intent for each action (why it did it) is shown only in this mode, since an intent
  can mention what only that computer knows.

### The computer panel

A panel at the bottom left of the map (stuck state: centred) shows the status ("Axis computer is playing…", "Paused: Axis
computer acts next", "Your turn", "Game over") and the last action, and offers:

| Control | Behavior |
|---|---|
| Pause / Play | Pause stops before the next action; an action already under way finishes (up to about 0.65 s at the default size). Play resumes. |
| Step | While paused, plays exactly one computer action. |
| Speed | Slow 1.2 s, Normal 0.5 s, Fast 0.12 s (default), Instant: no pause, with redraws at most four times a second so the page stays responsive. |
| Follow | Each action brings the hex it touched into view (a move's destination, an attack's target) when the viewer may know it. |
| View | Two computers only: which side's view the screen shows. |

Loading a save starts the computers playing again, even if play was paused; so does Play.

### Save, load and Undo

- A save holds the computer seats. Loading it (menu → Load save…) reads who plays each seat from the file, and the computers
  go on from the loaded position. A save loads into a game of the same scenario only (TODO `load-same-scenario`): to continue
  in a new page, open the same operation again from its seeds first.
- Restoring a checkpoint puts the game back; the computer then plays what it played the first time. The runner keeps what the
  computer remembered of its step for each position it decided at, and gives it back on a restore. A position it has no
  memory for (a game loaded in the middle of the computer's step) is planned afresh (TODO `computer-mid-step-load`).
- The top bar's Undo only ever takes back the person's own actions.

### A computer that cannot go on

The computer stops, nothing is skipped or passed on its behalf, and a banner names the seat, what went wrong ("The computer
found no legal action to take", "The game refused the actions the computer chose", "kept acting in one step without finishing
it", "a strategy this version does not have") and the revision. Two buttons: **Play <side> myself** hands the seat to the
person, who then does whatever the computer left pending; **Try again** asks the computer again (not offered for an unknown
strategy). The test strategy `test-stall:<revision>` (set by editing a save's seat controller) makes a computer stall on
purpose.

## Decisions

- **The UI does not import the bot.** The package root passes `COMPUTER_PLAYERS` to the controller, which keeps the engine
  layers one-way (`tests/integration/foundation-gate.test.ts`). Without it a computer seat stops as stuck.
- **A person's screen is never handed to a computer.** Rejected: showing a hand-over for the computer's seat; the person
  would click through a screen with nothing to hide.
- **Stuck stops, it does not pass.** Rejected: ending the step for a computer that finds no action, which hides the error
  and can lose the game silently.
- **One speed for decisions and actions.** The defender's answers are paced like any other computer action; at Instant they
  are immediate.

## Known gaps

`computer-main-thread`, `computer-mid-step-load`, `load-same-scenario`, `bot-difficulty` (`docs/quality/05-todo-inventory.md`).

## Verification

Rows BOT-01 to BOT-09 in `docs/quality/03-product-operation-verification-plan.md`; `scripts/product-acceptance/run-computer.mjs`
and `run-computer-scale.mjs`; `tests/ui/computer-players.test.ts`, `tests/ai/seat-runner.test.ts`.
