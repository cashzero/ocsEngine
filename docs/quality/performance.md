# Performance

## Scope

How fast the product responds as the map and the order of battle grow, which component limits it next, and how to
measure it. The interaction budgets themselves are acceptance criteria in
`03-product-operation-verification-plan.md` ("Interaction budgets").

## Current behavior

New Game accepts maps up to 256×256 (`NEW_GAME_MAP_LIMITS`, `src/game-flow/validation.ts`; user, 2026-10-14). The
measurements below were taken when the limit was 64×48; sizes above 64×48 were measured on a copy with the limit lifted.

Browser, Chromium, operating visible controls through New Game and a whole Turn 1 (ms, mean / max):

| Operation | 64×48, Trace Supply on | 64×48, Trace Supply off |
|---|---|---|
| New Game: Generate preview | 1,083 | 1,097 |
| New Game: Start | 1,074 | 1,102 |
| Place a reinforcement | 86 / 218 | 29 / 71 |
| Select a reinforcement | 27 / 30 | 29 / 48 |
| End step | 83 / 125 | 93 / 138 |
| Hand-over complete | 186 | 136 |
| Turn on Trace Supply | 103 | — |

At 128×96 the browser measured Generate preview about 4.1 s and Start about 4.5 s, over the 3,000 ms budget.

Engine (`scripts/perf/scaling-curve.mjs`, cold caches as after every action, ms):

| Component | 64×48 | 128×96 | 128×96, 20 divisions |
|---|---|---|---|
| New Game: map generation | 219 | 1,218 | 1,399 |
| New Game: create session | 119 | 373 | 465 |
| New Game: package validation | 8 | 30 | 43 |
| Trace Supply coverage (any unit) | 16 | 44 | 54 |
| Reinforcement candidates (all) | 0.6 | 1.3 | 1.1 |
| Slowest End step of Turn 1 | 35 | 148 | 192 |
| All of Turn 1's actions | 90 | 259 | 464 |
| Per action: state hash + save + Undo checkpoint | 13 | 56 | 64 |

Where the limits are (log-log fit, `scripts/perf/fit-scaling.mjs`):

- Every engine component stays under 1 s up to about 120×91. Trace coverage reaches 100 ms at about 253×190, the
  per-action state hash at about 214×160, and End step reaches 1 s at about 448×336.
- The next limit is the New Game screen: the preview SVG string (237 ms at 64×48, 1.5 s at 128×96, plus building
  the DOM), map generation (about 1 s at 122×91), and the theater model (0.4 s at 128×96).

## Decisions

- Optimizations must not change results. The guards are `tests/rules/trace-coverage-equivalence.test.ts` (the
  previous per-hex trace algorithm kept as a reference), `tests/rules/reinforcement-hexes-equivalence.test.ts`,
  `tests/gameplay/save-serialization.test.ts` (fast save text identical to `canonicalJson(envelope)`), and
  `scripts/perf/compare-generation.mjs` (whole New Game content hashed against a reference build).
- The trace index, supply paths and routes are cached by the parts of the state they read (pieces, map state,
  weather, scenario, configuration), not by the whole state, because one End step passes through several states
  that differ only in sequence.
- A save serializes each immutable state once; the per-action hash, autosave and Undo checkpoint share that text.
- The player's view (`getView`) is computed once per revision, lifecycle, seat and hand-over state.
- A single 218 ms first reinforcement placement at 64×48 with Trace Supply on (80 ms when re-run without a
  screenshot) is accepted without further analysis (user, 2026-10-05).

## Known gaps

- `PERF-7` (`05-todo-inventory.md`): New Game preview and Start exceed the 3,000 ms budget on large maps
  (128×96 about 4–4.5 s; 256×256 not measured).
- Nothing above 64×48 has been measured on the product build since the limit was raised; the engine-only
  predictions above reach 1 s for map generation at about 122×91.

## Verification

Raw measurements: `docs/quality/evidence/perf-2026-10-04/` (`after-gen-save-endstep/` holds the current numbers).

Reproduce: `npm run build`, then

```sh
node scripts/perf/measure-scale.mjs artifacts/perf 32x24 64x48
OCS_UI_PORT=4190 node scripts/serve-ui.mjs   # in another shell
node scripts/perf/browser-scale.mjs artifacts/browser 64x48        # PERF_TRACE=0 turns Trace Supply off
node scripts/perf/scaling-curve.mjs artifacts/scaling
node scripts/perf/fit-scaling.mjs artifacts/scaling/scaling-curve.json
```
