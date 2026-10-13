# VP promotion evidence

The report adopts heuristic@35 as the standard VP strategy after its fixed independent replication.
All AI/logistics and UI operations retain their separately recorded incomplete status.
The acceptance authority for product UI is still `docs/quality/03-product-operation-verification-plan.md`;
these bot GameplaySession battles do not close UI operations.

Eligible theaters: TEMPERATE_INLAND and EASTERN_EUROPE. Retired Mediterranean development runs
are excluded; no new Mediterranean battles are requested or run after the user correction.

`results.json` summarizes only completed groups whose legal completion, replay and supply audit agree.
`runs.json.gz` contains their full summary records, seeds and attribution results. `advanceSupply` verifies every forecasted reinforcement against the real reducer.
`cases*.json.gz` and `weight-cases*.json.gz` preserve recorded positions and complete continuations;
`opponentVersion` distinguishes fixed v19 opposition from continuations changing both policies.
Individual action trace/feed and optional fuel/hedgehog commitment guards are measured; these
are not a claim that every logistics decision is optimal.

The development weight variants deliberately share seeds for comparison. They are not independent
promotion evidence. Validation groups use new seeds frozen in the report before execution. Statistical
acceptance requires both engagement totals positive and the paired mean minus 2.1 times SE above zero;
passing this statistic alone does not complete promotion. v35's first 64-game validation failed the interval criterion. The separately preregistered, fixed 256-game replication
uses wholly new seeds and is judged alone; the first batch is not pooled or relabeled as passing.

Sources in `sources/v*-{policy,analysis,weights}.ts.gz` reconstruct each frozen candidate on commit
`0e4c9c3`. Use that commit's unchanged source for the other modules, install the repository dependencies,
replace these files (plus `decisions` and `relocation-impact` for v32 or later) with the selected snapshot and run `npm run build`. Build a separate v19
baseline from unchanged commit `0e4c9c3`, then run the recorded `scripts/ai-match.mjs` options using
`--axis heuristic@<baseline-dist> --swap --trace`; both policies use the candidate's shared engine.
`weightConfigurations` in results records every development override. Each summarized match includes
its complete configuration and seeds. Comparison policies are immutable during a group.

Logs include failed prototypes and successful checks. A failed historical log is retained as evidence,
not relabeled as passed. The report states which checks apply to the final candidate.

Source snapshot mapping:

| Snapshot label | Repository path |
| --- | --- |
| policy | src/ai/policies/heuristic.ts |
| analysis | src/ai/analysis.ts |
| weights | src/ai/policies/heuristic-weights.ts |
| decisions (v32+) | src/ai/decisions.ts |
| relocation-impact (v32+) | src/rules/supply/relocation-impact.ts |

Raw logs are stored losslessly as `.log.gz`; decompress them before comparing the original log SHA-256 in quality manifests. No log content or historical failures have been trimmed.
