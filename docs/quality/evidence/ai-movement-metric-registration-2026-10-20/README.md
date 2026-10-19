# Movement mechanism metric comparison registration

This record freezes the retrospective comparison before new predictive scores.
It is a registration and tool-verification checkpoint, not a completed 80-game run
or a VP predictor qualification. The research goal remains active. The actual
definitions belong to [the owning contract](../../../ai/vp-metrics.md#跨策略移動指標比較).

## Registered experiment

[cohort.json](cohort.json) lists 40 seat-swapped pairs, 80 existing saved games,
65 distinct accepted-action trajectories, five weight families, ten variants and
four shared map seeds. Historical VP outcomes informed family selection and were
already inspected. These data cannot supply new independent confirmation.
Historical source files stay read-only under the declared artifactRoot.

[protocol.md](protocol.md) fixes the early cutoff, six path-entry diagnostics and
six assigned-objective-approach companions, objective-point normalization, paired
orientation and four seed splits. Calibration excludes both directions of the
held weight family. Every held prediction uses development features to predict
final VP on other seeds. The 40 prediction rows are dependent.

[measurement-registration.json](measurement-registration.json) binds the cohort,
protocol, recorder and engine before the 80-game batch. One earlier identity probe
preceded it. [analysis-registration-initial.json](analysis-registration-initial.json)
and [analysis-registration.json](analysis-registration.json) bind the scorer before
empirical scoring and preserve the support-output-only amendment. This amendment
adds raw-player/game/pair nonzero counts without changing fits or predictions.

All 30 models remain registered. They include zero, training mean, historical
M0/M1/M2, fitted VP, each diagnostic alone and each diagnostic added to VP.
Additional coefficients use training-population standard deviation and a sum-loss
ridge penalty of one. Intercept and VP are unpenalized. There is no p-value,
decisive interval, reward or policy-promotion gate in this exploratory comparison.

## Tool verification

Source base is 1558390. The recorder SHA256 is
66341a37f97e0abc627331c9e509ab795be73383a20cd15ad2bc2c74e7e2da92.
The scorer SHA256 is
a4a9550cfec96f1c8df431ef4cb59eb15780b53f5c2fee5559e3aaa2446f6a0d.
The runtime tree is
4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a.
Full engine/source binding is in the registration JSON.

[final-recorder-check.json](final-recorder-check.json) records one full execution
of the final recorder bytes. All 740 accepted actions, independent replay events
and per-action state hashes match the original trajectory; the game ends at its
recorded terminal hash. It records 189 early groups and 321 early reports. The
final-output size is 150,218 bytes. Process elapsed time is an execution record, not
a speed comparison. The separate initial probe used earlier recorder bytes before
support counters and process-start hash capture; it is not execution evidence for
the final source and is not counted as an independent game.

[callback-controls.json](callback-controls.json) records synthetic invocations of
the actual frozen observer callback and arithmetic helpers. Post-cutoff rows
contribute nothing, cached pre-action holders survive changed post-action holders,
already-owned objectives are excluded, and an untested improving route prevents
exhaustion. Both-side term deletion, common penalties and the strict boundary
also pass. These are supplemental callback controls, not legal-action trajectories.

[analysis-controls.json](analysis-controls.json) records four actual CLI failures.
Stale analysis source, stale protocol, mixed recorder identities and post-cutoff
group data fail at the intended disagreement. Each exits one before writing an
analysis result. The scorer self-test verifies constant columns, row-order
invariance, evaluation-data exclusion, held-family exclusion and a true synthetic
transfer signal. No full existing policy test suite or engine build was rerun for
these offline scripts.

## Independent reviews

[protocol-review.md](protocol-review.md) grounds historical memory, seat seeds,
pre-action ownership, twelve diagnostics, dependent folds and temporal limits.
It required the pre-score ridge, companion-link and climate-score clarifications.

[recorder-review.md](recorder-review.md) independently checks all 80 source save,
action and seed/policy identities. It replays the first 740 historical actions and
reconciles 321 early pre-state hashes, control changes and turn closures. It also
reconstructs all 189 compact groups, twelve windows and every probe feature, plus
the first full-report witness. It did not independently rerun the bot. Comment
findings are zero. Final 80 outputs still require their own trajectory assertions.

[statistics-review.md](statistics-review.md) independently compares 2,400 fits and
24,000 predictions with 70-digit normal-equation solutions. Maximum absolute
disagreement is 1.4211e-13. It checks all four evaluation mutations, five held-family
exclusions, twenty permutations, thirty model identities, climate scoring,
registration guards and the final support-output amendment. It reads no new
empirical prediction score. These are numerical implementation checks, not
evidence that a diagnostic predicts actual VP improvement.

[delivery-review.md](delivery-review.md) checks the owning documents, copied
bindings, probe, controls and [decision trail](decisions.tsv). It found no blocker
for this registration checkpoint. Both scripts have zero comments requiring
deletion and no suppressions. Full-batch and empirical acceptance remain open.

## Remaining acceptance and reproduction

At this registration checkpoint the complete batch is still running. No game
failure, partial batch or tool check may be reported as a completed research
result. Before scoring, require all 80 frozen outputs, one recorder/build identity,
all historical trajectories matched, and complete accepted-action counts. Then
report every registered model, actual feature support, all split/family/climate
errors and concrete failure cases in a separate immutable result record.

```sh
node scripts/ai-movement-panel-record.mjs --cohort artifacts/ai-movement-metric-panel/cohort.json --game 0 --engine dist --out artifacts/ai-movement-metric-panel/games/game-0.json
python3 scripts/ai-movement-panel-compare.py --self-test
python3 scripts/ai-movement-panel-compare.py --cohort artifacts/ai-movement-metric-panel/cohort.json --games artifacts/ai-movement-metric-panel/games --registration artifacts/ai-movement-metric-panel/analysis-registration.json --out artifacts/ai-movement-metric-panel/results
```

Run each registered game index 0 through 79 with the same source, engine and cohort.
Raw outputs, gzip witnesses and runtime logs stay ignored under artifacts. Only
the first relevant full report per game is archived. Other reports retain hashes
and compact aggregates, with no claim of a complete archived candidate trace.
