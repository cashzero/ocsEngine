# Local VP effect under different future dice

This study repeats the same fifteen WESTERN attack `progressObjective` physical
forks with one new future rules RNG state per case. Each compares one original
30 decision with one 15 decision, then restores axis30 and allied15. It runs
thirty new full eight-turn continuations and two original-dice tool controls.
All original outcomes and previous metric comparisons were known. New dice,
prediction vectors and comparisons were fixed before any new outcome. No map,
weight, policy or case was added or removed.

The source checkout is `32bb4998e569d68557bb4d9b8f3fae89503038b3`.
The retained historical engine digest is
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
No engine rebuild occurs. The [protocol](protocol.md),
[control registration](control-registration.json) and
[frozen registration](registration.json) bind all source histories, complete
fork memories, original model predictions, runner and scorer by SHA-256.
The latter also binds both complete control outputs. Scripts validate the actual
engine tree before importing it.

The [runner](../../../../scripts/ai-progress-dice-run.mjs) reconstructs every
original prefix through real policy calls and requires historical actions and
intents. It retains the same seat runner and redirects a public GameSession
proxy between completed steps. This preserves both players' real phase memory,
action counters, ordinal and revision bookkeeping. It loads both initial and
current fork snapshots with empty session action history. No private memory is
overwritten and no fresh runner with empty memory is used.

Only `rng.state` changes. The seed is the first unsigned big-endian 32 bits of
SHA256 of `progress-objective:future-dice:replicate-1:` followed by firstMatch,
passed through createRulesRng. All fifteen replacement states are distinct and
different from their original states. Past `rng.draws` and all other saved state
remain the same. Both arms begin with identical new state and complete memories.
The actual first action, intent, score, breakdown and post-call notes match their
respective historical records. The changed full state hash also changes BotRng,
but this frozen heuristic and its helpers do not consume BotRng. This statement
does not apply to other policies. Different draw consumption after branching
means corresponding battles need not use matching dice.

The [controls](control.json) use the late fork of pair 1800026 at revision 152,
including both players' phase memories. Both reproduce complete historical tail
actions, intents and terminal hashes. The 30 arm has 902 global actions and a
750-action tail. The 15 arm has 922 global actions and a 770-action tail. Their
local effect remains zero. Both controls finish before freezing and launching
the thirty new continuations.

Every new continuation finishes Game Turn 8 in COMPLETE with zero rejected
actions and zero errors. New tails contain 26,036 accepted actions and consume
7,712 future rules draws. Including regenerated prefixes and controls, the runner
accepts 28,576 actions. Every dispatch is independently applied to a separate
rules state and checked against complete events and the session hash. The
thirty new branch durations range from 62.505 to 139.541 seconds, totaling
2,539.369 seconds across at most two workers. The two control durations total
123.532 seconds. These are per-branch elapsed times, not CPU or batch wall time.

The [results](results.json) preserve all fifteen old and new effects, margins,
draw counts, prediction vectors and errors. An effect is the 30 arm's final axis
VP margin minus the single15 arm's margin.

| Original effect | New negative | New zero | New positive |
|---|---:|---:|---:|
| Negative | 1 | 2 | 2 |
| Zero | 2 | 2 | 2 |
| Positive | 0 | 0 | 4 |

Exact sign agreement including zero is 7/15. Direction agrees in 5/7 cases
where both effects are nonzero. Four effects are numerically unchanged. All four
original positives stay positive, while only one of five original negatives
stays negative. Pearson correlation is 0.013368 and tie-aware Spearman is
0.115773. Absolute effect change has mean 9.466667, median 6 and range 0 to 38.
The old mean is -0.133333 with range -12 to 8. The new mean is 7.2 with range
-10 to 30. The pooled two-realization mean is 3.533333.

The [scorer](../../../../scripts/ai-progress-dice-score.py) transfers unchanged
original leave-case-out predictions. It does not refit, select a sign or tune a
cutoff. Legal-strength predictions retain the original-dice early path feature,
not a recomputed new-path feature. This evaluates transfer across future dice
within the same physical cases. It does not provide independent map or policy
validation. Prediction errors use margin points and squared margin points.

| Frozen prediction | Old MAE | New MAE | New MSE |
|---|---:|---:|---:|
| Zero | 4.4000 | 10.1333 | 193.0667 |
| Original training mean | 4.7619 | 10.3429 | 195.3279 |
| Scaled progress | 4.9989 | 10.5405 | 199.7324 |
| Other cost per scaled progress | 5.0720 | 11.2943 | 213.4296 |
| Exposure cost per scaled progress | 4.9673 | 10.5405 | 198.9756 |
| Offered legal attack strength | 5.3395 | 9.9985 | 180.0336 |
| Original terminal effect | 0.0000 | 9.4667 | 229.6000 |

Legal strength gains about 1.3% MAE over zero on the new stream but loses on the
old stream. It is not adopted. The original terminal effect has lower new MAE
but higher MSE and requires a full previous continuation. Its old zero error
uses the answer itself and is not a prediction result. Neither an average sharing
its own outcome nor choosing whichever realization favors a model is validation.

Two realizations per fixed physical case do not establish expected action value,
population reliability, a noise ceiling, variance decomposition or a p-value.
The changed outcomes include policy responses to different battle outcomes.
This study supports measuring labels across fixed future streams before judging
an action or selecting another proxy. It does not show that all previous metric
failures are caused by dice, qualify a new predictor or promote a strategy.

The [checker](../../../../scripts/ai-progress-dice-check.mjs) separately replays
358 shared prefix actions and all 27,556 control and new tail actions. It matches
complete canonical terminal saves and hashes, recomputes VP directly from
objective control, checks all-cause STEP_LOST, memories, fork decisions, actual
draw counts, model errors and descriptive statistics. The initial check compared
raw array order across serialization and failed on sorted hexControl entries.
Only this checker comparison changed to complete canonical-save equality.
The runner, frozen inputs and all outcomes stayed unchanged. The successful
[check record](check.json) rejects four altered-copy controls for a non-RNG fork
mutation, missing memory, changed memory, and jointly fabricated VP, margin and
paired effect.
No tail was rerun or replaced.

Restore the registered raw inputs and retained engine, then recompute analysis
and checks with these commands.

```sh
python3 scripts/ai-progress-dice-score.py
node scripts/ai-progress-dice-check.mjs
```

To repeat full continuations, use a fresh output root with this protocol. Run
the [registration script](../../../../scripts/ai-progress-dice-register.mjs) in
control mode, run case 1800026 with the runner in control mode, freeze the new
registration, then run the [batch](../../../../scripts/ai-progress-dice-batch.py).
The batch refuses existing case output directories. Do not overwrite this
completed registration. Raw full saves, traces, memories and failed-check logs
remain ignored under artifacts/ai-progress-dice-reproducibility/. The small
records bind those files by hash. The [review](review.md) and
[decision trail](decisions.tsv) record verification and decisions. The
[topic document](../../../ai/vp-metrics.md#progressobjective-局部效果的跨骰流重現性)
owns the current research interpretation. Default 15, policy 85, supply status,
promotion gates and product-operation acceptance remain unchanged. The goal is open.
