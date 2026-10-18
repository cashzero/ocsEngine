# VP metric pilot input inventory

Boundary: read existing headless match saves, traces and summaries. No new matches were run for this inventory. This record does not change product-operation acceptance rows.

## Inputs and expected result

Repository base `5e7dea2`. The selected historical attack-engagement batches are `v79-baseline-wide`, `v80g-wide`, `v80j-wide` and `v80q-wide` under the ignored `ai-truck-shuttle` worktree artifacts. Each has ten games on each of TEMPERATE_INLAND and EASTERN_EUROPE, with paired seats. The corresponding development history is [assault planning research](../ai-assault-v81-development-2026-10-17/README.md).

The pilot selects 80 existing games on ten map seeds, comprising standard self-play and three related variants. It will extract observations through Turn 4 and compare candidate changes against standard self-play on the same initial state and role. Historical outcomes were already examined in strategy research; this is exploration, not independent validation. The frozen v81 engine is the replay engine under examination. Successful replay hashes must be verified before numerical prediction results are reported.

Expected inventory evidence: all selected saves and traces exist, and actual scenario contents agree with their documented scope. [inventory.json](inventory.json) records the manifest, save SHA-256 hashes, initial and final hashes, seeds, aircraft counts and accepted air missions.

## Observed result

- All 80 selected saves and traces exist. No new bot matches were run.
- All 80 initial snapshots contain aircraft, including off-map aircraft. All 80 accepted-action lists contain air missions, 634 missions in total.
- The summary options say `air=NONE` and `airTransport=NONE`. Those parameters did not remove the aircraft observed in these historical saves. The historical claim that these batches had no aircraft is disproved.
- The analysis must therefore describe its scope as attack engagements with the recorded off-map air support. Initial-state equality and per-role baseline matching remain required.
- Instrumented replay and predictive comparison were still in progress when this inventory was recorded. There is no winning metric or measured predictive improvement in this record.

The inventory read and hash pass took approximately 4.6 seconds and completed without errors. A separate replay preflight successfully matched one saved final hash. During broader extraction, two batches exposed an incorrect measurement assumption that every player has a Turn 4 Combat Segment. The trace legitimately skips some such segments. Missing observations must be represented explicitly and failed extraction batches rerun rather than excluded.

Current research methods and subsequent conclusions belong in [VP metrics](../../../ai/vp-metrics.md). The open historical scope audit is `historical-ai-air-scope` in [the TODO inventory](../../05-todo-inventory.md).
