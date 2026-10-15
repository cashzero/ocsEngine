# Turn limit measurement

Grounds `defaultTurnLimit` (`docs/game-flow/turn-limit.md`). Headless bot games; no browser run, so it changes no acceptance row's status.

## Run

- Commit: base `02fb0e1` plus the uncommitted supply-counter capacity fix (`src/rules/supply/transport.ts`) that this run found necessary; the commit that adds this folder contains both.
- Both seats: the standard heuristic bot (`heuristic`), `--turns 40`, `--no-replay`, armored divisions = divisions / 3, default seeds from the match index (`scripts/ai-match.mjs`).
- Matrix: map 24×16, 32×24, 48×36 × 3, 6, 10 divisions per side; `AXIS_ATTACKS` 10 matches per cell (indexes 0–9), `MEETING` 6 matches per cell (indexes 4–9). 144 matches.
- Analysis: `scripts/turn-limit-study.mjs` replays each save and records, per Game Turn, each side's VP, attacks and objective handovers; `scripts/turn-limit-regression.mjs` regresses on `(width + height) / 7` and `1.5 × divisions`.
- Per-match rows: `results.json` (engagement, size, divisions, match, end turn, VP movement, 75% VP-movement turn, handover count, 75% handover turn, last handover turn).

## Observed

- 144 of 144 matches reached `FINISHED` with no `FAILED_ACTION`. None ended before turn 40 (no attack victory condition fired).
- An earlier pass with the same matrix on the unfixed engine (36 matches, `MEETING` only) stopped 19 matches between turns 14 and 39 with `STATE_INVARIANT_VIOLATION: RESOURCE_STATE_EXCEEDS_CAPACITY` (a dump of 404 against a counter capacity of 400) on `RAIL_MOVE`, `PLACE_REINFORCEMENT` and `UNLOAD_SUPPLY`. The fix is in `mergeSupplyAt` and `applyUnload`; a regression test in `tests/rules/ocs-logistics.test.ts` fails without it. Those 36 matches are not used below.
- Median "75% of VP movement done" turn (d3 / d6 / d10 divisions):

| map | AXIS_ATTACKS | MEETING |
|---|---|---|
| 24×16 | 6.5 / 1 / 1 | 10.5 / 9.5 / 22.5 |
| 32×24 | 4 / 8 / 12.5 | 13.5 / 12.5 / 13 |
| 48×36 | 9 / 10.5 / 17.5 | 5 / 18 / 10 |

- Regression (coefficient, t) on `(w+h)/7` and `1.5·divisions`:

| metric | attack: map | attack: divisions | meeting: map | meeting: divisions |
|---|---|---|---|---|
| 75% VP-movement turn | 1.32 (3.4) | −0.19 (−0.8) | −0.30 (−0.6) | 0.36 (1.3) |
| 75% handover turn | 1.56 (3.7) | −0.04 (−0.2) | 0.80 (1.9) | 0.19 (0.7) |
| last handover turn | 2.18 (4.3) | −0.13 (−0.4) | 1.26 (2.3) | 0.27 (0.8) |
| handovers | 1.24 (8.4) | 0.01 (0.2) | 1.75 (4.5) | 0.16 (0.7) |

  R² of the timing metrics: 0.04–0.17; of the counts and total VP movement: 0.29–0.64.
- Overall quartiles (turn): attack 75% VP movement 1 / 6 / 15; meeting 5 / 11 / 19.

## Not covered

Human play, other bots, `ALLIED_ATTACKS`, air forces, sea landings, reinforcements, and the browser behavior of the Turn limit field. Cells have 6–10 games and single games vary from turn 1 to 34.
