# heuristic@75 promotion run

Status: PASS. heuristic@75 replaces heuristic@66 as the standard computer strategy.

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This evidence does not
change any UI row of `docs/quality/03-product-operation-verification-plan.md`.

## Inputs

- Source base: `716bac9d14a140df44f544e9e90c9b8d229ea2e4` plus `v75.patch` (src and tests only).
- Opponent: heuristic@66, the build of the unmodified base, frozen before any game. Both policies play through the
  candidate's engine and generator.
- Freeze: `v75-freeze.json` holds the source tree, candidate build and baseline build hashes, the source diff, the seed
  ranges, the settings and the pass conditions, all written before the batch started. Quality logs (typecheck 0,
  746 tests passed / 8 skipped, build 0, smoke 0) are bound by SHA-256 in the same file.
- Settings: 32×24, six divisions (two armored) per side, eight turns, `--air NONE --air-transport NONE`;
  TEMPERATE_INLAND and EASTERN_EUROPE; MEETING and AXIS_ATTACKS; ten same-seed swapped-seat pairs per group, 80 games.
- Fresh match indexes: meeting temperate 6700000–6700019, meeting eastern 6700100–6700119, attack temperate
  6700200–6700219, attack eastern 6700300–6700319.
- Commands: `scripts/freeze.py v75-independent` then `scripts/indep.py v75-independent` (run once, from the candidate
  worktree); `indep.py` plays each group with `--trace`, then runs `scripts/ai-supply-study.mjs` and
  `audit-advances.mjs` on it.

## Expected

Pass conditions registered in `v75-freeze.json`: MEETING and AXIS_ATTACKS VP deltas both positive; 40-pair mean VP gain
minus 2.1 × SE above 0; every game FINISHED with a matching replay hash, no rejected action and no error; supply audit
and advance audit violations 0; typecheck, build, tests and smoke pass.

## Observed (`v75-result.json`)

| Group | VP v75–v66 | Δ | Step losses v75 / v66 |
|---|---|---|---|
| Meeting temperate | 456–336 | +120 | 218 / 332 |
| Meeting eastern | 155–121 | +34 | 291 / 320 |
| Attack temperate | 172–92 | +80 | 270 / 382 |
| Attack eastern | 136–108 | +28 | 159 / 274 |

- 40-pair mean VP gain +3.275, SE 0.804, interval [1.587, 4.963]. Meeting +154, attack +108. Every subgroup positive.
- 80/80 games complete, replay hashes equal, 0 rejected actions, 0 errors.
- Supply audit: 0 preview mismatches, 0 trace or feed breaks, every optional spending preserved the shared rations.
  Advance audit: 0 conservative-bound violations. 223 candidate Regular advances, 220 funded; the other three are
  turn-8 combat advances onto an objective after that side's last Supply Phase (no later meal exists). 20 successful
  candidate Overruns, all actually funded.
- Decision latency in the batch traces (12 parallel workers): heuristic@75 24,855 decisions, mean 68.8 ms, p95 257 ms,
  p99 551 ms, max 5.3 s; heuristic@66 23,755 decisions, mean 62.3 ms, p95 236 ms, p99 547 ms, max 4.3 s.
- Batch time: about 35 minutes including audits.

## Development

`development-runs.json` lists every development batch against the same frozen opponent, including rejected variants.
Development seeds were reused to choose changes; they are not promotion evidence and are not pooled with this batch.
The first two development batches (hidden-strength estimate only) ran with the generator's default air forces; the
registered procedure says no air, so every later batch passes `--air NONE --air-transport NONE`. The v66 promotion batch
itself ran with the default air forces.

## Raw data

Saves, traces, audit outputs and builds stay in ignored `artifacts/bot-vp-v67/` (`v75-independent/` is the frozen
candidate and its batch, `baseline-v66/dist` the opponent). `scripts/` keeps the runners and the diagnostic tools used
(`hidden-accuracy.mjs` measured the hidden-strength estimators; `empty-held.mjs`, `missed-capture.mjs`,
`hex-history.mjs`, `position.mjs` and `fixture-mix.mjs` found the planner faults).
