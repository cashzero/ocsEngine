# Independent empirical review

Reviewed HEAD `97e6e049f5a53d50b4372a87d51f465448ca4a63`, the frozen protocol and registration, recorder and scorer source, cohort, batch runtime, all 80 raw game files, their historical saves, and `results/analysis.json`. This is a read-only numerical review. No game was regenerated or new candidate association tested. Throughput checkpoint is not applicable to this investigation.

The frozen results are numerically consistent. They identify one new exploratory lead, `alone:approach:scoreBlocked`. They do not establish a transferable predictor, an improved policy, or a reward. M2 has the lowest error among the registered models on this selected subset. The new diagnostic alone improves on zero and fitted VP, but loses to M2. Adding it to fitted VP fails to beat zero.

| Model | MSE, VP squared | MAE, VP | Bias, VP |
|---|---:|---:|---:|
| Zero | 10.662500 | 2.600000 | -1.225000 |
| Training mean | 10.925000 | 2.696875 | 0.000000 |
| Fitted VP | 12.521409 | 2.950938 | -0.479057 |
| Historical M0 | 10.432584 | 2.575000 | -1.195183 |
| Historical M1 | 10.156408 | 2.598839 | -0.567513 |
| Historical M2 | 7.686068 | 2.243779 | -0.679643 |
| Score-blocked approach alone | 9.280461 | 2.527294 | 0.058691 |
| Fitted VP plus score-blocked approach | 10.851431 | 2.621435 | -0.042058 |

The alone model reduces MSE by 1.382039 relative to zero and 3.240948 relative to fitted VP. It increases MSE by 1.594393 relative to M2. The additive model reduces fitted VP error by 1.669978 but exceeds zero error by 0.188931. These are descriptive differences over overlapping predictions.

I independently reconstructed the features from compact groups and windows, checked all final oriented margins against historical final snapshots, and solved the registered ridge systems through separate normal equations with Gaussian elimination. All 1,200 predictions across 30 models match within 1.25e-14. Overall, split, family, and climate MSE, MAE, and bias match within 1e-10. All 80 historical save-byte hashes and accepted-action hashes match the cohort. Initial and final identities, accepted counts, and stored regeneration assertions agree. The source contains the complete action equality and independent replay checks. This review did not rerun those expensive checks. The 80 game records cover 68,207 accepted actions and 65 distinct initial-state plus action-sequence identities. All 80 compressed witnesses and their retained report hashes match. The batch records 80 successful exits, no stderr, and exactly the two registered climates.

The aggregate result has material reversals.

| Evaluation climate | Zero MSE | M2 MSE | Score-blocked alone MSE | VP plus score-blocked MSE |
|---|---:|---:|---:|---:|
| Eastern Europe | 14.700000 | 13.333659 | 18.762383 | 22.236319 |
| Temperate inland | 19.150000 | 14.563478 | 12.323540 | 11.991543 |

The alone diagnostic beats zero in all four oriented splits, with MSE pairs of 3.585057 versus 6.500000, 5.953048 versus 5.975000, 13.400755 versus 15.150000, and 14.182987 versus 15.025000. M2 beats the alone diagnostic in all four. The split 1 advantage over zero is only 0.021952. The fitted diagnostic coefficient is negative in all five held-family fits for splits 0 through 2, and positive in all five for split 3. A single monotone interpretation of more score-blocking as worse VP is therefore unsupported.

By held family, the alone diagnostic improves over zero for contactBad, crowding, hqWithArmy, and progressObjective. It reverses for outOfSupply, with MSE 10.634014 versus zero 5.125000 and M2 5.849760. Its largest errors include progressObjective-double, split 3, where it predicts 0.529925 against an observed 9.000000, and split 2, where it predicts 0.583451 against 7.500000. Those evaluation targets are 9 and 9 across climates in split 3, so that error cannot be explained by climate cancellation. The additive model also predicts 14.555701 for crowding-double in split 0 against 6.000000. Its fitted VP coefficient there is 6.595735, showing the practical consequence of estimating an unpenalized slope from very sparse early VP variation.

The reported target is the seat-swapped oriented variant-versus-opponent final margin on other seeds. It is not an absolute gain over separately played standard selfplay. The main error first averages the two held climate targets. Mean climate-specific MSE equals pooled MSE plus 6.262500 for every model. This identity independently checks the aggregation and quantifies how much pooled scoring hides disagreement between climate outcomes. Climate-specific rows use the same development-based prediction, as registered.

