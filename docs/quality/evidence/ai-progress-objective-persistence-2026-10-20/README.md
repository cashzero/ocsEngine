# progressObjective persistence at movement exit

This post-result study reuses all fifteen local-decision comparisons from the
original-policy continuation experiment. It adds no games, seeds, maps, weights
or bot policy calls. The source commit is `36e24ccf3af6d9dd83810bbcf9d360f93bc8231b`.
The [registration](registration.json) freezes the engine digest, thirty source
histories, previous results, rule sources, boundary and scripts before extracting
new measurements. Terminal effects and previous route features were already seen.

The [protocol](protocol.md) fixes the boundary before the first accepted action
that leaves the intervention's MOVEMENT/MOVEMENT segment at the same gameTurn,
playerTurnIndex and phasing player. The [extractor](extract.mjs) verifies the
SEQUENCE_ADVANCED event and exact pre-action sequence. It measures the pre-action
snapshot, before lifecycle front-control changes or later segment effects. Each
pair is aligned by that rule boundary, never by action index. Current VP comes
from calculateVictory on objective control. A missing or off-map unit is not a
zero distance. No unavailable row is discarded.

All thirty boundaries exist, with all fifteen distances available. The extractor
replays 9,878 accepted actions to the required observations. It stops after the
boundary and next move of the same unit, except six histories with no later move,
which are replayed through their actual final state and marked CENSORED. Full
histories are not replayed again merely to compute early features. The
[measurements](measurements.json) bind all source saves and record actual state
hashes, sequences, distances, scores, control, exit events and observation coverage.

All thirty moved units remain at their first divergent move's endpoint when the
current movement segment ends. All fifteen retained scaled-progress differences
therefore equal the prior first-action progress feature within 1e-9. The planner
adds a processed unit to notes.done and filters done units for the rest of that
movement step, consistent with the observed persistence. The earlier premise
that the first-step difference might disappear before this boundary is not
supported. Waiting until this boundary supplies no new geometry feature here.

All fifteen paired current-VP-margin differences are zero. Absolute scores are
not zero. The target is still allied in every measured arm. Cached state.victory
scores disagree with recomputed objective scores in 28 of 30 histories, which is why
the extractor must calculate the current scores. Cached victory is refreshed by
lifecycle operations and is not the current-control measurement contract.

The [scorer](score.py) follows the predeclared identity rule. Retained progress
aliases the prior addedScaledProgress model. Direct boundaryVP aliases zero,
its training-mean residual aliases prior trainingMean, and its retained-progress
residual aliases the prior progress model. The [results](results.json) copy the
corresponding existing prediction vectors and errors instead of fitting identical
models again. Their MAE values remain 4.4000, 4.7619 and 4.9989. These are reused
references, not new validation results. The original local terminal effects still
range from -12 to +8. No new VP predictor is supported by this boundary.

Secondary observations retain their own times and are not prediction features.
Ten pairs have a subsequent move in both histories, and two have equal next
move destinations. Six individual histories are censored for no subsequent move.
These categories are not collapsed into an endpoint-equivalence claim. In all fifteen pairs,
boundary hashes differ between arms, and equal geometry does not establish equal
rules state, memory, RNG or later value.

The [boundary checker](check-extraction.mjs) separately replays 2,282 actions to
reconstruct all thirty actual boundary snapshots and exit actions. Its
[checks](extraction-checks.json) verify hashes, unit identity/location, geometric
distance, current objective scores and the metric-identity flag. Three altered
measurement controls fail at named assertions for a wrong target, wrong distance
and a genuine cached-score payload substituted as current scores. The source
histories and measured data stay unchanged. Raw boundary snapshots are kept in
ignored artifacts and bound by the recorded SHA-256, not committed.

Restore the frozen run-specific scripts at their recorded artifact paths with
the original input histories and engine build to reproduce these observations:

```sh
node artifacts/ai-progress-objective-persistence/extract.mjs
node artifacts/ai-progress-objective-persistence/check-extraction.mjs
python3 artifacts/ai-progress-objective-persistence/score.py
```

The [independent review](review.md) verifies rule semantics, all thirty boundary
snapshot hashes and actual objective-score sums, geometric identities, next-move
coverage, model aliases and errors, controls and documentation. It finds no
reporting blocker and zero comments or suppressions in the three scripts.

A movement-boundary feature becomes available after executing the segment. It
cannot be treated as a feature available before choosing the first action. This
is one post-result interval of one weight family, not independent cross-family
or whole-policy validation. No default, policy version, supply-safety audit,
product UI gate or promotion gate changes. The original research goal stays open.
