# Position metrics: corrected record and grouped validation (plan P1, P2)

Boundary: offline replays of saved headless bot-against-bot games and retrospective validation on them. No policy change;
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md).
Conclusions: [policy-errors](../../../ai/policy-errors.md#指標是否可用).

## Question

The user (2026-10-19): carry out the position-metric plan. P1 extends the validator; P2 validates every recorded metric
not validated yet, per role, against the pass rule written in the plan before the results.

## Recorder defect found and fixed

While checking where attrition losses fall, a Game Turn 8 row named the Allied player as phasing while the Axis player
moved, supplied and lost steps to attrition in it. `scripts/ai-position-record.mjs` opened a Game Turn's first row at the
first action of the turn, before the weather and first-player roll, when `phasingPlayerId` is still the previous turn's.
In the exposure record (`artifacts/ai-positions-exposure`, 368 aliases), 682 of 2,944 Game Turns had both rows naming the
same phasing player. Every near-term check that pairs the non-moving player's metrics with its losses mismatched those
rows, including [ai-position-validation-2026-10-18](../ai-position-validation-2026-10-18/README.md); its numbers are void.

Fix (commit `1cc8526`): a row opens at the first action outside the WEATHER and FIRST_PLAYER phases; events are credited
to the player turn the sequence is in when they happen (`SEQUENCE_ADVANCED` inside an action moves later events on);
attrition is classified per event as in `scripts/ai-outcome-metrics-observer.mjs`. On `v84-development/attack-eastern`
(8 games) the per-game, per-player totals of steps, dump SP and objectives are unchanged, all metrics shared with the old
record are identical, no Game Turn names the same phasing player twice, and all 98 attrition steps fall in their
owner's turn (the Supply Phase follows the owner's Movement Phase). The earlier description that a non-moving player's
start-of-turn attrition was credited to the mover's turn does not match this sequence; the mismatched rows explain it.

## Inputs and commands

All 24 game folders of [ai-position-record-2026-10-18](../ai-position-record-2026-10-18/manifest.json), re-recorded with
the corrected recorder on dist built from src as of `eee03e2` (src unchanged through `1cc8526`). 368 aliases, 5,888
rows, 0 skipped, 25 min 48 s on 12 processes. Files, rows and SHA-256: [manifest.json](manifest.json).

```sh
node scripts/ai-position-record.mjs <match directory> --out artifacts/ai-positions-p2/<name>.jsonl   # 12 processes
python3 scripts/ai-position-validate.py --self-test
python3 scripts/ai-position-validate.py --manifest artifacts/ai-positions-p2/manifest.json --artifact-root . --out artifacts/ai-positions-p2/validation/results.json
```

The self-test passed (held-out signal, null sensitivity, duplicate conflicts, alias exclusion, fold coverage, no future
leakage, row-only features, next-turn outcome, quintile bins). Validation: 255 trajectories, 96 map seeds, 3,315
windows, 47 s. The full output (19 MB) stays in artifacts; its SHA-256 is in the manifest, and
[validation-summary.json](validation-summary.json) keeps every subset, test, model score, interval and pass verdict.

## Method (P1)

`scripts/ai-position-validate.py` gained mover-side features (prefix `mover.`, the phasing player's metrics at the same
row), outcomes for the mover's objectives and objective VP gained, the non-moving player's combat and attrition steps,
and its attrition in its following player turn (missing when the mover moves twice in a row), and training-quintile bin
models for metrics that are not small counts. Twenty tests: the seven of the first validation plus thirteen for the
second-batch metrics, `dumpSpInReach`, `unitsWithReach`, the payable variants over the plain ones, and the expected
loss over the allocated exposure.

Pass rule, written in the plan before the results: in a role subset, the metric's bucket model beats zero, training
median and the baseline's bucket model on MAE with every 95% interval above 0, or baseline plus metric beats the
baseline on out-of-sample R² with the interval above 0. Intervals are 1,000 map-seed cluster resamples of fixed
out-of-fold errors.

## Observed

Out-of-sample R² gain of baseline plus metric over the baseline [95%], by role; MAE passes noted.