The support sharply limits the mechanism claims. There are 14,486 early movement groups, 28,949 reports, 80,521 queries, and 1,345 truncated queries. Path-only linking reaches one objective window in the entire cohort, with three candidate occurrences and no improving path. Five path diagnostics are constant zero. Path score-blocking has one nonzero pair and zero training variance in 24 of 40 fits. These models cannot test a general route-level mechanism. Approach linking provides 984 objective windows, with 29 score-blocked windows across 27 nonzero player measurements and 14 nonzero pair contrasts. Of the 984 windows, 950 belong to axis and 34 to allied. This is observed pressure under the attack scenario and the unowned-objective filter, not symmetric opportunity exposure or a probability denominator.

The approach rows contain 165,300 improving candidate occurrences, but only 14,479 final supply checks. Those checks yield 10,229 refusals and 4,250 preserved paths. Unchecked occurrences remain unknown. Group exhaustion does not beat raw refusals here. Alone MSE is 13.018041 versus 11.156449, and VP-additive MSE is 14.922145 versus 12.882441. Neither version beats zero. Repeated group and route counts measure different, policy-dependent populations, so this is a failed predictor comparison rather than proof that a particular supply mechanism is absent.

Early VP is zero in 37 of 40 pair records. It is nonzero for two progressObjective records and one contactBad record. All ten split 2 fitted VP models therefore reduce to the training mean. This explains why additive models equal their diagnostic-alone versions in that split and limits any claim that their fit tests a broadly varying early VP baseline.

Repeated trajectories remain informative about a limitation. Games 17, 20, 28, and 32 have identical initial states and accepted actions. Their variant-player score-blocked measurements include 0.111111 for game 17 and zero for the other three. Different policy weights can change evaluations while leaving played actions unchanged. That is legitimate for a policy-evaluation diagnostic, but it rules out treating metric changes themselves as established changes in achieved behavior.

There is no numerical blocker to reporting the frozen comparison. Qualification remains open. Five families were chosen after historical outcomes were known, only four seed pairs are present, and 40 predictions reuse 10 variants, five families, and 65 trajectories. Leave-family-out calibration controls a particular fit leak but does not undo cohort selection or model selection. The historical M models also observe the resolved GT4 weather and first-player state, while the movement features exclude all GT4 reports. M2 winning here does not reverse the broader P8a finding that transfer was not qualified. The complete broader comparison remains in `docs/quality/evidence/ai-surrogate-transfer-2026-10-19/` and `docs/ai/policy-errors.md`.

A separate post-result exploration is warranted by the observed population mismatch between repeated group exhaustion and whole-window score-blocking. One measurable refinement is a window that is either score-blocked or has improving COMBAT approaches with every such occurrence actually checked and refused. This must retain observed coverage, untested routes, and correction-budget counts. In support-only inspection, 43 windows satisfy that union and 29 are already score-blocked. The 14 additional windows are the new information. No predictive association for that refinement was computed in this review.

The proposed HQ or artillery masking explanation was falsified before testing a new model. Every approach window has COMBAT observations. There are zero windows where COMBAT has no improving approach but a non-COMBAT approach clears the all-role indicator. There are also zero COMBAT-unavailable windows with a preserved non-COMBAT route. COMBAT-only score-blocking is therefore an identical indicator on this panel and earns no second prediction test. The new union can describe failure under retained scoring and visited supply checks. It cannot establish physical unreachability, causal blockage, or what budget-skipped corrections would have done.

For a later frozen exploration, comparing that one union feature against original score-blocking as an offset to fixed-slope historical M2 is a reasonable test. Include the M2 training-mean residual offset as its baseline. Freeze the model and support rules before its outcome associations are calculated. Retain this comparison unchanged. Any favorable result still needs separately registered data, within the 80-game limit and without Mediterranean maps, before a qualification claim.

The rerunnable independent calculation is `empirical-review-scratch/recompute.py`. Its output is `empirical-review-scratch/recompute.txt`. Explain the Number changed the review by requiring climate and family reversals alongside aggregate error. Prove It Works changed it by requiring source-save identities, reconstructed features, and an independent ridge solution rather than trusting the published result file.
