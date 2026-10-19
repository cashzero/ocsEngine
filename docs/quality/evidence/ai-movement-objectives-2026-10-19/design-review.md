# Independent design review

Choose the ledger after the corrections below. It keeps future outcome lookup separate from replay mutation and fits these 159 dispatches. The current ledger sketch is not ready to implement because its endpoint wording still permits an incorrect intermediate-turn label.

I wrote neither sketch and have made no source changes. I inspected both sequential sketches, `task.md`, `rubric.md`, `../verification-plan.md`, the grounding explanation, and the cited engine code. No new game, test, build, or agent ran for this review. This is one independent review of two parent-authored sketches, not two independently produced designs.

## Six-axis comparison

Scores use the rubric's zero-to-three scale and grade the written sketches before corrections.

| Axis | Streaming | Ledger |
| --- | --- | --- |
| 1. Replay identity | 2. It requires validated dispatches but leaves the session guard implementation implicit. | 3. Real session dispatch, exact recorded results, pre-state joins, and accepted history define a complete verification chain. |
| 2. Turn ownership and endpoints | 2. It explicitly refuses ambiguous internal boundaries but needs a concrete acceptance control. | 2. Owners and censored EOF are sound. A measured post-dispatch state does not establish an exact internal endpoint. |
| 3. Distinct target and action identities | 3. Local selection, accepted alternatives, and failed-choice witnesses remain separate. | 2. The global ledger preserves the incidental capture. The phrase "Only that candidate's accepted action" can discard an accepted alternative's path from its group. |
| 4. Small command and concepts | 2. One command hides a more complicated mutable cohort lifecycle. | 3. One command owns replay. Immutable ledger lookup avoids cohort update ordering. |
| 5. Falsification controls | 2. The named controls cover EOF and request joins, but an internal boundary control remains unspecified. | 2. The shared plan checks real captures and joins. It still needs explicit internal-boundary and consecutive-own-turn controls. |
| 6. Bounded descriptive scope | 3. It makes no policy or predictor claim. | 3. It makes no policy or predictor claim and rejects unsupported observation branches explicitly. |

The totals are 14 for streaming and 15 for the ledger. The ledger's advantage is simpler ownership of state and outcome derivation. The corrections do not require a different architecture.

## Required corrections

1. Preserve the streaming sketch's honest internal-boundary rule. A `SEQUENCE_ADVANCED` CLEAN_UP exit identifies a completed turn and its owner. Its enclosing dispatch's final snapshot can be after later lifecycle work, another turn, or another requested boundary. The final snapshot hash cannot be presented as the exact state at every event within that dispatch. `src/rules/kernel/reducer.ts:73` loops through empty steps, and `src/rules/lifecycle/lifecycle.ts:185` emits sequence events before subsequent lifecycle hooks. A boundary event therefore does not itself contain a verified objective holder snapshot.

   For this bounded unit, explicitly support only endpoints whose holders are established at the post-dispatch observation boundary. Reject or mark an internal endpoint unavailable if the dispatch crosses additional relevant boundaries or changes objective control and the location of that change relative to the endpoint is unknown. An unchanged before/after holder set alone does not prove no intermediate capture and recapture. Keep the boundary event identity separate from the measured snapshot identity. The actual generated fixture has zero objective deltas and the recorded fixture has no completed turns, but that evidence does not remove the general ambiguity. Add a focused synthetic control with two closures and an intervening control change inside one dispatch. It must never yield two supposedly exact endpoint holders from one final snapshot by inference.

2. Record the actual accepted candidate independently from `selectedCandidateId`. Resolve every attempt's candidate ID to its full action and join the accepted attempt by request ID. If the accepted candidate belongs to this group, retain its path objective identities and immediate capture witnesses even if the local selected candidate was rejected. If the accepted candidate belongs to a different group, preserve that relationship explicitly. The rejected local selection receives no capture attribution. The existing failed-choice control must verify both halves. Rejecting the whole unsupported retry fixture is an acceptable explicit limitation, but silently dropping the accepted alternative's path is not.

3. Add a required own-own-opponent lifecycle control. The first completed own turn closes the current own-turn horizon. The first later completed opponent turn closes retention. The intervening own turn cannot substitute for the opponent or reopen the current-turn acquisition window. Also retain the real FIRST_PLAYER check at revision 61 and explicit reaction rejection for movement-group schema validation. The current policy only emits these groups in own MOVEMENT and EXPLOITATION segments at `src/ai/policies/heuristic.ts:1480`, so this bounded schema rule is supported by source rather than a silent reduction of the supplied data.

4. Define each reported VP quantity before implementation. Own-controlled objective VP change is `points * (ownAtEndpoint - ownAtObservation)`. A margin change requires its own explicit neutral, own, and opponent value function. Neither is gross VP gained or whole-game VP. Keep acquisition, already-held control, loss, and recapture distinguishable. A censored horizon has no completed-horizon boolean or numeric VP change, even if the objective is currently held.

5. Adopt the proposed nested `objectiveRows` union. Keep one outer row per movement group and derive its objective IDs from assigned target, scored paths after their origin, the group's actual accepted path, and control changes linked to that group's accepted dispatch. Deduplicate objective hex IDs within the group. Use separate evidence-basis flags so a scored-path objective never becomes an assigned target by inference. Retain supporting candidate IDs and the accepted request ID, as applicable. Derive scored, improving, final-supply-checked, and supply-preserved route counts for each objective from those candidate identities. The counts can overlap and describe visited routes, not legal opportunity or independent trials.

   Actual-delta membership requires the accepted candidate to belong to this group. Do not copy a decision's accepted control change into every group considered in that decision. Keep unrelated accepted changes in the global ledger. The recorded HQ null-target group's accepted path and delta therefore create an objective row for `15,4` with its real group features. Its assigned-target category remains NONE. These nested rows can share endpoints from the immutable ledger, so the addition preserves one owner for replay and outcome logic. Objective-row support and group support need distinct denominators because one group can expose several objectives.

## Capture evidence and scope

The written real-artifact acceptance preserves the global capture. The nested objective-row correction also preserves its feature join. Both views must retain the recorded dispatch-1 change at `15,4` from axis to allied. That accepted HQ move belongs to a group with no assigned target. Its path capture is observed evidence, while its assigned-target outcome remains not applicable. This capture cannot be reclassified as success for a different group's planning target, and the prefix's final holder cannot establish retention through either unobserved turn boundary.

Keep all 69 group rows. Report the 29 objective-target rows separately from nonobjective and absent targets. Do not compute an objective outcome rate over all groups or an observed-retention rate that includes censored horizons. Preserve distinct objective-window support because several group rows share one future outcome. The sole supply-exhausted group has a nonobjective target, so these fixtures cannot support a same-objective supply-exhaustion outcome comparison.

After these five corrections appear in the design and acceptance plan, the ledger is approved for production implementation. This verdict does not approve a completed implementation or any product-operation gate.
