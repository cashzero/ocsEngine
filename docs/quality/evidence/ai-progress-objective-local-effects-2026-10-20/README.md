# progressObjective local effects under the original continuation

This exploratory study keeps the existing fifteen WESTERN AXIS_ATTACKS states,
first-divergence choices and original rules/seat seeds. Its source commit is
ed7e706d45c5a2ea7a93dfc805319153ca28636c. The unchanged engine tree digest is
4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a.
The [registration](registration.json) freezes inputs, scripts and three features
before the new continuation outcomes. Existing full-policy outcomes and route
features had already been inspected. This is not an untouched evaluation cohort.

The [protocol](protocol.md) schedules fifteen one-decision15 counterfactuals and
one full factual30 reproduction, plus fourteen short factual prefix checks.
The original thirty-game cohort is unchanged. Each counterfactual starts with
original axis30/allied15, calls15 only at the fixed first divergence, then returns
to original axis30/allied15. It retains the action-associated memory updates.
Both pre-intervention memory maps, absent entries, state hash and rules RNG must
match the factual control. No arbitrary action is substituted after deciding.

The [worker](run-case.mjs) reconstructs every prefix through real policy calls
and checks accepted actions and hashes. The [suite](run-suite.py) requires the
pilot's complete factual history and final hash to match the original save before
starting the remaining fourteen cases, with four workers. Each generated history
must have no errors or rejected actions and must replay to its recorded final hash.
The remaining factual terminal outcomes reuse the frozen, previously replayed
original odd-match saves and summary. Short control histories are not terminal
results. No failed or unsupported case can be dropped from full-batch reporting.

The [scorer](score.py) targets factual30 axis margin minus the one-decision15
counterfactual margin. This differs from the original exchanged-seat whole-policy
pair margin. It separately compares added objective-value-scaled progress, added
non-progress cost per added scaled progress, and added exposure cost per added
scaled progress. Each is a one-variable ridge with penalty1 and an intercept.
Leave-one-seed-out fitting and scaling use only fourteen training rows. The zero
and training-mean baselines retain the same fifteen folds. MAE is primary, MSE
secondary. No signs, penalties, cutoffs or features are selected after outcomes.

All fifteen counterfactuals finished with zero errors or rejections. They replay
13,687 accepted actions to their exact final hashes. The full factual pilot adds
808 actions and fourteen short factual controls add363, totaling14,858 generated
and replayed actions. All15 new fork actions, scores and retained terms match the
corresponding prior route observations. The [results](results.json) retain all
fifteen local effects and every held-out prediction. The [manifest](manifest.json)
contains every case result and binds saves, traces and memory captures by hash.

| Result | Factual first30 | One-time first15 |
|---|---:|---:|
| Total axis VP | 152 | 153 |
| Axis Kill, all-cause steps | 445 | 405 |
| Axis Loss, all-cause steps | 175 | 180 |

Factual30 minus the one15 intervention has four positive, six zero and five
negative margin effects. Their sum is-2 and mean is-0.1333, ranging from-12 to+8.
The one-point total axisVP loss takes priority over the observed Kill/Loss gains.
These totals describe the recorded cases and do not establish an average over
other dice realizations or unseen states. Head-to-head Kill and Loss are coupled.

| Held-out-seed predictor of local margin effect | MAE | MSE |
|---|---:|---:|
| Zero | 4.4000 | 36.5333 |
| Training mean | 4.7619 | 41.9184 |
| Added scaled progress | 4.9989 | 45.5750 |
| Non-progress cost per added scaled progress | 5.0720 | 42.0673 |
| Exposure cost per added scaled progress | 4.9673 | 45.9480 |

All three candidate features lose to zero under both reported errors. The zero
baseline is also consistent with the common pre-decision state having zero VP
difference. These results do not support adopting any of these three features
as an action reward or as a qualified whole-policy improvement predictor. They
do not establish that every progress-related feature is useless.

At the already selected worst case, both lateraxis30 outcomes are axis4/allied9,
with axisKill13/Loss24. The previous later15 pilot instead gave axis6/allied7 for
the15 fork and axis7/allied6 for the30 fork. The fork memory capture for each weight
is byte-identical across the two designs. The conditional30-versus15 margin effect
is therefore0 under later30 and+2 under later15 at this particular original seed.
No continuation is selected retrospectively to claim an improved average effect.

Four isolated [scorer controls](scorer-controls.json), run by [check-scorer.py](check-scorer.py),
prove rejection of a wrong case identity, victory values inconsistent with the raw
snapshot, a false memory-equality flag, and unequal actual pre-memory payloads
even when the changed payload hash is updated consistently. Each fails at its
named assertion. The temporary overlays do not mutate authoritative inputs/results.

The [pilot inspection](pilot-inspection.json) is a separate post-result descriptive
case produced by [its script](inspect-pilot.mjs). Both pilot histories have 808
actions, with different paths only at indices9 and131. Terminal states differ only
in mapState.revision,1336 versus1334. Board control, piece states, RNG and victory
are identical. Full state hashes are different. This finding is not a fourth
prediction feature or proof that other intermediate states are equivalent.

Restore these run-specific frozen scripts at their recorded artifact paths with
the original thirty-game inputs and recorded engine build to reproduce the run:

```sh
python3 -u artifacts/ai-progress-objective-original-continuation/run-suite.py
node artifacts/ai-progress-objective-original-continuation/inspect-pilot.mjs
python3 artifacts/ai-progress-objective-original-continuation/check-scorer.py
```

The suite refuses to overwrite a completed case. Existing results should be
analyzed with score.py rather than restarting the suite. Full saves, traces and
memory captures stay in ignored artifacts. No ordinary-supply audit, UI acceptance
or promotion status is inherited by these new histories.

The [independent review](review.md) verifies source and memory semantics, all
fifteen outcomes, thirty actual fork score breakdowns,14,858 trace/action rows,
thirty snapshot hashes and all75 held-out predictions. It finds no reporting
blocker and zero comments or suppressions in the five scripts. It does not repeat
the workers' full-history replay or qualify a predictor.

This study estimates local decision-policy effects under one later policy and
one original dice realization per existing seed. It does not qualify a predictor
of whole-policy VP improvement, identify an average across dice streams, or supply
independent cross-family validation. The original research goal remains open.
