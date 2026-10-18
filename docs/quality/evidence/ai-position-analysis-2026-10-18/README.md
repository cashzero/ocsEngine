# Do the position metrics measure something?

Boundary: offline analysis of the rows recorded in [ai-position-record-2026-10-18](../ai-position-record-2026-10-18/README.md).
No policy change; changes no row of `docs/quality/03-product-operation-verification-plan.md`. The conclusions are in
[policy-errors](../../../ai/policy-errors.md#指標是否可用).

## Question

The user (2026-10-18): start the analysis of the recorded position metrics. Two tests:

- Same player turn: at the start of player P's turn, the other player O's next-turn metrics describe what P can do in that
  turn. Do they predict what O loses in it, beyond a plain distance baseline?
- Final result: at the start of each Game Turn, do they predict the final VP margin beyond the current VP, steps and
  out-of-trace units?

## Inputs and command

- Rows: the 24 `artifacts/ai-positions/*.jsonl` files listed with their SHA-256 in the record's
  [manifest.json](../ai-position-record-2026-10-18/manifest.json). 368 games; 116 are the same game recorded in two
  folders (same seed and policies, identical metrics in every row) and are kept once: 252 games, 183 Axis attacks (99
  temperate, 84 eastern) and 69 meetings (34, 35).
- Script: `scripts/ai-position-analysis.py` of the commit that adds this record (pure Python, no packages).

```sh
python3 scripts/ai-position-analysis.py 'artifacts/ai-positions/*.jsonl' --out artifacts/ai-positions/analysis/first.json
```

Output: `artifacts/ai-positions/analysis/first.txt` (SHA-256 `0d97e67d…1dcab0`) and `first.json` (`e88e70ea…13c429`), 1 min.

## Method

- Same player turn: player turns from Game Turn 2 that have a following row (3,276). Outcome per metric: objectives and
  objective VP O lost, steps O lost, fall of O's on-map SP to the next row, fall of O's HQ count. Baseline:
  `objectivesThreatened` (an enemy adjacent to a held objective) for objectives, `contact` for the others. Reported: the
  correlation r, the R² the metric adds to an OLS on the baseline, its 95% interval over 400 resamples of games, the
  outcome by bucket of the metric, and the share of the outcome falling in turns where the metric is above 0.
- Final result: rows at the start of Game Turns 2–8 (Axis first), target = final Axis − Allied VP. OLS models, R²
  cross-validated in 10 folds by game. Gains between nested models get a 95% interval from 100 resamples of games; copies
  of one game in a resample stay in one fold (a first run without this let copies sit in training and test and gave
  intervals that excluded 0 for objective reach; that run is not used).

## Observed

Same player turn, all engagements (3,276 player turns, 252 games):

| Outcome ~ metric | r (baseline r) | R² added [95%] | Outcome by metric bucket (mean; turns with any loss) | Loss in turns with metric > 0 |
|---|---|---|---|---|
| objectives lost ~ `objectivesAtRisk` | 0.45 (0.13) | 0.193 [0.160, 0.225] | 0: 0.00, 0% (n 1572); 1: 0.15, 15%; 2–3: 0.35, 28%; 4–7: 0.89, 53% | 100% |
| objective VP lost ~ `objectiveVpAtRisk` | 0.47 (0.13) | 0.206 [0.176, 0.248] | | 100% |
| steps lost ~ `stepsExposed` | 0.08 (−0.09) | 0.007 [0.003, 0.015] | 73% of turns at 8+ | 99% |
| steps lost ~ `stacksExposed` | 0.09 (−0.09) | 0.011 [0.005, 0.021] | 0: 0.41; 2–3: 0.82; 4–7: 1.26; 8+: 1.42 | 99% |
| on-map SP lost ~ `dumpSpInReach` | 0.07 (0.01) | 0.005 [0.001, 0.014] | 0: 0.15; 4–7: 0.64; 8+: 0.73 | 99% |
| HQs lost ~ `hqsInReach` | 0.18 (0.04) | 0.029 [0.021, 0.039] | 0: 0.00, 0% (n 883) | 100% |

By who moves: with the attacker moving (1,223 turns) objective VP r 0.48, `stacksExposed` r 0.37 (8+: 2.72 steps lost,
85% of turns), `hqsInReach` r 0.45 (R² added 0.210 [0.178, 0.256]); with the defender moving (1,156) objective r 0.28,
`stacksExposed` r 0.17, `hqsInReach` r 0.14; meetings (897) objective r 0.34 (98% of losses in turns above 0),
`stacksExposed` r 0.17.

Final VP margin, Axis attacks (183 games), cross-validated R² at the start of Game Turns 2–8:

| Model | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|
| VP | −0.024 | −0.019 | 0.100 | 0.338 | 0.626 | 0.791 | 0.898 |
| VP + steps | 0.115 | 0.192 | 0.281 | 0.441 | 0.675 | 0.809 | 0.906 |
| VP + out of trace | −0.005 | 0.054 | 0.202 | 0.409 | 0.623 | 0.792 | 0.898 |
| VP + steps + out of trace | 0.128 | 0.228 | 0.315 | 0.476 | 0.672 | 0.809 | 0.905 |
| … + objective VP reach (in reach − at risk, each side) | 0.061 | 0.245 | 0.381 | 0.528 | 0.709 | 0.814 | 0.912 |
| … + `stepsExposed` | 0.119 | 0.225 | 0.306 | 0.467 | 0.665 | 0.807 | 0.906 |
| … + objective reach, exposure, HQs, dump SP, units able to move | 0.116 | 0.271 | 0.412 | 0.525 | 0.704 | 0.805 | 0.910 |
| … + distance baseline (contact, within 2, objectives threatened) | 0.181 | 0.208 | 0.307 | 0.458 | 0.667 | 0.805 | 0.904 |

Gain intervals (95%): steps + out of trace over VP [+0.07,+0.24] [+0.16,+0.37] [+0.13,+0.29] [+0.07,+0.26]
[+0.02,+0.09] [−0.01,+0.04] [+0.00,+0.02]; objective reach over that [−0.08,+0.05] [−0.04,+0.12] [−0.02,+0.14]
[−0.02,+0.13] [−0.01,+0.10] [−0.02,+0.02] [−0.00,+0.02].

Meetings (69 games): VP alone 0.134 0.239 0.594 0.620 0.720 0.832 0.924; no added term improves it and every gain interval
contains 0.

## Conclusions

- Objectives at risk and in reach are a usable leading measure: no objective was lost in a turn where it was 0, and the
  loss rate rises with it. They do not yet add a proven gain to the final-result prediction beyond VP, steps and supply.
- HQs in reach predict HQ losses in the attacker's turns.
- Exposure is saturated by its upper bound and does not discriminate; dump SP in reach has no clean outcome to test
  (`bot-position-exposure`).
- In Axis attacks, steps and out-of-trace units predict the final VP margin beyond the current VP through Game Turn 6,
  mostly through steps.

## Limits

The games are almost all v79-family policies, so the relations hold for that play; a policy that plays differently may
change them. Rows of one game are correlated; intervals resample whole games. Meetings have 69 games, too few to show
small gains. The final-result models are linear.
