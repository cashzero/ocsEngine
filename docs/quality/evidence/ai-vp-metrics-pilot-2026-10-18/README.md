# Preliminary VP metric comparison

Boundary: offline replay of 80 existing headless matches. No new bot matches, policy changes or promotions. No product UI acceptance row changes.

## Inputs

- Analysis base `77af28a`, with the two analysis scripts whose hashes are recorded in [validation.json](validation.json).
- Input selection, seeds and raw save hashes are in the [inventory](../ai-vp-metrics-inventory-2026-10-18/inventory.json). The batches contain off-map air support despite NONE options. They are not no-air evidence.
- Frozen v81 replay engine from `293ce72`, recorded by the full JavaScript build hash in [results.json](results.json). Standard opponent is v79. Historical candidate working variants are identified by their batch paths and recorded traces; the inventory does not establish separate frozen policy-build hashes for each historical variant.
- Ten map-seed groups, two map styles, eight turns, attack engagements. Standard self-play and three related assault variants contribute 20 games each. These variants and seeds were already used in strategy development.
- Observations use actions through Turn 4 and the state before the first Turn 5 action. Each side's found attack candidates are sampled at its first Turn 4 Combat Segment. Later events are used only for outcome verification.

## Method

Candidate metrics and final VP margin are differenced against standard self-play in the same role, on the same initial hash and full seed tuple. VP margin means own VP minus opponent VP. Positive final margin delta means improvement over standard self-play. Initial and intermediate scores are recomputed from objective control, since the cached victory scores can be stale.

The primary comparison uses the 30 candidate-attacker rows, ten seed groups and three variants. Defender rows are descriptive only. v80j and v80q defending have identical final hashes in all ten corresponding games, so they are not independent defender improvements. The candidate-attacker outcomes include 16 negative, 11 positive and three zero deltas; each variant's average delta is negative.

| Variant | Attacker final margin delta | Attacker Turn 4 margin delta | Defender final margin delta |
|---|---:|---:|---:|
| v80g | −4.6 | −2.6 | +1.6 |
| v80j | −7.4 | −5.8 | +2.4 |
| v80q | −1.8 | −1.8 | +2.4 |

These are per-game role deltas against self-play, not swapped-pair sums. They reproduce the role findings in the [historical assault study](../ai-assault-v81-development-2026-10-17/README.md).

Each model uses current VP delta plus one candidate metric delta. The intercept and current VP slope are unpenalized. Added coefficients use fixed ridge penalty 1, with training-only imputation, missing indicators and standardization. An exact duplicate of VP cannot improve the fit merely by changing effective shrinkage; the script tests this explicitly.

There are three exploratory splits: leave one map seed out, leave one variant out, and leave both the test seed and variant out. The last uses 18 training rows for each of 30 test rows. These splits do not turn previously inspected historical data into independent evidence. In splits that hold out seeds, all variants on the held-out seed stay outside training. The variant-only split shares seeds and does not establish generalization to new seeds.

## Observed predictive errors

Mean absolute error is measured in VP margin delta units. Smaller is better. The table shows seed holdout and the stricter joint seed-and-variant holdout; the JSON includes the variant-only comparison, all tested metrics and per-seed errors.

| Predictor | Leave seed out | Leave seed and variant out |
|---|---:|---:|
| Predict no improvement | 8.07 | 8.07 |
| Carry Turn 4 margin delta forward unchanged | **6.27** | **6.27** |
| Fit a model using Turn 4 margin delta | 7.47 | 7.81 |
| Add objective attack count | 8.60 | 8.88 |
| Add raw adjacent strength share | 8.07 | 8.35 |
| Add objective attack capture rate | 8.03 | 8.60 |
| Add mean declared objective attack column | 8.90 | 9.74 |
| Add mean found objective attack column | 7.36 | 7.65 |
| Add occupied share of held VP | 6.47 | 6.70 |

The added metrics are relative to the fitted Turn 4 model. None beats the simple carry-forward baseline in both reported splits. Objective attack count and raw adjacent strength share have Pearson correlations of −0.053 and −0.059 with final margin delta in these 30 attacker rows. This small sample does not establish that these quantities are causally irrelevant.

