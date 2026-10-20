# Assigned-target continuity and own-turn conversion

This exploratory study reuses all fifteen WESTERN attack local-decision pairs.
It adds no games, seeds, maps, weights or bot calls. The original first decision
uses progressObjective30 versus one progressObjective15 call; both then continue
with axis30/allied15. Terminal local effects and earlier movement measurements
were already seen. The twenty-four recorded next-move intents were also inspected
before the [protocol](protocol.md); their control context and the new own-turn
boundary measurements were not yet extracted. These are post-result observations.

The [registration](registration.json) binds the seventy frozen input/script files
and engine digest. The actual engine source is old-history `16ff5ec`; reachable
`edfc398` has the identical tree `92fce5c58118bf81efd7fce82ef8b2036609ee1f`.
The analysis checkout rebased to `e96b238`, which renamed the map styles to
WESTERN_EUROPE and EASTERN_EUROPE without changing AI or rule code. No new map was
generated. The frozen dist digest remains
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
The build is retained in ignored artifacts beside the study. A provenance/import
cleanup rerun reproduced every measurement row and summary exactly.

The [extractor](extract.mjs) resumes the thirty previously verified movement-exit
snapshots and replays 2,727 recorded legal actions. It stops after the exact own-turn
boundary and observed next same-unit move, or at that boundary for the six source
histories already proven to have no later same-unit MOVE_PIECE. It does not rerun
full tails merely to compute the early features. All thirty primary boundaries
exist; no missing observation is dropped.

The primary boundary is immediately after departure from CLEAN_UP for the
intervention's exact gameTurn, playerTurnIndex and phasing player. An accepted
ADVANCE_SEQUENCE can automatically skip several phases. Its outer result is not
necessarily this boundary. The initial assumption of outer-state alignment failed
before outcomes were extracted, as recorded in the [decision trail](decisions.tsv).
The extractor instead reconstructs every actual lifecycle transition, verifies
each from/to sequence, requires the entire normalized event list to equal the
actual dispatch events, and requires the final state to equal the actual dispatch
result after only normalizing the outer revision increment. Interrupt/precheck
effects that cannot be reconstructed fail this check rather than being ignored.
The measured state is taken immediately after the matching cleanup transition,
including its hooks but excluding later automatically skipped phases. It retains
the pre-dispatch revision. It is explicitly a derived internal boundary, not a
resumable accepted-action or user-decision checkpoint. The measurements bind its
hash, event identity, container hashes and reconstruction checks.

The original target is Axis-held at six of thirty handoffs, in three pairs with
both branches holding it. All fifteen paired all-objective VP-margin differences
and original-target margin-contribution differences are zero. Absolute scores are
not all zero. Scores are recomputed from actual objective control. The fixed
[scorer](score.py) aliases both direct signals to the prior zero predictions and
both one-variable ridge signals to prior trainingMean predictions. It does not
fit identical models again. Their reused MAE/MSE are 4.4000/36.5333 and
4.7619/41.9184 respectively. The [results](results.json) retain every paired value,
prediction and alias. Neither signal adds predictive information at this boundary.

Secondary observations preserve the exact next-move time and pre-action target
control. Twenty-four histories have an explicit next selected combat-to intent;
six have no subsequent same-unit move and remain CENSORED. Eleven observed moves
change target hex. Seven do so while the original target remains Allied-held;
four do so after it is Axis-held. Another six keep the target hex but change its
purpose. Two observed next moves use hunt. Changed target, changed purpose and
unobserved planning are distinct; none is automatically an error or proof of
abandonment. Control acquisition is not proof that the observed unit completed its
assignment. Recorded control changes are net observations at accepted actions or
reconstructed lifecycle transitions, not every transient hook effect.

These heterogeneous next-move horizons are excluded from prediction. In factual
pair1800002 the next move is at index86, before the primary handoff at index90.
Thus next move means subsequent to movement exit, not necessarily after handoff.
Other observations occur in later turns. No later move does not mean no target
reassignment, and different move times cannot establish equal opportunity.

The [snapshot checker](check-extraction.mjs) parses all thirty raw derived snapshots,
checks their hashes, target identities, event/sequence/revision, and independently
sums objective scores from hex control. Three altered copies fail named assertions
for wrong original target, wrong current VP and outer-dispatch revision substituted
for internal revision. The real inputs are unchanged. Its [checks](extraction-checks.json)
bind the raw snapshot file by SHA-256. This checker reads snapshots rather than
independently replaying all histories. The [independent review](final-review.md)
additionally replays 171 accepted actions across five selected containers, checks
complete event/state reconstruction and captured hashes, and reconstructs three
next-goal contexts. It also checks all thirty snapshots, registered hashes,
censoring and all aliases/errors.

Raw snapshots, saves, traces and the frozen engine remain ignored artifacts.
Restore the registered files at their recorded paths to rerun the run-specific
tools without any bot match. The scripts import repository `dist/index.js`.
Repository `dist/` must therefore contain the retained frozen engine and match
the registered digest before invocation; keeping the copy only in the study's
`engine/` directory does not redirect those imports. Use an isolated checkout
when its current build differs rather than overwriting another active run's build.

```sh
node artifacts/ai-progress-objective-goal-continuity/extract.mjs
node artifacts/ai-progress-objective-goal-continuity/check-extraction.mjs
python3 artifacts/ai-progress-objective-goal-continuity/score.py
```

The [topic document](../../../ai/vp-metrics.md#progressobjective-的目標延續與回合轉換)
owns the current interpretation. This study does not change default15, policy
version, supply-safety audits, UI acceptance or promotion status. The research goal
remains open. Subsequent exploration stays within progressObjective's same-target
executable opportunities and actual choices; these observations neither support
another identical delayed measurement nor establish that changing targets harms VP.
