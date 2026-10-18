# Position metrics: new candidates, record and validation (plan P4, P5)

Boundary: offline replays of saved headless bot-against-bot games and retrospective validation on them. No policy change;
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md).
Conclusions: [policy-errors](../../../ai/policy-errors.md#指標是否可用).

## Question

Do the five candidates the [residual review](../ai-position-metrics-p3-2026-10-19/README.md) led to predict their
near-term outcomes, and better than the metric each was meant to improve? Definitions, outcomes, baselines and the pass
rule were written in the plan (P4) before the record.

## Candidates

All in `scripts/ai-position-metrics.mjs`; `outOfTraceUnfed` in `positionMetrics`, the rest in `nextTurnMetrics`.

| Candidate | Definition | Outcome (baselines) |
|---|---|---|
| `expectedLossAllocated` | Opponent units allocated one stack each, highest expected step loss first, trimmed while the expected loss stays; expected loss over 2d6 on the Combat Table, option counted as loss on a held objective; summed | O combat steps lost (`contact`; `stacksExposedAllocated`) |
| `objectiveReachColumn` | Highest column the player reaches next turn on an objective it does not hold, with every unit able to reach beside it (12 to walk in, −1 none) | Mover objectives gained (`contact`; `bestObjectiveEffectiveColumn`) |
| `hqDependentUnitsInReach` | Non-HQ combat units in trace whose every route is an HQ throw from an HQ the opponent can reach beside | O trace-loss rise (`contact`); O next-turn attrition (`outOfTrace`) |
| `outOfTraceUnfed` | Combat units out of trace in no hex any friendly dump with tokens can feed | O next-turn attrition (`outOfTrace`) |
| `rearHexesInReach` | Hexes the opponent reaches next turn, 2+ hexes from the player's combat units, inside its trace coverage | O trace-loss rise; O HQs lost (`contact`) |

`maxSingleStackExpectedLoss` now shares the expected-loss function with `expectedLossAllocated`. On
`v84-development/attack-eastern` every metric and outcome already recorded was identical before and after; distributions
there from Game Turn 2: `expectedLossAllocated` median 5.25 (max 11.5), `objectiveReachColumn` median 6, `hqDependentUnitsInReach`
median 2 (0 in 42% of rows), `rearHexesInReach` median 135, `outOfTraceUnfed` median 0 (0 in 58%).

## Inputs and commands

The 24 game folders, re-recorded on dist built from src as of `eee03e2`: 368 aliases, 5,888 rows, 0 skipped, 25 min 40 s
on 12 processes. Files and SHA-256: [manifest.json](manifest.json).

```sh
node scripts/ai-position-record.mjs <match directory> --out artifacts/ai-positions-p5/<name>.jsonl   # 12 processes
python3 scripts/ai-position-validate.py --self-test
python3 scripts/ai-position-validate.py --manifest artifacts/ai-positions-p5/manifest.json --artifact-root . --out artifacts/ai-positions-p5/validation/results.json
```

255 trajectories, 96 map seeds, 3,315 windows. The 20 tests of [P2](../ai-position-metrics-p2-2026-10-19/README.md) gave
identical results. Every test, model score, interval and verdict: [validation-summary.json](validation-summary.json).

## Observed

Out-of-sample R² gain of baseline plus candidate over the baseline [95%]; MAE passes noted.

| Outcome ~ candidate (baseline) | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| Combat steps lost ~ `expectedLossAllocated` (contact) | +0.134 [0.097, 0.170], MAE | +0.035 [0.012, 0.059] | +0.080 [0.027, 0.125], MAE |
| Combat steps lost ~ `expectedLossAllocated` (`stacksExposedAllocated`) | +0.005 [−0.009, 0.019] | +0.001 [−0.009, 0.013] | +0.000 [−0.013, 0.013], fixed-bucket MAE |
| Mover objectives gained ~ `objectiveReachColumn` (contact) | +0.211 [0.172, 0.247], quintile MAE | +0.108 [0.033, 0.148] | +0.173 [0.117, 0.215] |
| Mover objectives gained ~ `objectiveReachColumn` (`bestObjectiveEffectiveColumn`) | +0.030 [0.010, 0.053] | +0.002 [−0.016, 0.015] | +0.036 [0.012, 0.063] |
| Trace-loss rise ~ `hqDependentUnitsInReach` (contact) | +0.020 [−0.029, 0.054], quintile MAE | +0.054 [0.002, 0.098] | +0.040 [−0.013, 0.082] |
| Next-turn attrition ~ `hqDependentUnitsInReach` (`outOfTrace`) | +0.002 [−0.008, 0.011] | +0.002 [−0.007, 0.011] | −0.004 [−0.008, −0.000] |
| Next-turn attrition ~ `outOfTraceUnfed` (`outOfTrace`) | +0.031 [−0.020, 0.082] | +0.010 [−0.042, 0.052] | +0.020 [−0.017, 0.057] |
| Trace-loss rise ~ `rearHexesInReach` (contact) | +0.061 [0.017, 0.098] | +0.009 [−0.012, 0.023] | +0.010 [−0.011, 0.027] |
| HQs lost ~ `rearHexesInReach` (contact) | +0.073 [0.042, 0.108] | +0.007 [−0.012, 0.021] | +0.001 [−0.009, 0.010] |

`outOfTraceUnfed` passes when roles are pooled (R² +0.050 [0.016, 0.087]; fixed-bucket MAE 0.866 against 0.906 for the
`outOfTrace` buckets) but within no role: its bucket MAE does not beat the `outOfTrace` buckets (attacker moving 1.334
against 1.330), so the pooled gain comes from the roles' different out-of-trace levels.

## Conclusions

- `objectiveReachColumn` improves on `bestObjectiveEffectiveColumn` when the attacker moves and in meetings, as the
  residual review suggested (captures by units from 3+ hexes away); adopted.
- `expectedLossAllocated` predicts combat losses as well as the allocated exposure count, not better; not adopted in its
  place.
- `rearHexesInReach` passes for trace losses and HQ losses when the attacker moves, against the distance baseline only;
  not yet compared with `supplyCuttable` and `hqsInReach`.
- `hqDependentUnitsInReach` predicts trace losses only when the defender moves, and not the attrition that follows; weak.
- `outOfTraceUnfed` adds nothing within roles over the current out-of-trace count; not adopted.

## Limits

Exploratory: the residual review that produced these candidates read the same games. Confirmation is plan P7 on new
registered games. Games are v79-family policies.
