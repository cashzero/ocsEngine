# No arrivals on Game Turn 1, and undistorted Repl counters (2026-10-04)

User request: "turn 1 不應該有reinforcement" (Game Turn 1 should have no reinforcements), and "scale-down 的 counter 有點變形"
(the scaled-down Pax/Eq counter in the Arrivals list looks distorted).

## Change

- `FIRST_ARRIVAL_TURN = 2` (`src/rules/lifecycle/lifecycle.ts`): the setup already holds Game Turn 1's forces and supply, so
  entering a Reinforcement Phase on Game Turn 1 rolls no Supply Table and creates no Pax/Eq.
- The ground unit the generator holds back off the map now carries return turn 2 (`src/game-flow/deployment.ts`); before, it
  had none and was due at once. Aircraft reinforcements already arrived on Game Turn 3 or later.
- The Repl counter's printed 0-0-10 is drawn as shapes (`src/ui/counter.ts`). As text it was forced to widths tuned for Arial
  Narrow; where Arial Narrow is not installed (this machine) the browser fell back to Arial and squeezed the digits into slivers.

## Observed

| Check | Result | Artifact |
|---|---|---|
| Built UI (`npm run build`, `scripts/serve-ui.mjs`) opens a new default game | Turn 1 / 8, Allied player turn, **Movement**; no Arrivals tab, no Reinforcement step | [01-turn-1-opens-in-movement.png](01-turn-1-opens-in-movement.png) |
| Repl counters at 112, 52 and 224 px, headless Edge, before the change | The white "0" and the superscript "0" are compressed into tall slivers | [02-repl-counter-before.png](02-repl-counter-before.png) |
| Same, after | Digits keep their proportions at every size; "10" sits inside its yellow box | [03-repl-counter-after.png](03-repl-counter-after.png) |
| `npx vitest run` | 416 passed, 0 failed (was 415; adds "brings nothing on Game Turn 1") | — |

## Not yet verified (TODO)

- Game Turn 2 arrivals in the browser: the held-back unit, the SP and the Pax/Eq should be listed in Arrivals and placeable.
  This is covered only through the UI controller (`tests/ui/command-deck.test.ts`, `tests/ui/large-map-reinforcement-latency.test.ts`),
  not by operating the browser. Acceptance: a browser run from New Game to the Game Turn 2 Reinforcement Phase of both sides,
  placing every arrival, with a screenshot of the Arrivals list including the redrawn Pax/Eq counters at list size.
