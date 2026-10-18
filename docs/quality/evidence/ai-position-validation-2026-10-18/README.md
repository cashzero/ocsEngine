# Grouped validation of near-term position indicators

Boundary: retrospective analysis of existing headless records. No new matches, replays, policy changes, promotions or product UI acceptance changes. Final VP and new-policy improvement are outside this run's predictive boundary.

## Inputs and identity

Base checkout `ef972c6`. The validator and shared regression helper are identified by SHA256 in [validation.json](validation.json). Raw records use the existing [exposure manifest](../ai-position-exposure-2026-10-18/manifest.json), with all 26 listed hashes verified. Twenty-four entries contain position rows; the others are earlier analysis outputs.

There are 368 recorded source aliases. Each source summary and save is read for provenance. Exact identity combines the initial state hash, final state hash and SHA256 of canonical accepted actions. Duplicate identities must have identical ordered metrics, turn events and final VP. This gives 255 trajectories, 96 map seeds and 3,315 usable player-turn windows. The final player turn and Game Turn 1 are excluded.

The previous metrics-only key merged two groups of three and two exact trajectories, reducing the count by three. [identity-collisions.json](identity-collisions.json) preserves their distinct action hashes and aliases. One group includes differing final VP. The former final-VP qualification is reopened until rerun with correct identity and seed grouping; this record does not substitute near-term success for that check.

## Method and model refinement

Before player P acts, non-phasing player O's recorded metrics predict what O loses in that action window. Recorded objective and step losses supply those targets. Supply rise is the positive net increase of O's out-of-trace count to the next record, not a causal count of newly cut units. HQ loss is the decrease in O's HQ count.

All appearances of one map seed stay in the same one of ten folds. Source-batch sensitivity tests also exclude every test seed and every trajectory whose aliases include the held-out batch. Batches are reported separately because test sets overlap. Role subsets have separate fits.

The initial linear comparisons used a distance baseline and the baseline plus one indicator. The distance baseline and intercept are unpenalized; the standardized extra coefficient uses ridge penalty 1, with training-only preprocessing. Later inspection identified zero-event and training-median controls as necessary for sparse-target MAE. All pooled linear models lose to zero-event MAE even though several improve squared-error prediction.

A second exploratory model uses training medians within the historical fixed buckets 0, 1, 2–3, 4–7 and 8+. Unseen buckets fall back to the training median. Both the distance baseline and the new indicator receive the same bucket model. The model was proposed after inspecting the linear results. [registered-design.json](registered-design.json) records the initial exploratory plan; its timestamp is not independent preregistration evidence.

Intervals use 1,000 paired map-seed cluster resamples of fixed held-out errors. They omit refitting, selection and multiplicity uncertainty. Different game/seed weights or future policies may change the findings.

## Results

[results.json](results.json) retains all role subsets, seven comparisons, every model and confidence interval. It links to six separate batch reports. Full fold audits, trajectory aliases and per-seed errors remain in ignored artifacts.

| All roles, mean absolute error | Zero event | Distance buckets | Indicator buckets |
|---|---:|---:|---:|
| Objective VP lost, objective VP at risk | 0.4078 | 0.4115 | 0.4078 |
| Objectives lost, objectives at risk | 0.1541 | 0.1554 | 0.1504 |
| Loss events, allocated exposed stacks | 1.2009 | 1.1614 | 1.1143 |
| Positive trace-loss count rise, supply cuttable | 2.1795 | 2.1795 | 2.1795 |
| HQ losses, HQs in reach | 0.1713 | 0.1713 | 0.1713 |

The pooled allocated-exposure bucket model beats zero-event MAE by 0.0866, conditional interval [0.0513, 0.1223], and contact buckets by 0.0471, interval [0.0158, 0.0804]. Against unallocated-stack buckets, improvement is only 0.0163, interval [−0.0038, 0.0348]. The allocation refinement has not established superiority over unallocated exposure.

The strongest scope is attacker-moving windows, predicting the non-moving defender's loss events. In 1,244 windows, allocated-exposure buckets have MAE 1.3682 versus training median 1.5643, contact buckets 1.5225 and unallocated-stack buckets 1.4116. The gain over contact buckets is [0.0979, 0.2110]; over unallocated-stack buckets it is [−0.0056, 0.0938]. All six attacker-moving batch sensitivity tests have positive gain intervals against contact buckets and the training median. They are overlapping sensitivity tests, not six independent replications.

The refinement fails in other scopes. Defender-moving bucket MAE 0.6035 is worse than zero-event 0.5911, with gain interval [−0.0261, −0.0009]. Meeting windows are inconclusive. Pooled objective-VP, supply and HQ bucket predictions are literally all zero. Objective-count improvement against zero has an interval containing zero.

Linear objective-VP, allocated-exposure and supply-cuttable models add held-out R² of 0.2067, 0.0504 and 0.0552 over their distance baselines. That is relative squared-error information, not superior MAE or established calibration. Their pooled MAEs are 0.6060, 1.2328 and 3.0099, all worse than zero-event controls. A metric can contain information about rare events without a linear point prediction being the best forecast of a typical window.

## Method negative control

[negative-control.py](negative-control.py) extracts the original fitting functions without running the original script's data-loading body. With 200 independent Gaussian observations and seed 936, it gives in-sample R² gain 0.00208 and bootstrap interval [0.000012, 0.03369], while ten-fold held-out R² gain is −0.01092. [The generated JSON](negative-control.json) records the source hash.

This demonstrates a possible failure of interpreting positive nested in-sample R² intervals as predictive improvement. It is an illustrative control, not an estimate of a general false-positive rate.

## Verification and limits

Two independent reviews found no scoped implementation blocker. They reconstructed all input identities, reran the original linear analysis, checked all training/test seed intersections, and verified current helper/script hashes. The final review independently reconstructed all five control/bucket model MAEs over 28 primary evaluations, and all 84 primary bucket-gain interval bounds. All required primary fields and folds are present.

Self-tests exercise known-signal sensitivity, a null signal, duplicate conflict rejection, grouped-fold coverage, batch aliases, test-outcome mutation, forbidden future fields, training bucket medians and unseen-bucket fallback. The negative-control generator reproduces its adjacent JSON exactly.

These previously inspected indicators and games remain exploratory. Step-loss events include attrition and other origins; this does not establish causal Kill credit. Supply rise is a positive net count. Several batch tests have only eight or twenty seed groups. These signals do not establish that changing a policy improves final VP. Current conclusions and open work belong in [policy errors](../../../ai/policy-errors.md#指標是否可用) and [the predictor topic](../../../ai/vp-metrics.md).

## Reproduce

From the repository root with the historical artifacts restored:

```sh
python3 scripts/ai-position-validate.py --self-test
python3 scripts/ai-position-validate.py \
  --manifest docs/quality/evidence/ai-position-exposure-2026-10-18/manifest.json \
  --artifact-root .claude/worktrees/ai-truck-shuttle \
  --out artifacts/ai-position-validation/results-with-buckets.json
python3 docs/quality/evidence/ai-position-validation-2026-10-18/negative-control.py
```

The full raw result stays in artifacts. Committed JSON files remove repetitive fold/seed arrays while retaining model scores, intervals, support counts and empty/missing status. Every JSON file is under 200 KB.