Combat-gained VP and objective attack capture rate correlate with final margin delta at 0.673 and 0.630, but their added models do not improve held-out prediction. Much of their apparent information overlaps with the VP already gained by Turn 4. Capture-rate differences exist in 21 rows; there is no defined rate when either compared side has no objective attack.

## Refinement of the occupancy metric

The apparent best added metric, occupied share of held VP, has only 13 defined differences and only two nonzero defined differences. In the other 17 rows, at least one side of the matched comparison holds zero VP, making its ratio undefined.

After inspecting this, the same exploratory data was used for two checks. They are not a new validation batch.

| Refinement | Leave seed out | Leave seed and variant out |
|---|---:|---:|
| Use only whether the occupancy ratio is missing | 6.43 | 6.67 |
| Replace ratio with occupied held VP count | 7.48 | 7.83 |
| Replace ratio with unoccupied held VP count | 7.70 | 8.00 |

Missingness alone reproduces the ratio's apparent benefit. This does not support a claim that the measured garrison proportion predicts improvement. The count refinements remove the zero-denominator problem but add no reliable advantage here. The ratio model's joint-holdout MAE improvement over the fitted early-VP model is 1.11, with a conditional 95% bootstrap interval of [−0.76, 2.74]. It also loses to the carry-forward baseline.

Bootstrap resamples the ten seed groups 1,000 times with RNG seed 74319. Intervals condition on the already fitted predictions. They omit model-refitting and metric-selection uncertainty and must not be read as independent significance tests.

## Verification and limits

- All 80 replays finish with the saved final hash and final VP. Every accepted action agrees with the trace. Objective gains minus losses reconcile with initial and cutoff control.
- There are 160 side observations, not 160 independent games. Six sides have no sampled Turn 4 Combat Segment. These remain explicit missing observations; no game was dropped.
- No sampled candidate query reports budget truncation at budget 400. The engine's candidate generator is itself heuristic, so the found columns still are not exhaustive best legal combinations.
- `objectiveSupplyRequirementTokens` measures forecast attacker requirements for objective attacks, including requirements met internally. It does not measure actual total SP expenditure.
- Raw adjacency is a printed-strength proximity measure, not committed, supplied effective strength. It counts each unit once even when several unowned objectives are adjacent.
- Plain replay and instrumented replay of match 1310000 have identical final hashes across 843 actions. A fresh replay of match 1310104 agrees exactly with the refined count metrics and skipped-segment handling.
- Self-tests cover grouped holdouts, training-only missing values, tied ranks, outcome exclusion and duplicate information. A deliberately incomplete dataset is rejected against the manifest.
- Successful extraction batches took approximately 62 to 213 seconds each with concurrent workers. Timings, hashes and checks are in validation.json; this is measurement cost, not a performance comparison. Failed extraction attempts are preserved under the ignored pilot artifacts.
- Only three related variants, ten seed groups and one early cutoff are studied. All three attacker variants are worse on average. The pilot cannot establish which metric predicts a genuinely successful future policy change, and no causal intervention has been run.

## Reproduce

From the repository root, restore the historical artifacts at the paths in the inventory. Create `artifacts/ai-vp-metrics/pilot/manifest.json` from the inventory's `manifest` member. For each manifest job, run:

```sh
node scripts/ai-vp-metrics-extract.mjs \
  --directory <job.directory> \
  --engine .claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/frozen-v81/dist \
  --variant <job.variant> --cutoff 4 \
  --out artifacts/ai-vp-metrics/pilot/<job.variant>-<job.style>.metrics.json
python3 scripts/ai-vp-metrics-compare.py --self-test
python3 scripts/ai-vp-metrics-compare.py artifacts/ai-vp-metrics/pilot \
  --out artifacts/ai-vp-metrics/pilot/results.json
```

The comparator requires the complete manifest. Raw extraction files remain in ignored artifacts; the compact report is stored here. Current conclusions and next research direction belong in [VP metrics](../../../ai/vp-metrics.md).
