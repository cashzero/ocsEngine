# Independent review of turn-owner correction

The schema 2 owner correction and fixed equal-seed calibration have no blocking correctness finding in the reviewed code and corrected historical run. This verdict covers these instruments and this cohort. It does not qualify a stronger bot policy or complete the broader metrics program.

The reviewer did not author the three scripts. The review used the current source, rule lifecycle, original and corrected protocols, decision trail, failing regression record, corrected observations, predictions and analysis. It did not reconstruct the entire pre-compaction conversation independently.

## Source and artifact identity

| Artifact | SHA256 |
|---|---|
| scripts/ai-objective-replay.mjs | f271de7d78a04a0ef3c796ba339912934def5176fd2df2ad6837890923625762 |
| scripts/ai-objective-replay-verify.mjs | f0dec2f8d0eb94ce7e1a05c80b71210a392804ac1e7d1031db61335939e1b48e |
| scripts/ai-objective-study.py | 07f5dde455b0cbce10923d734b2576fadd9640393654bea5867c7ac48191fa35 |
| corrected-run/worklist.json | 520774252af01c526b146798a8b390d2bfe1a3ba5c219a74bc90405d6279b810 |
| corrected-run/observations.json | b0d7d1ff99a446b3cbe122b3941bf817f8f9b9b369a545480f6f19f50172e440 |
| corrected-run/predictions.jsonl | e45e4de4dd104d94b6637dfca4e09256e8958043ba4d0e13bc1dec1b37c9731f |
| corrected-run/analysis.json | 05330a4b2806a71b9e327294f16a1aff3e64b1e02d3e6bbf8d674ff0d6b000f8 |

Artifact paths in this table are relative to this review's directory unless they begin with scripts/.

The reviewed Python predecessor was 20ec8502e6a3146094f541e27805f5cf399c752ce2692b9e18841e6244398f2b. Its analysis hash was 801bae46ac037a6793c2d27bfe60feadf8ad76615167c0a35ef9aa2ec8734eb5. The final Python change adds only descriptive zero-ratio retained-target details. The canonical rescore retains the same observations and prediction hashes. I checked that its analysis records the final runner hash and reran the final Python self-test successfully.

## Checks performed

`node scripts/ai-objective-replay-verify.mjs /tmp/ocsEngine-objective-study-engine` passed. The regression checks that an unresolved FIRST_PLAYER state rejects a snapshot, that choosing second changes the actual phasing player, and that both first and second choices produce the correct owner, role and post-choice revision. The preserved pre-fix failure is a missing expected exception for `turn order unresolved`, rather than an unrelated runtime error.

`python3 scripts/ai-objective-study.py --self-test` passed. The tests include rejected ownership metadata, role indicators, configured objective identities, target-ledger accounting, held-out label invariance, training-only preprocessing and optimizer controls.

The rule implementation confirms the premise. `determineFirstPlayer` installs the roll winner as the temporary phasing player. `resolveFirstPlayerDecision` can replace that player without changing the game-turn or player-turn key. JS and Python reconstruct the choice from accepted source traces independently. The replay snapshots after the decision and checks the actual phasing player before every observed action. Alias trace revisions and step keys must match the replay state.

I independently counted 84 deferred FIRST_PLAYER windows in the corrected worklist. There are 59 first choices and 25 second choices. Every corrected owner is exactly a second-choice case. The 156 windows now contain 52 attacker-moving, 52 defender-moving and 52 meeting windows.

I reran `validate_observations` against the corrected worklist and observations. The 12 unique trajectories retain all 16 aliases, 8 map seeds, 156 windows and 1,352 configured-target rows. There are 704 initially enemy-held targets and 39 retained acquisitions. All 648 initially owned targets remain owned. The old apparent four own-target losses therefore do not survive the owner correction. The completed replay checked 9,484 accepted actions, 256 observer probes and 100 accepted objective-combat witnesses.

The ledger validation recomputes gains, losses, recaptures, start VP, end VP and signed deltas from every target's control history. It compares both players' gross counts and VP against the original recorder's per-window totals. It does not accept the reconciliation flags alone. All corrected windows reconcile. Omitting the initial choice action does not lose any objective transition in this cohort.

The feature vector is frozen before later objective events and excludes declaration witnesses, control events and labels. Primary rows are selected by the holder at that snapshot. Whole map seeds remain outside their training folds. Imputation and scaling use only the training rows. Role reports reuse the same outer-fold predictions. No new label-dependent feature selection or tuning accompanies the owner correction.

For equal-seed calibration, the implementation fixes a row's weight from the complete scored subset before binning. I checked the unequal-bin example separately. Seeds with 10 and 20 rows and low-bin counts of 1 and 18 yield bin mass 0.5, event rate 0.1 and Brier 0.0925. I also checked every corrected analysis calibration table across groups, models and weightings. Occupancies sum to one, and occupancy-weighted bin statistics reconstruct each complete-subset event rate, probability, bias and Brier score.

## Interpretation and attention

The corrected pooled M3 Brier is 0.03769665 versus M1 0.04293569. The paired seed interval for M3 minus M1 is [-0.01691079, 0.00176889]. M3 improves four seeds and worsens four seeds. Seed 295661615 supplies the largest reduction. These are exploratory prediction results from eight already inspected historical seeds. The fixed-error interval excludes refitting and selection uncertainty.

Window expected-VP MAE is 0.81453 for M3, 0.91209 for M1 and 0.74359 for the zero baseline. The different behavior of Brier and MAE is retained in the result. Choosing a favorable secondary score would change the declared comparison after seeing the data.

The decision trail preserves the owner discovery and failing guard, rather than silently replacing the old interpretation. Original protocol and contract files retain their recorded hashes. The current contract now states schema 2 in its owning paragraphs. The current protocol is a post-discovery amendment. It must not be described as independently frozen before the first schema 1 results.

The older recorder and full 255-trajectory near-term corpus are still unrepaired. Their actual-mover and per-role claims must stay reopened until re-extraction and revalidation. The current TODO inventory and policy-errors topic correctly record this limit. The new 12-trajectory run cannot close it by inference.

I read the final numerical docs/ai/objective-metrics.md. Its sampling boundary, model formulas, grouped evaluation and known gaps match the reviewed implementation. I independently checked the model and role tables, both Brier intervals, 116 acquired VP across 29 nonzero windows, seed influence calculation, calibration-bin examples and conditional-combat counts against the final analysis and predictions.

I independently reconstructed the final descriptive zero-ratio list from the observations. It contains exactly 15 retained acquisitions. Their nearest own combat-unit distances are 3 hexes in nine cases, 5 hexes in three cases and 6 hexes in three cases. Fourteen targets initially have defenders. Every emitted window, target ID, distance and combat status matches the raw observation. The list does not enter the feature vector, model fitting or scores. The unchanged prediction hash confirms that the addition did not alter fitted predictions.

Conditional adjacent-formation odds remain distinct from a legal joint movement, fuel and combat-supply plan. Initially owned and neutral targets are accounting rows, not fitted outcomes. No prospective policy-gain or full net-VP claim follows from this experiment.

The Prove It Works principle changed the review from checking success flags to reopening the actual corrected observations and rerunning their validator. Explain the Number changed the review from quoting pooled Brier alone to checking seed dispersion, calibration weights and the zero-VP baseline.
