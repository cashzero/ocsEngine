# Position metrics: final-result recheck (plan P6)

Boundary: retrospective analysis of recorded headless bot-against-bot games. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md).

## Question

With correct trajectory identity and map-seed grouping, do position metrics predict the final VP margin beyond the
current VP, step and out-of-trace differences? The earlier final-result claims were reopened because of a wrong
duplicate rule ([identity evidence](../ai-position-validation-2026-10-18/README.md)).

## Design

Written in the plan before the run. For each trajectory and Game Turn 2–7, the row of the Game Turn's first player turn
(after the first-player roll) predicts the final Axis minus Allied VP margin; Axis attacks and meetings apart. M0: VP
margin. M1: M0 plus step and out-of-trace differences. M2: M1 plus each side's `objectiveReachColumn` and
`objectiveVpAtRisk`. M3: M1 plus each side's `stacksExposedAllocated`. M4: M1 plus each side's `hqsInReach`. Least
squares on training-standardized features, ten map-seed folds, out-of-sample R² and MAE; gains get 95% intervals from
1,000 map-seed cluster resamples of the fixed out-of-fold errors; an interval above 0 passes. Six Game Turns are
compared at once, so a single passing turn is weak evidence.

## Inputs and command

The [P5 record](../ai-position-metrics-p5-2026-10-19/manifest.json) (255 trajectories: 186 Axis attacks on 68 map seeds,
69 meetings on 28). Script `scripts/ai-position-final.py` of the commit that adds this record; its self-test checks
that a planted step signal gains over VP out of sample.

```sh
python3 scripts/ai-position-final.py --self-test
python3 scripts/ai-position-final.py --manifest artifacts/ai-positions-p5/manifest.json --artifact-root . --out artifacts/ai-positions-p5/final/results.json
```

6 s. Every score and interval: [results.json](results.json) (with the SHA-256 of the full output and the script).

## Observed

Axis attacks, out-of-sample R² by Game Turn:

| Model | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| M0 VP | −0.074 | −0.053 | 0.056 | 0.293 | 0.616 | 0.787 |
| M1 + steps, out of trace | 0.077 | 0.237 | 0.313 | 0.454 | 0.663 | 0.798 |
| M2 + objective reach and risk | 0.186 | 0.350 | 0.414 | 0.573 | 0.742 | 0.811 |
| M3 + allocated exposure | 0.137 | 0.230 | 0.283 | 0.437 | 0.665 | 0.800 |
| M4 + HQs in reach | 0.045 | 0.289 | 0.312 | 0.454 | 0.657 | 0.791 |

Gains, Axis attacks [95%]:

| Gain | Measure | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| M1 over M0 | R² | +0.151 [0.014, 0.299] | +0.289 [0.166, 0.405] | +0.257 [0.118, 0.401] | +0.161 [0.040, 0.303] | +0.048 [0.002, 0.101] | +0.012 [−0.009, 0.034] |
| M1 over M0 | MAE (VP) | 0.98 [0.18, 1.87] | 1.61 [0.75, 2.44] | 1.28 [0.54, 2.06] | 0.69 [0.09, 1.30] | 0.31 [−0.00, 0.66] | 0.15 [−0.07, 0.36] |
| M2 over M1 | R² | +0.109 [−0.044, 0.276] | +0.114 [−0.060, 0.267] | +0.101 [−0.093, 0.253] | +0.119 [0.011, 0.236] | +0.078 [0.030, 0.139] | +0.013 [−0.012, 0.038] |
| M2 over M1 | MAE (VP) | 0.57 [−0.10, 1.24] | 0.82 [0.03, 1.58] | 0.95 [0.27, 1.71] | 0.93 [0.39, 1.48] | 0.93 [0.54, 1.39] | 0.35 [0.12, 0.58] |
| M3 over M1 | R² | +0.060 [−0.053, 0.160] | −0.007 [−0.036, 0.021] | −0.030 [−0.063, −0.004] | −0.017 [−0.028, −0.007] | +0.002 [−0.022, 0.023] | +0.002 [−0.010, 0.014] |
| M4 over M1 | R² | −0.031 [−0.155, 0.063] | +0.053 [−0.014, 0.117] | −0.001 [−0.065, 0.053] | +0.000 [−0.028, 0.028] | −0.006 [−0.021, 0.006] | −0.007 [−0.014, −0.002] |

Meetings (69 trajectories, 28 seeds): no gain passes on R²; M1 over M0 ranges −0.010 to +0.043, M2 over M1 −0.109 to
+0.074 (at Game Turn 4 −0.085 [−0.224, −0.010]); M3 and M4 are negative at several turns.

## Conclusions

- In Axis attacks the step and out-of-trace differences predict the final margin beyond VP through Game Turn 5 (R²) and
  6 (MAE at the edge); the earlier claim holds with correct identity and seed grouping.
- Objective reach and risk add beyond them: MAE gains of about 0.8–0.95 VP at Game Turns 3–6 and 0.35 at 7, all
  intervals above 0; R² gains pass at Game Turns 5 and 6. This is the first position metric with a final-result gain.
- Allocated exposure and HQs in reach add nothing to the final result.
- Meetings show no gain from any addition; with 69 trajectories small gains cannot be seen.

## Limits

Exploratory: the same games chose and shaped these metrics. Linear models; v79-family policies. Confirmation is plan P7.
