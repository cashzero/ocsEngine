# Position metrics: residual review (plan P3)

Boundary: offline replays of saved headless bot-against-bot games. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md).

## Question

Which information do the adopted position metrics lack? Read the player turns whose near-term outcome they missed most.

## Selection rule

Written before any case content was read (`scripts/ai-position-residuals.py`). For each outcome, the metric P2 adopted
whose baseline-plus-metric linear model had the lowest out-of-fold MAE over all roles in the
[P2 validation](../ai-position-metrics-p2-2026-10-19/README.md); its ten-fold map-seed out-of-fold predictions were
recomputed with the validator's functions; in each role subset the 20 player turns with the largest actual minus
predicted value were kept, ties by trajectory id, Game Turn and player turn.

| Outcome | Metric (baseline) |
|---|---|
| O combat steps lost in P's turn | `stacksExposedAllocated` (`contact`) |
| O objective VP lost | `objectiveVpAtRisk` (`objectivesThreatened`) |
| O attrition in its following turn | `supplyCuttable` (`outOfTrace`) |
| P objectives gained | `mover.bestObjectiveEffectiveColumn` (`mover.contact`) |

The first version of the rule allowed any tested metric and used the mover's objective VP gained. It picked
`mover.unitsWithReach` for combat losses, whose gain P2 traced to pooled roles, and its objective VP gained repeated the
objective VP lost (the same events from the other side). Both were changed after only the selected metric names and
residual sizes had been seen, before any case was replayed.

## Inputs and commands

The P2 record and validation (`artifacts/ai-positions-p2`, [manifest](../ai-position-metrics-p2-2026-10-19/manifest.json)),
scripts of the commit that adds this record, dist built from src as of `eee03e2`.

```sh
python3 scripts/ai-position-residuals.py --manifest artifacts/ai-positions-p2/manifest.json --artifact-root . --validation artifacts/ai-positions-p2/validation/results.json --out artifacts/ai-positions-p2/residuals/cases.json
node scripts/ai-position-residual-review.mjs --cases artifacts/ai-positions-p2/residuals/cases.json --out artifacts/ai-positions-p2/residuals/review.json
```

240 cases (4 outcomes × 3 roles × 20), replayed in about 8 min. SHA-256 of the case list, the review and the validation
output: [manifest.json](manifest.json). Per outcome and role summary: [review-summary.json](review-summary.json).

## Observed

Combat steps lost (152, 107 and 130 lost steps in the attacker-moving, defender-moving and meeting cases):

| | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| Median declared column of the combat | 8 | 10 | 11 |
| An attacker started 3+ hexes from the target | 74% | 50% | 69% |
| Defender not adjacent to an enemy at the start | 79% | 75% | 88% |
| Defender out of trace at the start | 17% | 23% | 24% |
| Overrun / barrage share of losses | 5% / 3% | 15% / 5% | 9% / 4% |

Objectives taken from O (the objective VP lost cases; the mover's objectives gained cases in brackets):

| | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| Objectives taken | 49 (55) | 20 (20) | 27 (28) |
| Garrisoned at the start | 59% (71%) | 60% (75%) | 78% (89%) |
| Taken in a combat | 53% (62%) | 60% (70%) | 70% (86%) |
| Of combat captures: an attacker started 3+ hexes away | 85% (94%) | 42% (43%) | 47% (71%) |
| Of combat captures: column below 6 | 38% (21%) | 33% (29%) | 42% (21%) |

O attrition in its following turn (296, 156 and 196 attrition steps):

| | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| Out of trace at the start of P's turn | 73% | 49% | 53% |
| Out of trace at the start of O's turn | 98% | 99% | 97% |
| Enemy within 1 hex at the start of P's turn | 41% | 13% | 13% |
| Enemy more than 3 hexes away then | 26% | 49% | 34% |
| In trace at P's start by draw / an HQ still fed / only HQs later gone / only HQs later unfed | 55 / 0 / 7 / 11 | 37 / 4 / 22 / 14 | 33 / 5 / 24 / 25 |

## Conclusions

- `bestObjectiveEffectiveColumn` counts own units within 2 hexes of the objective; most combat captures, above all by the
  attacker, used units from 3 or more hexes away. A column from every unit that can reach a hex beside the objective is
  missing, and a fifth to two fifths of combat captures came below column 6, so a continuous column suits better than
  a column-6 count.
- Combat losses come mostly from attackers moving in from a distance at columns around 8; exposure counts column 9+
  only. An allocated expected loss over all columns is missing.
- About half the units of the defender-moving and meeting cases that were in trace at P's start and later lost steps to
  attrition traced only through HQs that were destroyed or cut off afterwards; the single-move supply cut does not model
  an HQ destroyed in combat. A count of units depending on HQs the opponent can reach is missing.
- Most attrition fell on units already out of trace at P's start; whether they can eat from a dump is not measured.
- These lead to the revised P4 candidates in the plan.

## Limits

Cases are the 20 largest misses per role and outcome, not a sample of all turns; the shares describe those misses. The
review reports the turns' events, not why the policy acted so. Games are v79-family play.
