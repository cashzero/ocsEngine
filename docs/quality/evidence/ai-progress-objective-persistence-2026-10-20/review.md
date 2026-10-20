# Progress persistence review

Review is complete. No correctness or reporting blocker remains for this bounded post-result measurement and its evidence bundle. This verdict does not qualify a VP predictor, promote a policy, or complete a product-operation gate.

## Scope and boundary

Reviewed `protocol.md`, `registration.json`, `extract.mjs`, `score.py`, the subsequent `check-extraction.mjs`, measurements, results, extraction checks, and all thirty emitted boundary snapshots. Source grounding includes the rules sequence, lifecycle and reducer paths, the heuristic's processed-unit filter, and the prior original-policy continuation scripts and review. This reviewer launched no game, policy call, or full-history replay.

The source commit is `36e24ccf3af6d9dd83810bbcf9d360f93bc8231b`. All 38 registration file digests match. Independently recomputing the sorted `dist/**/*.js` digest gives the registered `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`. Measurement script and protocol hashes also match their actual files.

The primary boundary is correctly defined before the first accepted departure from the intervention's own MOVEMENT/MOVEMENT segment. The extractor requires the original gameTurn, playerTurnIndex and phasing player, and compares the full pre-action sequence with `SEQUENCE_ADVANCED.from`. The sequence implementation advances this segment to MOVEMENT/BARRAGE. Lifecycle emits the event before applying front-control and other hooks. Measuring the pre-action state therefore excludes those effects. Accepted actions without an actual departure do not establish the boundary. Both histories use the same rule boundary even when action counts differ elsewhere.

## Measurements and verification

All fifteen registered pairs and thirty histories are present. The extractor legally replays 9,878 actions to the required observations. Independent raw-save checks confirm every boundary action and every first subsequent MOVE_PIECE of the same unit. Histories with both observations stop at the later observation. Exactly six histories have no later move and reach the source final hash rather than receiving an invented endpoint.

The checker separately replays 2,282 actions to reconstruct all thirty boundary states and accepted exit actions. Its script and snapshot-file hashes match the recorded checks. This reviewer independently parsed and hashed all thirty serialized snapshots. Every hash agrees with its measurement. Direct summation of configured objective points by actual hex control reproduces every recorded current score. Sequence, pending decision, revision and paired margins also agree.

Independent geometry arithmetic confirms every distance, original target, piece identity and objective-value scale. Every unit is alive and on the map. All thirty units remain at their divergent first move's endpoint, and all fifteen retained scaled-progress values equal the frozen first-action feature within 1e-9. Missing or off-map units would produce unavailable distances rather than zero. The heuristic excludes units already in `notes.done` and adds processed units to that set, consistent with this observed persistence.

All fifteen paired current-VP-margin differences are zero. Absolute scores are not zero. Every assigned target remains Allied-controlled. Cached victory scores differ from actual objective scores in 28 of thirty histories. The checker rejects altered target identity, altered distance and a genuine stale cached-score payload at the corresponding semantic assertions. These controls compare the emitted measurement contract with reconstructed actual states.

## Model identity and limits

The scorer implements fixed direct-VP slope 1, training-only residual means, and one-feature ridge penalty 1 with training-only centering and population scaling. In this actual dataset, all four reported labels alias frozen earlier prediction vectors. Direct boundary VP equals the earlier zero baseline. Its residual mean equals the earlier training mean. Retained progress and the progress residual equal the earlier progress model. No duplicate coefficient fit is presented as a new experiment.

Independent checks reproduce each aliased fold identity, prediction and aggregate error exactly. MAE remains 4.4 for zero, 4.7619047619 for training mean and 4.9989104442 for progress. Corresponding MSE values remain 36.5333333333, 41.9183673469 and 45.5749593627. The later measurement adds no new geometry feature here and supports no additional predictive gain over the paired current-VP baseline.

Terminal outcomes and the earlier route features were already observed. This is exploratory measurement within one weight family and one original dice realization per seed. It does not establish an independent best predictor or a feature available before the first action. The boundary feature requires executing the movement segment.

Ten pairs have the next same-unit move observed in both histories. Two pairs, 1800012 and 1800022, have equal next destinations. Six individual histories are censored. Each observed move retains its own sequence and timing. All fifteen boundary-state hashes differ across arms. Equal geometry cannot establish identical rules state, memory, RNG or future value.

## No-comments review

Files reviewed are `extract.mjs`, `score.py` and `check-extraction.mjs`. Comments found 0. Deletions required 0. MUST KILL flags 0. Suppressions found 0. Markdown and data files are outside the code-comment scope. Application source was inspected for grounding and was not changed.

## Documentation and evidence

Reviewed the `progressObjective 在移動段終點的資訊` subsection in `docs/ai/vp-metrics.md` and `docs/quality/evidence/ai-progress-objective-persistence-2026-10-20/README.md`. They agree with the measurements, distinguish paired VP differences from absolute scores, and identify reused model errors. They retain censoring, timing and state-equivalence limits. Neither document claims new games, independent prediction validation or pre-action feature availability.

All ten listed evidence-file hashes match. The nine artifact copies are byte-identical to their originals. Raw snapshots remain in ignored artifacts and are bound by their SHA-256. The owning agent will copy this review and regenerate the evidence hash list before committing. No default weight, policy version, supply-safety audit, UI acceptance or promotion status changes.
