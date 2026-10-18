# Paired outcome predictors and supply conditions

Boundary: offline replay and exploratory analysis of 80 historical headless games. No new matches, policy changes, promotions or product UI acceptance changes.

## Inputs and measurement

The cohort is the same 80 games as the [VP pilot](../ai-vp-metrics-pilot-2026-10-18/README.md), with the same frozen v81 engine, ten map-seed groups, two map styles, standard v79 self-play and three related assault variants. All three variants have negative mean attacker VP changes. Historical games include off-map aircraft despite NONE options.

The input manifest, extraction hashes, script hashes, timings and checks are in [validation.json](validation.json). The checkout base is `60b5456`; the replay engine remains the historical frozen build. Each accepted action is checked against its trace, and initial/final state hashes and VP must match. Final `STEP_LOST` totals and opponent totals must match original `stepsLost` and `stepsKilled`.

The primary sample is 30 candidate-attacker differences against same-side self-play. Defender differences remain descriptive. The full 60 paired numeric rows are in [rows.json](rows.json); these are not 60 independent policy experiments.

New measurements are separated into early observations and outcomes. T4 owner Supply entry provides trace, individual ration, joint allocation and single-source dependence conditions. Mandatory recovery is simulated first. Joint allocation is the existing priority plan's feasible witness, not a maximum-strength optimum. All ratios use initial on-map supply-consumer RE ticks, including HQ and artillery. Future Supply burden is mean OOS RE ticks at owner Supply settlement during T5–8 divided by that fixed denominator.

Kill and Loss preserve summary-compatible `STEP_LOST` event counts. One whole-counter elimination can emit a single event. Mechanical attrition, overstack, combat, overrun, barrage and other origins are separated; the origins do not establish causal credit for a policy.

## Comparison

Each outcome compares zero improvement, training mean, early carry-forward, early count-rate projection, and an unpenalized fitted early-outcome baseline. One cutoff feature is added at a time with ridge penalty 1. Preprocessing uses training data only. Missing features also get missing-only models.

Validation leaves out a map seed, a variant, or both. The last trains on 18 rows for each of 30 test rows. Conditional intervals resample ten seed groups 1,000 times while holding the predictions fixed. They omit model-refitting and metric-selection uncertainty. These are previously inspected development games, so none of these splits is prospective evidence.

[results.json](results.json) contains metadata and links to all seven outcome reports. The reports retain every tested model, all three splits, variant means, associations and intervals. Per-seed arrays and predictions remain in the ignored full output. Smaller MAE is better; each outcome has its own units.

| Joint seed-and-variant holdout | VP | Kill events | Loss events | Supply burden |
|---|---:|---:|---:|---:|
| Zero improvement | 8.07 | 6.63 | 7.67 | 0.0324 |
| Carry early value | 6.27 | 6.70 | 5.67 | 0.0305 |
| Extend early count rate | 6.27 | 9.77 | 7.00 | 0.0305 |
| Fit early value | 7.81 | 7.37 | 6.53 | 0.0475 |
| Add trace gap | 8.38 | 7.43 | 5.29 | 0.0505 |
| Add individual ration gap | 10.36 | 7.59 | 6.99 | 0.0475 |
| Add joint allocation gap | 10.36 | 7.59 | 6.99 | 0.0475 |
| Add single-source dependence | 8.08 | 8.40 | 8.37 | 0.0447 |

Trace gap improves the fitted Loss model by 1.24 events, conditional 95% interval [0.28, 2.53]. Against early carry-forward it improves only 0.37, interval [−1.27, 2.05]. Seed-only MAEs for the same models are 6.54, 5.49 and 5.67. This is not a reliable advantage over the simple baseline.

Attacker deltas have only 16 nonzero trace gaps, seven individual ration gaps and six single-source dependence values. Joint and individual gaps are exactly equal in all 30 attacker differences. The cohort cannot distinguish their predictive information at this cutoff. Separate single-feature models also do not test whether joint allocation adds information conditional on individual access.

No added condition establishes a convincing advantage for VP, Kill or future Supply burden. Combat-caused Kill/Loss and attrition Loss are reported separately in [combat-kill.json](combat-kill.json), [combat-loss.json](combat-loss.json) and [attrition-loss.json](attrition-loss.json). Current conclusions and next priorities belong in [the metric topic](../../../ai/vp-metrics.md#補給條件的四結果比較).

## Verification

- All 80 games, 160 side observations and 1,280 Supply settlements were retained. Every side has owner Supply turns 1–8. There are 351 OOS windows and zero missing T4 entries, missing denominators or exhausted searches.
- The observer reconstructs actual lifecycle transitions and requires identical event blocks. It samples after supply status changes and before automatic attrition choices.
- An independent fresh replay of v80q TEMPERATE_INLAND match 1310000 reproduced its entire stored game payload. It has 11 Supply windows skipped within another action and five visible ones. At revision 248 an action starting in Movement crosses Allied T2 Supply, exposes two RE ticks, then automatically eliminates the recon unit; the stored sample includes the unit before elimination. Independent Allied early/final losses are 5/22 and Axis 5/23, matching the observer.
- An independent statistical review found no leakage, holdout contamination or preprocessing error. It compared 860 calls with the committed original regression implementation and found identical outputs. A missing-duration/coverage input was rejected after review identified that boundary gap.
- Both scripts' self-tests pass. Tests cover baseline duplication, future-target exclusion, training-only imputation and grouped splits. A known-signal synthetic case lowers joint-holdout MAE from 24.9851 to 1.3558, demonstrating sensitivity without claiming a game result.
- The observer audit found no blocking correctness issue for this frozen cohort. Zero denominators and exhausted ration plans are not exercised by these games. The earlier mechanism checks cover exhausted allocation separately, not the entire observer path.
- Successful ten-game extraction jobs took 71.9–126.5 seconds with three concurrent workers. This is measurement cost, not a performance claim.

## Reproduce

Restore raw historical artifacts at the paths in the validation manifest. Put its `inputManifest` value in `artifacts/ai-vp-metrics/advanced/manifest.json`. For each registered job, run:

```sh
node scripts/ai-vp-metrics-extract.mjs --advanced \
  --directory <job.directory> \
  --engine .claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/frozen-v81/dist \
  --variant <job.variant> --cutoff 4 \
  --out artifacts/ai-vp-metrics/advanced/<job.variant>-<job.style>.metrics.json
python3 scripts/ai-outcome-metrics-compare.py --self-test
python3 scripts/ai-outcome-metrics-compare.py artifacts/ai-vp-metrics/advanced \
  --out artifacts/ai-vp-metrics/advanced/results.json
```

Keep partial preflights in a subdirectory because the comparator requires exact registered coverage of top-level `*.metrics.json` inputs. Raw saves, traces and full outputs remain ignored under artifacts.