| Outcome ~ metric (baseline) | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| Objective VP lost ~ `objectiveVpAtRisk` (objectives threatened) | +0.213 [0.132, 0.283] | +0.067 [0.028, 0.106] | +0.103 [0.056, 0.142] |
| Objectives lost ~ `objectivesAtRisk` (objectives threatened) | +0.164 [0.108, 0.211], MAE | +0.068 [0.016, 0.104] | +0.116 [0.074, 0.151] |
| Objective VP lost ~ `payableObjectiveVpAtRisk` (`objectiveVpAtRisk`) | +0.089 [0.028, 0.145], MAE | +0.013 [−0.009, 0.033] | +0.012 [−0.019, 0.034] |
| Mover objectives gained ~ `mover.bestObjectiveEffectiveColumn` (contact) | +0.325 [0.256, 0.384], MAE | +0.138 [0.051, 0.194] | +0.205 [0.101, 0.267], MAE |
| Mover objectives gained ~ `mover.localForceRatioAt2Hex` (contact) | +0.098 [0.043, 0.150], MAE | +0.089 [0.004, 0.223] | +0.028 [−0.216, 0.165] |
| Combat steps lost ~ `stacksExposedAllocated` (contact) | +0.146 [0.098, 0.192], MAE | +0.033 [0.011, 0.054] | +0.080 [0.030, 0.127], MAE |
| Combat steps lost ~ `stacksExposedAllocated` (`stacksExposed`) | +0.013 [−0.008, 0.033] | −0.002 [−0.008, 0.004] | +0.028 [−0.002, 0.055], MAE |
| Combat steps lost ~ `maxSingleStackExpectedLoss` (`stacksExposedAllocated`) | −0.001 [−0.006, 0.004] | +0.001 [−0.003, 0.005] | −0.019 [−0.032, −0.004] |
| Trace-loss rise ~ `supplyCuttable` (contact) | +0.092 [0.025, 0.148], MAE | +0.041 [−0.004, 0.074] | +0.093 [0.043, 0.135] |
| Attrition next own turn ~ `supplyCuttable` (`outOfTrace`) | +0.000 [−0.004, 0.004] | +0.002 [−0.008, 0.010] | −0.003 [−0.007, −0.000] |
| HQs lost ~ `hqsInReach` (contact) | +0.198 [0.126, 0.260] | +0.015 [0.002, 0.026] | +0.034 [0.011, 0.054] |
| Dump SP lost ~ `dumpSpInReach` (contact) | +0.012 [−0.037, 0.035] | +0.011 [−0.003, 0.026] | +0.005 [−0.008, 0.012] |
| Combat steps lost ~ `mover.surplusCombatSp` (mover contact) | −0.004 [−0.008, −0.001] | +0.012 [−0.007, 0.027] | +0.000 [−0.011, 0.012] |
| Combat steps lost ~ `mover.unitsWithReach` (mover contact) | −0.025 [−0.114, 0.021], quintile MAE | +0.006 [−0.009, 0.017] | −0.007 [−0.015, 0.000] |

MAE examples, attacker moving: objectives taken by the mover, `bestObjectiveEffectiveColumn` buckets 0.253 against zero
0.365; combat steps lost, `stacksExposedAllocated` buckets 1.353 against zero 1.967; objective VP lost, payable buckets
0.884 against zero 0.960. `mover.unitsWithReach` gains R² +0.133 when roles are pooled; the gain disappears within roles.
`outOfTrace` alone explains 0.14–0.28 of the next own turn's attrition.

## Conclusions

- Usable: objective risk and reach (all roles), payable objective risk (attacker moving, over the plain version), the
  mover's best effective column on unheld objectives (strongest; all roles), allocated exposure (attacker moving and
  meetings), supply cuttable for trace losses (attacker moving and meetings), HQs in reach as a risk condition.
- Weak: the mover's local force ratio; not yet compared over the effective column.
- Not adopted: the expected-loss maximum (nothing over allocated exposure), dump SP in reach, surplus combat SP, units
  able to move.
- Supply cuttable predicts trace losses, not the following attrition; current units out of trace already carry that.

## Limits

All data were already used to choose and inspect metrics, so these are exploratory results; confirmation is plan P7 on
new registered games. Games are v79-family policies. Batch-held-out results are in the full output only.
