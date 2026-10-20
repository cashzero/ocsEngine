# progressObjective observation review

No blocking correctness or overclaim finding in the reviewed observation or the current `docs/ai/vp-metrics.md` addition. This verdict covers retrospective description of WESTERN `TEMPERATE_INLAND`, `AXIS_ATTACKS`, and `progressObjective` only. It does not qualify a policy promotion, predictor, reward, or product operation gate.

## Independent checks

- Replayed all 16 raw saves through the current engine. All 13,903 actions were legal. Initial and final state hashes matched. Every recorded objective-control change and turn-end control row matched the replay. Final control points reconciled with summary VP. The replay engine tree hash matched `results.json`.
- Checked raw-save identity hashes, map seeds, attack engagement, finished status, zero recorded rejections, variant policy seat, and both seats in each seed pair. WESTERN is the profile used by `TEMPERATE_INLAND`, not a serialized `summary.options.theater` field. The review verifier initially asserted the latter nonexistent field, stopped before replaying, then used the actual map-style field. No game was omitted.
- Recomputed all pair averages from raw summary rows. The four double-minus-half VP margins are +6, 0, +3, and 0. Their mean is +2.25. Summary `stepsLost` reconciles with all `STEP_LOST` events. Summary `stepsKilled` is the opponent's total loss count. These are secondary all-cause figures, not pure combat kills.
- Recomputed all eight common action prefixes directly from raw accepted actions. Seven pairs diverge, one pair has identical histories. Only two pairs differ in terminal VP. The descriptive control timelines for matches 1600001, 1600003, and 1600004 match the replay.
- Checked witness files 25 and 29 against their game record hashes, compressed witness hashes, report digests, reported candidate bodies, and source save identities. Both bind to match 1600001 at revision 7 and the same pre-state hash. The unit, CAPTURE target `-3,11`, and original position `14,21` match.
- Checked default script and report hashes, the recorded accepted default action, and the copied default evidence in `candidate-contrast.json`. The recorded default probe is eight decisions with seven matched historical prefix actions. It selects `17,11`. There is no recorded default terminal outcome.
- Independently calculated distance reductions 6, 7, and 8 for destinations `17,12`, `17,11`, and `16,11`. The retained score matrix is `[45, 43.0625, 24.34375]`, `[90, 95.5625, 84.34375]`, and `[180, 200.5625, 204.34375]` for weights 7.5, 15, and 30. Selected routes pass final supply checks. The three routes have no eligible correction. Unvisited supply checks remain unknown.
- Checked game records 27 and 31 at revision 20. Their group rows bind match 1600003's divergent recon unit to the same CAPTURE target `16,6`.
- Read the preserved failed default-route hypothesis. The actual middle route disproves the two-route assumption. Neither the local score contrast nor the later +12 margin establishes the first move's causal contribution to terminal VP.

The numerical checks are in `review-scratch/verified.json` and `review-scratch/bindings.json`. The independent historical replay is reproducible with `node artifacts/ai-progress-objective/review-scratch/verify.mjs`. This review did not generate another game or inspect another weight or theater.

## Limits retained

Four retrospectively selected map seeds provide descriptive evidence only. The standard weight 15 lacks a matched terminal self-play control here. The three observed routes do not establish a complete candidate opportunity model or a global weight threshold. The full saved histories establish behavior and resulting control, not a single-action causal effect. The current documentation retains these limits.

## Comment review

The scoped source files `observe.mjs` and `default-decision.mjs` contain zero comments or suppressions. Deletions, restorations, reviewer reruns, MUST KILL findings, architecture sketches, application fixes, encoding offers, encodings, and unenforced constraints are all zero. No tracked source was edited.
