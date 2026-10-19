# Observation design cross-judge

## Scores

| Rubric criterion | Design A | Design B | Evidence and judgment |
|---|---:|---:|---|
| Passive equivalence | 4/5 | 4/5 | Both keep observation at existing execution sites and call for enabled/disabled equivalence checks. Neither has implementation evidence. The checks are essential because `src/ai/policies/heuristic.ts:1026-1082` already scores and filters in order, and repeating `explain` or scoring would change cost and could change behavior. |
| Honest data semantics | 5/5 | 5/5 | Both distinguish truncation, unvisited candidates, unobserved conditions, policy choice, and dispatch outcome. This matches `src/rules/engine.ts:149-159`, where truncation is a sentinel-based bounded result, and `src/ai/seat-runner.ts:167-193`, where alternatives are dispatched after the preferred action. |
| Small interface and ownership | 4/5 | 3/5 | Both choose a decision-local recorder. A keeps the public shape and private fact writer relatively compact. B adds more identity, coverage, branch, revision, and outcome machinery before it is needed. `src/ai/access.ts:15-37` and `seat-runner.ts` are already clear owners for query and dispatch facts. |
| VP research usefulness | 4/5 | 5/5 | Both provide candidate-level evidence and target/control joins. B is more precise about correction order, first supply survivor, distinct objective relations, and accepted-request joins. Neither supports a causal claim that removing a gate improves VP, and both correctly leave that as future research. |
| Incremental feasibility and verification | 4/5 | 3/5 | A lays out a smaller first implementation and retains explicit TODOs. B's verification list is thorough but bundles broad movement fixtures, CLI manifests, end-to-end equivalence, and control joins into an expensive acceptance surface. Neither identifies proven fixture availability; neither changes P10 status. |
| **Total** | **21/25** | **20/25** | |

## Recommendation

Use **Design A as the base**. Both candidates converge on the decision-local recorder, which fits the existing split between cached queries, policy evaluation, and dispatch. A is the easier shape to implement without turning the observer into a second policy engine. Keep its private recorder and completed report boundary.

Graft two details from Design B:

1. Preserve movement correction eligibility, the original ordered top-12 set, the actual corrected terms, and the final supply-check order as values captured where those operations already run. `movementStep` uses `.slice(0, 12)` and stops at the first supply-preserving candidate; recording those existing orders gives correct denominators without sorting or checking again.
2. Keep assigned target/purpose separate from path-crossed and destination objectives, and join outcomes only through accepted dispatch requests and the same objective/revision evidence. These distinctions support VP analysis without implying intent or causation.

## Smallest honest implementation slice

Implement query provenance and choice/fallback attribution first. `access.ts` currently discards `truncated` and `reasons`; record the existing result and cache reuse while returning the same cached action array. At the runner boundary, record the preferred action and score separately from each actual attempt, its request ID, status, and violations. A rejected first choice followed by an accepted alternative must leave the preferred score attached only to the preferred action. Include null decisions that queried before stalling. Do not add movement fields to the first report until these identities reconcile.

Then add one movement scope for the existing non-truck destination loop. Capture stay once, base terms before mutation, correction eligibility/order and applied terms, above-stay ordering, and the supply checks actually made. Mark candidates skipped by the correction cap or the first surviving candidate as not evaluated for that check. Preserve engine `truncated` and reasons; never infer an omitted candidate count or exhaustive legal-action universe.

The extra machinery to defer is B's generalized branch ledger, `NOT_APPLICABLE` state, per-decision run epoch, completion footer, full build/source manifest, broad objective-event normalization, and requirement to cover every listed movement corner case before the query/choice unit can land. Add only identity required by actual joins: a run ID and monotonic decision ordinal, candidate/query references, and real dispatch request IDs. Add richer restore identity and file completeness when their consumers are implemented. Neither phase should write a second set of mutable counters; derive counts from recorded IDs and observations.

Movement atomic score predicates and all other policy gates stay TODO with user impact and closure evidence recorded in the TODO inventory. Query coverage does not prove policy coverage. A movement slice does not prove complete decision-gate coverage, causal VP benefit, or P10 acceptance. P10 stays open.

## Grounding and limits

Source checks: `src/ai/access.ts:15-37` drops the candidate result metadata; `src/rules/engine.ts:149-159` computes truncation by requesting one sentinel beyond the budget; `src/ai/seat-runner.ts:167-193` retries alternatives and stores the final attempted action beside the original decision score; `src/ai/policies/heuristic.ts:1026-1082` captures the movement ordering and early exit described above. No source was edited and no matches or implementation checks were run for this judgment.
