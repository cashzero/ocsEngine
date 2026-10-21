# Theater metrics against the position metrics, retrospective (plan P11.6)

Boundary: offline analysis of recorded rows. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## Registration

[registration.json](registration.json) was committed (`c089c6f`) before any theater row was analysed: data, models,
questions, pass rules and script hashes.

- Q1 (primary): M2T (M2 of `ai-position-final.py` plus each side's theater potential) predicts the final Axis minus
  Allied margin better than M2 at Game Turn 4; fitted on development rows, scored on retrospective rows; pass if the
  map-seed resampled 95% interval of the MAE gain is above 0. Game Turns 3 and 5, R², M2F (plus stranded steps) and
  development ten-fold are reported without a pass rule.
- Q2: on rows where the attacker moves, the mover's potential predicts the objective VP the attacker gains in its
  player turn better than `objectiveReachColumn` and `payableObjectiveVpInReach`; pass if, on the same measure (MAE or
  R²), both gains have 95% intervals above 0.
- Step rule: P11.6 passes if Q1 or Q2 passes; P11.7 confirms on new games only the questions that passed.

## Run

- Development: 132 P5 Western Europe Axis-attack saves, 99 distinct trajectories; retrospective: the 48 P7 Western
  Europe Axis-attack games, seen in earlier work. Map seeds do not overlap.
- Rows from the [P11.5 recording](../ai-theater-record-2026-10-21/README.md); manifests:
  [development-manifest.json](development-manifest.json), [retrospective-manifest.json](retrospective-manifest.json).
- `scripts/ai-theater-validate.py` (SHA-256 `9853c94e…`, unchanged since registration), 3 s:

```sh
python3 scripts/ai-theater-validate.py --development artifacts/ai-theater-record/development-manifest.json --retrospective artifacts/ai-theater-record/retrospective-manifest.json --artifact-root . --out artifacts/ai-theater-record/validation.json
```

- Results: [results.json](results.json).
- Deviation from the registration: after it, `ai-position-record.mjs` and `ai-theater-supply.mjs` changed only to count
  a Combat entry whose lifecycle rebuild fails instead of stopping (see the recording record); the metrics, models and
  analysis did not change.

## Results

Q1, final margin, MAE gain over M2 in VP [95%] (positive is better):

| Game Turn | Retrospective M2 MAE | M2T, retrospective | M2F, retrospective | M2T, development ten-fold | M2F, development ten-fold |
|---|---:|---:|---:|---:|---:|
| 3 | 8.45 | −0.99 [−1.95, −0.14] | −0.78 [−1.71, +0.15] | +0.69 [−0.19, +1.62] | +0.41 [−0.47, +1.29] |
| **4** | 6.88 | **+0.02 [−0.13, +0.18]** | −0.05 [−0.59, +0.44] | −0.42 [−1.23, +0.05] | −0.61 [−1.31, −0.07] |
| 5 | 6.00 | +0.35 [−0.15, +0.88] | +0.40 [−0.07, +0.94] | +0.16 [−0.39, +0.62] | −0.13 [−0.72, +0.38] |

Q1 fails. R² gains are within ±0.19 and do not change the reading.

Q2, objective VP the attacker gains in its player turn (retrospective n 384, development ten-fold n 792):

| Predictor | Retrospective MAE | R² | Development MAE | R² |
|---|---:|---:|---:|---:|
| Mover theater potential | **1.206** | 0.279 | 1.352 | 0.359 |
| `objectiveReachColumn` | 1.427 | 0.185 | 1.678 | 0.190 |
| `payableObjectiveVpInReach` | 1.436 | 0.200 | 1.571 | 0.295 |

Retrospective gains of the potential: MAE +0.221 [+0.121, +0.316] over the reach column and +0.230 [+0.143, +0.321] over
payable risk; R² +0.094 [−0.017, +0.197] and +0.079 [−0.010, +0.168]. Q2 passes on MAE. P11.6 passes through Q2.

Descriptive, Axis-attack rows (development / retrospective means per row):

| Attacker Game Turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Potential | 6.64 / 5.59 | 2.29 / 2.10 | 2.93 / 1.58 | 2.96 / 2.81 | 2.75 / 2.46 | 1.79 / 1.57 | 1.51 / 1.35 | 1.39 / 1.42 |
| Realized at Combat entry | 2.64 / 1.56 | 0.48 / 0.27 | 1.48 / 0.52 | 1.98 / 1.70 | 2.01 / 1.82 | 1.43 / 1.23 | 1.16 / 1.09 | 1.13 / 0.88 |
| Objective VP gained in the turn | 2.58 / 1.27 | 0.30 / 0.27 | 1.44 / 0.65 | 2.09 / 1.73 | 2.18 / 1.73 | 1.63 / 1.15 | 0.89 / 1.04 | 1.13 / 0.85 |

The defender's potential stays below 0.3 in every Game Turn.

## Conclusions

- The theater potential predicts what the attacker takes in its own turn better than the existing reach and payable
  metrics (Q2), but adds nothing to M2 for the final margin (Q1).
- The realized value at Combat entry tracks the objective VP actually gained. The attacker realizes 13–50% of the
  potential in Game Turns 1–3 and 60–80% from Game Turn 4. Whether the early gap is the policy's or the potential's
  (placement ignores stacking and friendly ZOC changes) is not settled by these data.

## Limits

Retrospective: the P7 games were seen in earlier work, though not by this metric. One policy family, Western Europe
Axis attacks only. Three Game Turns and two models make six Q1 cells; the Game Turn 3 retrospective loss is one of them.
