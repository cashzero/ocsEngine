# progressObjective first-divergence mechanisms

This post-result investigation covers every pair of the existing thirty-game
WESTERN AXIS_ATTACKS batch. It changes no weights, defaults or policy versions.
The source commit and unchanged engine build are bound by the [manifest](manifest.json).
The original thirty-game results remain a separate cohort. This run plays two
separately registered continuation tails, not additional initial-state matches.

The [analysis protocol](protocol.md) selects the first unequal accepted action
of each of the fifteen pairs, without using outcomes to choose cases or cutoffs.
All fifteen cases are supported same-unit, same-objective moves. None are excluded.
The [analysis](analyze.mjs) replays all 25,856 accepted actions of all thirty saves,
checks both common-prefix hashes, legal alternatives and all thirty final hashes,
and reproduces the previously recorded worst-pair observation.

The [results](results.json) retain every route, score component, target-control
change, terminal objective contribution, final moved-piece state and input hash.
All fifteen first divergent actors are axis. All observed intents are CAPTURE
or ASSAULT. This is a descriptive property of this batch, not role-general evidence.
Every 30 route progresses farther and has a worse sum of non-progress score terms.
Fourteen have a worse exposure term. The eight positive, four zero and three
negative paired outcomes all contain more-progress choices. Therefore the binary
more-progress indicator has no variation with which to distinguish these signs.
This does not test or disprove every quantitative progress-based predictor.

The exposure term is a heuristic threat shortfall, not a casualty probability.
Comparing selected total scores across different weights is invalid. Reweighting
the retained terms of the two observed routes puts their conditional switch
weights between 15.1007 and 28.6406. This is not full candidate enumeration or a
new policy query. Capture priority, legal checks and unobserved alternatives still
matter. No cutoff is fitted to outcome signs.

The target's terminal holder differs in three pairs and is unchanged in twelve.
All three changed targets favor the candidate-axis trajectory. Their contributions
to paired margin sum to +12, and other objectives sum to +5, reconciling the
fifteen paired margins' sum of +17. These are terminal accounting terms, not early
predictors or isolated first-action effects. In pair 1800016, the target contributes
+4 but other objectives contribute -9, leaving -5 overall. The eight pairs where
both paths eventually gain the target include three earlier, three later and two
same-turn first acquisitions under 30. The [prefix check](prefix-control-check.json)
confirms every target remains allied throughout its common prefix, so the observed
first suffix acquisitions are first full-history acquisitions. Its [script](verify-prefixes.mjs)
replays those prefixes. Game-turn bins do not resolve action order.

The [grounding investigation](grounding.md) establishes why ai-continue.mjs cannot
be used for an exact mid-step action contrast. It intentionally resets bot memory
and replaces rules RNG. The dedicated [branch script](branch.mjs) instead replays
the original common prefix through the real policies and runner. It verifies each
of the nine accepted prefix actions and hashes, then compares the complete runner
memory maps. Only axis has an initialized entry at the fork; allied has not acted.
Equality includes allied's absence. The branch never invents an allied memory.

The [branch protocol](branch-protocol.md) registers exactly two continuations of
the already disclosed worst case. The prefix uses axis30 and allied15 in both.
At revision9 one branch calls 15 once and the other calls 30 once. Each call selects
the corresponding recorded legal route and updates its own action-associated notes.
After that call both seats use15 in both branches. Original rules RNG and seat
seeds are retained. State hash, RNG and memory are equal before the intervention.
The two move actions consume no rules draws. Later actions and draw counts diverge.

| One-decision policy | Axis VP | Allied VP | Axis margin | Axis Kill | Axis Loss |
|---|---:|---:|---:|---:|---:|
| 15 | 6 | 7 | -1 | 14 | 4 |
| 30 | 7 | 6 | +1 | 24 | 13 |

Under this particular common continuation, the 30 decision raises axis VP by one
and VP margin by two, while losing nine additional steps. VP remains the first
criterion. The whole-policy worst pair's -9 margin cannot be used to label this
move harmful in every continuation. This result does not isolate the move's effect
under the original later axis30 policy. It is one decision-policy intervention,
including its note updates, at one post-selected state and one dice realization.
It is not an arbitrary endpoint substitution or an average effect across seeds.

The [branch results](branch-results.json) bind raw saves, traces and memories by
hash. Both finish with zero errors and zero rejections, in 691 and 919 actions.
The [separate audit](audit-branches.mjs) checks file hashes, every trace action and
attempt, all 1,610 accepted actions, both final hashes, pre-memory equality,
post-fork RNG and all-cause STEP_LOST totals. Its [output](branch-audit.json) records
these values. Kill and Loss are coupled head-to-head counts, not combat-only kills.
The ordinary supply audit of the original thirty-game batch does not automatically
apply to these new continuation histories.

Restore the frozen scripts to the recorded artifact paths and use the original
thirty-game artifacts with the recorded engine build to reproduce this analysis:

```sh
node artifacts/ai-progress-objective-mechanism/analyze.mjs
node artifacts/ai-progress-objective-mechanism/branch.mjs
node artifacts/ai-progress-objective-mechanism/audit-branches.mjs
node artifacts/ai-progress-objective-mechanism/verify-prefixes.mjs
```

The [independent review](review.md) verifies source semantics, all fifteen
comparisons, continuation isolation, artifact identities and the reporting limits.
It finds no reporting blocker and zero comments in the three primary scripts.
The [delivery review](delivery-review.md) separately verifies the supplemental
prefix script, all fifteen prefixes and the final frozen copies. It finds no
blocker and zero comments or suppressions in that script.

These are run-specific scripts. Full raw traces, saves and captured memories are
kept under artifacts and are not committed. No UI or promotion gate is certified.
The original research goal is open. The next causal question remains within
progressObjective: does this route contrast behave differently when the common
later axis policy remains30? No independent VP predictor is qualified here.
