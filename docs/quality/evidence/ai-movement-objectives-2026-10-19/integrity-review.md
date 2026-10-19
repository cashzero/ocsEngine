# Independent implementation review

The frozen implementation is acceptable for the bounded two-fixture descriptive analysis. I found no blocking correctness issue in replay identity, group-to-objective joins, or the available turn endpoints. This verdict does not close a product-operation gate, establish predictor quality, or validate a new policy.

The reviewed source is `scripts/ai-movement-objectives-study.mjs`, SHA-256 `2bca1ad40389c1000381d2ad981d7c487753536dc44027e3970038cd821bb00b`, at repository HEAD `d7269a7821b8feeda836de92e9eb8ceef335436a`. I did not write the source or design sketches. This is the same independent reviewer used after the recorded dispatch-capacity failure. It adds no model-diversity claim.

## Verification performed

I read the reconciled ledger design, verification plan, decision trail, full script, generated and recorded reports, four negative-control records, synthetic fallback summary, and fallback output. I checked the relevant engine sequence, reducer, lifecycle, interrupt, and objective-control writers.

I independently reran `node scripts/ai-movement-objectives-study.mjs --self-test`. It passed the own-own-opponent ordering, missing endpoint, unavailable internal boundary, initial ownership, VP formula, and accepted-alternative controls.

I independently reran the four negative CLI fixtures using their rebound summaries, the producer provenance, `dist`, and `/dev/null` as the output destination. All exited with code 1 at their intended disagreement. The unbound-byte case failed input binding. The pre-state case failed the observation hash join. The request case failed attempt request identity. The turn-owner case failed replayed event identity. Each failed before the writer.

A separate read-only Python analysis recomputed the script, engine tree, input, summary, and producer-provenance hashes. The existing engine tree equals `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`. Both stored report provenance blocks match their real inputs and frozen script. The active Node runtime and report runtime are `v26.9.0`.

That analysis also reconciled every generated and recorded group against its source observation. It checked piece, role, planning target, selected candidate, accepted request and full action, per-objective scored and improving candidate IDs, supply-preserved candidate IDs, endpoint lifecycle event and measured hash, and absence of boolean or VP outcomes on censored endpoints. All 50 generated groups and all 19 recorded groups reconciled. I did not independently rerun the complete positive fixture replays or synthetic fallback CLI. Their existing reports were inspected against source data and implementation. No new bots, games, builds, or source edits ran for this review.

## Identity and control accounting

Input and producer-provenance bytes bind to the supplied summary at script lines 315 through 320. The replay engine binds to the producer's exact NUL-separated JavaScript tree digest. The script records its own hash, the summary hash, provenance hash, and actual runtime. The recorded gzip snapshot binds separately to the producer fixture hash at line 75.

Session reconstruction matches the producer. The normal path uses the stored request. The recorded path uses the gzip fixture's snapshot and replaces both session snapshots and hashes. `replay` checks initial identity, pre-decision revision, state hash, sequence, seat binding, and actual decision owner. It submits the exact attempted action through real `session.dispatch`, so stale revisions and duplicate guards are part of the replay. It compares status, revision, events, full violations, and resulting state hash before consuming the attempt. It checks accepted action order and final state identity at lines 187 through 189.

The group join keeps local selection separate from actual acceptance at lines 198 through 203. A rejected local selection cannot inherit a different accepted request's control change. An accepted alternative in the group's candidate set retains its own path and request. Groups outside that candidate set do not inherit the decision's accepted changes.

Nested objective rows retain the deduplicated union of actual configured objectives represented by planning target, scored path, accepted path, or linked accepted control change. Planning target classification remains separate. Route candidate IDs preserve the connection to original group features. Path membership is descriptive evidence, not a statement that every guard or legal alternative succeeded.

The recorded HQ group at observation ordinal 1 preserves the only observed capture. Its target category is NONE. Accepted candidate `candidate:30`, request `bot:seat:one:1`, changes `15,4` from axis to allied at revision 80. Its objective row has scored-path, accepted-path, and accepted-control-change evidence. The global accounting records allied controlled VP from 6 to 10 and axis from 6 to 2. No assigned-target capture is claimed.

The synthetic fallback output preserves the same capture under its actual accepted alternative. Its stale selected candidate is rejected, `acceptedMatchesSelection` is false, and the change belongs to the accepted request only. `fallback-control.json` explicitly labels this constructed observation fixture. It is not evidence that the heuristic itself produced a stale request or proof of heuristic passivity.

## Endpoint proof and censoring

`horizons` matches the current resolved turn key and player, then searches for the first later opponent-owned closure. It does not substitute the next numeric slot for the opponent. The real FIRST_PLAYER choice at revision 61 therefore yields axis for `2:0`, followed by allied for `2:1`. Reaction groups are rejected by the supported own-movement contract, which matches the current observation producer's policy branch.

The source-bound endpoint proof is valid for the reviewed tree and `ADVANCE_SEQUENCE`. The reducer routes that action to `advanceSequence`. Its lifecycle and interrupt paths change pieces, weather, supply, decisions, and sequence. The only reachable map-control writer is `applyFrontControl`, which excludes configured objective hexes at `src/rules/supply/rail-cap.ts:459`. The reinforcement placement writer in `lifecycle.ts:378` belongs to explicit placement actions and is not a lifecycle hook. Movement, combat advance, sea entry, and air entry have other writers, but are not this action's dispatch path. The compiled `dist` files contain the corresponding writers and bind to the checked full tree hash.

The script therefore uses the measured post-dispatch holder set for objective outcomes at internal CLEAN_UP exits without inventing an intermediate GameState hash. It keeps the lifecycle event identity separate from the measured snapshot identity. It also asserts objective holder invariance on this action. Another engine tree or another action kind gives UNAVAILABLE_INTERNAL_BOUNDARY, so zero net changes alone do not establish the proof.

The generated report has four resolved closures with owners allied, axis, axis, allied and post-dispatch revisions 46, 61, 82, and 129. All 44 objective rows have observed own-turn endpoints. Of these, 37 have an observed subsequent opponent-turn endpoint and seven are censored because the game ends. Unique objective-window support is 16 for own-turn outcomes and nine for subsequent-opponent outcomes. There are no objective control changes.

The recorded report has 29 objective rows and no completed Player Turn. Every own-turn and after-opponent endpoint is CENSORED with reason PREFIX_ENDED and observed-through revision 108. Neither the immediate capture nor its holder at prefix EOF becomes a retained-through-turn success. Censored endpoints contain no holder, held flag, acquisition flag, loss flag, or completed-horizon VP delta.

The two fixtures contain 69 groups, of which 29 have configured objective planning targets. The additional objective rows describe paths and control changes without changing that denominator. The only supply-exhausted group has a nonobjective planning target. This unit supports no same-objective supply-exhaustion outcome comparison or causal VP conclusion.

## Comment and decision-trail audit

The scoped script contains no comments, commented-out code, or lint/type suppressions. Its shebang is executable metadata. The comment audit proposes zero deletions and no MUST KILL targets. No file was edited for this audit.

The decision trail preserves the capacity failure, the unsuccessful independent design runner, the parent-authored sequential sketches, the independent design corrections, and the implementation review remaining open. Its incorrect initial count of 23 recorded objective rows is explicitly corrected to 29 in the next row. That correction agrees with the actual report. The trail does not present the sequential exploration as independent agreement.

There are no required source corrections from this review. Future builds need a new source proof before their internal sequence endpoints can be observed. Reports remain descriptive evidence from these two fixtures, with the synthetic fallback control kept separately labelled.
