# Cross-policy movement metric comparison

This run measures whether early movement diagnostics predict a variant's final
VP margin on different seeds. It is retrospective exploration of selected P8
families, not independent confirmation, a policy promotion or product UI acceptance.

The source commit is `97e6e04`. The [registration checkpoint](../ai-movement-metric-registration-2026-10-20/README.md)
contains the frozen protocol, complete cohort and independent tool reviews.
Five families, ten variants and four shared seed pairs produce 80 saved games,
65 distinct accepted trajectories and 40 dependent predictions.
There are no new seeds and no Mediterranean games.

The four-worker regeneration batch completed in 1,374.49 seconds. All 80 processes
returned zero with empty stderr. Every one of 68,207 accepted actions matched its
historical sequence. Independent rule replay matched each action's events and
state hash; full histories, action counts and final hashes matched. Recorder,
engine, cohort and analysis source identities remained frozen. This timing is a
batch observation, not a performance comparison. Initial probe game zero was run
before the batch and is not independent evidence.

The measurement contains 28,949 pre-GT4 reports, 14,486 movement groups, 80,521
queries and 1,345 truncated queries. Path entry produces only one objective window
with three scored candidates. Approach linking produces 984 windows. Counts are
dependent observations, not independent policy trials or legal opportunity totals.

The frozen analysis command is recorded in [manifest.json](manifest.json).
It was run against the complete batch after all 80 regeneration records existed.
Raw game measurements, witnesses and the full 859,174-byte analysis remain in
`artifacts/ai-movement-metric-panel/`. Their hashes bind the committed summaries.
Restoring the historical source saves and frozen registration inputs is necessary
to reproduce the original regeneration command:

```sh
node scripts/ai-movement-panel-record.mjs \
  --cohort artifacts/ai-movement-metric-panel/cohort.json \
  --game 0 --engine dist \
  --out artifacts/ai-movement-metric-panel/games/game-0.json
```

Use game indices 0 through 79 to regenerate the complete cohort. Run the manifest's
comparison command only against the complete cohort and frozen sources.

Direct historical M2 has the lowest MSE in this selected subset, 7.686068.
Zero predicts at 10.662500; fitted VP is 12.521409. The best new diagnostic alone,
approach score blocking, is 9.280461. Its VP-additive version is 10.851431 and misses
zero. The standalone diagnostic beats zero on Temperate but loses on Eastern
Europe. Its coefficients reverse sign in one full split. These results do not
reverse the broader P8a findings or establish reward or prediction qualification.

The [summary](summary.json) preserves all 30 models, all 12 diagnostic additions,
support, MSE, MAE and bias overall and by split, family and climate.
[Panel inputs](panel.json) and [predictions](predictions.json) preserve numerical
inputs and all predictions without the large raw reports.
[Counterexamples](counterexamples.json) retain largest errors and identical-action
trajectories whose diagnostic values change with weights. The latter show that
the counts can change without changing accepted behavior or final VP.

The [independent empirical review](empirical-review.md) reconstructs all raw
features and 1,200 predictions, checks save/action identities and final outcomes,
and reproduces every reported score slice. It found no numerical reporting
blocker. Qualification remains `NOT_ESTABLISHED`. The original research goal
continues through separate metric refinement and independent evidence.
