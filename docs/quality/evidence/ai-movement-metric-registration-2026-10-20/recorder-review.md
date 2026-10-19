# Movement panel recorder review

No blocking correctness findings were found in the reviewed recorder. The frozen 80-game regeneration can proceed. This verdict covers extraction and historical identity, not prediction scores, research qualification, or a product acceptance gate.

Reviewed source HEAD is `1558390ebefb8236033db17165c60f8357e21e7a`. The current `scripts/ai-movement-panel-record.mjs` SHA256 is `66341a37f97e0abc627331c9e509ab795be73383a20cd15ad2bc2c74e7e2da92`. The engine JavaScript tree SHA256 is `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`. The cohort SHA256 is `04931eda9ff831751cebe45f9b2406f781204392981a2765a9b6e5394231f720`.

## Historical reconstruction

Read-only assertions checked all 80 source save byte hashes, canonical accepted-action hashes, action counts, and initial/final state identities against `cohort.json`. All 80 recorded seat policies and RNG seed bundles match their historical source summaries. The cohort contains 40 pairs and 65 distinct trajectory IDs. Duplicate groups contain 4, 4, 4, and 7 records. These repeated trajectories remain registered observations under different weights, not independent games.

The recorder restores the historical initial snapshot and bindings into an empty-history fixture save. Its active seat belongs to those historical bindings. Fresh runner memory begins at GT1; the runner maintains memory thereafter. Policies receive the saved scenario, configured turn limit, registered weight bytes, and the original seed belonging to each seat. Rules RNG state comes from the original snapshot. The default heuristic is bound by the engine tree hash. Accepted-action comparison includes the complete action payload and actor.

An independent rule-engine replay of the first historical save accepted all 740 recorded actions. It reached phase `COMPLETE` and terminal hash `sha256:84220ccd13512048df60504d8e7de4f6abca5a099fc4a7320b77c1d4ec7ce83b`. Final victory was Allied 12 VP and Axis 0 VP. All 321 stored early-report pre-state hashes matched replay states. Recomputed objective-control transitions and turn-closure records exactly matched the probe. This independently checks the recorded trajectory; no bot or new game was run during review.

## Measurement contract

`seat-runner.ts` publishes observations after dispatch. The recorder caches state and hash before `runner.step()`, asserts report revision/hash against that cache, and filters objective holders from that pre-step state. The replay verification above checks the actual cache identities. GT4 reports contribute no feature rows. Three completed early player turns per side are required.

All twelve definitions match `protocol.md` and `protocol-review.md`. Primary linkage checks objective membership after the path origin. Companion linkage uses its union with strict engine-distance progress toward the actual assigned configured objective. A candidate satisfying both conditions contributes once per objective and basis. One path can contribute to several distinct objectives. Filtering uses ownership at that report, while the denominator stays three times all configured objective VP.

Final supply refusals require an evaluated final check with `preserved === false`. Failed correction probes and missing final checks do not become refusals. Exhaustion requires a nonempty set of improving linked paths and an evaluated refusal for every member. An untested improving route prevents exhaustion. Budget omissions require the exact `CORRECTION_BUDGET` status reason.

Retained-score comparisons use each group's own stay score. Score-blocked windows clear when any observed linked candidate beats stay. Crowding and exposure crossings remove the sum of the named terms from both candidate and stay, use the strict positive post-removal boundary, and retain unrelated safety terms. Four assertions against the actual recorder crossing function covered repeated named terms, a stay exposure penalty that prevents a false crossing, exact zero after removal, and exclusion of an already-improving candidate.

Counts remain numeric counts. Window booleans are accumulated once per player/objective/gameTurn. There is no accidental boolean conversion of refusal, exhaustion, or budget counts. The first probe's configured objective total is 12 VP, giving denominator 36 for each player. Counts can exceed one after normalization and do not represent probabilities.

## Actual artifact checks

All 189 compact group rows reconstruct the probe's 12 windows and every reported feature value exactly. Group and report totals agree with their stored diagnostics. Each recorded group-objective holder differs from the observed player.

The gzip witness bytes match SHA256 `edf1ba9ad56125d73c47f691c21dcca154f57a64a72cfcdd3099bd162169803e`. Its full report matches SHA256 `ec6e2cb5812e76b2011d9f39f09679b62267fe295f5357e983aafcc275c08dbb`. Independent extraction of that report at replay revision 7 matches its compact row exactly. The assigned objective is `-3,11`, initially held by Allied while Axis decides. There are 89 approach-linked scored candidates, 88 improving candidates, zero path-entry candidates, zero actual refusals, two correction-budget omissions, and no exhaustion or crossing witness. All movement candidate IDs and semantic action payloads within that group are distinct.

The initial probe records 845 early queries, 16 truncated queries, and 321 early reports. Its full candidate payloads are not archived beyond the first witness. Consequently the remaining groups are checked through their retained aggregates and the recorder's reviewed extraction path, not independently re-extracted full reports. This is the protocol's declared compact measurement boundary.

## Batch conditions and limits

The initial probe used recorder SHA256 `794c1cacb184211139a5995f9c48585942b8898d73b15e29d2f9fd7abb1ea46a`, which differs from the current code hash. `decisions.tsv` records the subsequent diagnostic support counters and moving recorder-hash capture to process start. The current code includes both changes. No bot regeneration under the current hash was performed by this review. The initial probe therefore establishes compatibility of its historical policy trajectory, rather than execution evidence for the final recorder bytes.

All final 80 records must use the one current recorder hash and one unchanged engine tree hash. Verify those identities across outputs before scoring. The engine tree is hashed at completion, so the build directory must remain unchanged throughout the batch. Every game's own trajectory assertions remain mandatory. Any mismatch stops scoring; the first probe does not waive later checks. No predictive fit or predictive score was calculated in this review.

## Comment audit

The scoped recorder contains no source comments or suppressions requiring deletion. Touched source files are none. Comment deletion count is zero. `MUST KILL` flags are none. Protocol documents are the explicit specification and review record, not source comments. No nested agents, builds, bots, or new games were used. Only this review artifact was written.

The Prove It Works principle changed this review from accepting the probe's verification flags to independently replaying its 740 historical actions, checking pre-state hashes, and recomputing the actual witness and compact aggregates.
