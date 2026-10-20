# Original-target legal attack opportunity

This is a post-result study of all fifteen existing WESTERN attack
progressObjective single-decision pairs. It adds no match, seed, policy call,
map or weight. Both branches continue with axis30/allied15 after the known
single15 intervention. Terminal local effects, earlier distance and VP features,
and subsequent target assignments were already known. This study measures a
fixed relative Combat interval and tests two new signals against those same
local-effect labels. It does not qualify a whole-policy or cross-family predictor.

The checkout source is `6eb776a`. The retained historical engine digest is
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
No engine rebuild or new map generation occurs. The [registration](registration.json)
binds source histories, verified movement-exit snapshots, prior results, rule
sources and the extraction/scoring scripts. The [protocol](protocol.md) fixes the
boundary, two candidate definitions, budget, models and alias rules. The pilot
is pair 1800010, selected for previously observed distance 1 versus 2, with its
known terminal effect +8 disclosed. It produces one legal target witness per arm
and a nonzero strength difference. The scoring tool is frozen after this
instrument pilot and before extracting the full cohort. The pilot remains one
of fifteen cases, not another independent observation.

The [probe](../../../../scripts/ai-progress-combat-probe.mjs) resumes all thirty
verified pre-MOVEMENT-exit snapshots. It replays 147 accepted historical actions
to the containing dispatches. The pilot separately replays six actions. The
first regular `COMBAT/COMBAT` entry must match the intervention's gameTurn,
playerTurnIndex and phasing player. Twenty-eight boundaries are in Game Turn 1 and
two in Game Turn 2. Actual earlier movement, reaction and barrage effects are
included. No later attack action is included.

An ADVANCE_SEQUENCE may skip several empty steps. The tool reconstructs every
actual lifecycle transition, requires current/from and nextSequence/to equality,
and matches the complete globally numbered event list. Its final reconstructed
state must equal the actual outer dispatch after only the outer revision
increment. Interrupt or precheck effects that cannot be reconstructed fail this
check. The measurement captures the internal state immediately after the selected
entry, retaining pre-dispatch revision. These are query-only internal snapshots,
not accepted-action checkpoints or resumable saves. All thirty boundaries exist.

Each boundary asks the actual engine for DECLARE_COMBAT with actorId player:axis,
pieceId null and budget 200, the ordinary policy budget. No query is truncated.
Every original-target declaration must be REGULAR, pass validateAction and pass
settleDeclaredAttackerSupply with no violations. That function settles attackers
in declaration order against the SP remaining after prior attackers. Legal
internal stocks are permitted and recorded; all ten observed witnesses instead
use external SP. Reservation feasibility does not prove future ration safety.
Separate alternatives can reuse units and dumps and are never summed.

The generator first tries the full adjacent attack-capable group, then singleton
fallbacks. It does not enumerate all intermediate subsets, supply orderings or
allocations. A missing witness is absence from this generator, not proof of global
impossibility. Original-target absence in a truncated query would be UNKNOWN and
prevent complete-cohort fitting. Best strength means the maximum among offered
legal witnesses. It is not maximum possible strength, expected capture probability,
or the hypothetical concentration returned by queryAttackStrength.

The two paired signals are factual30 minus single15 at this one boundary:

- Attack availability value is objective points times the current contested-owner
  factor when a target witness exists, otherwise zero. The factor is 2 for enemy,
  1 for neutral and 0 for own control.
- Offered attack strength is the largest engine-explained combat.attackerStrength
  among target witnesses, multiplied by objective points divided by average
  configured objective points. With no witness it is zero. Predictor inputs use
  existing explanation facts and own supply declarations, not hidden enemy steps
  or stocks read from raw state.

All thirty original targets are still Allied-held. Five pairs have a witness in
both arms, ten declarations total, so availability difference is zero in all
fifteen pairs. Current-control VP-margin difference is also zero in every pair.
These fitted labels alias prior trainingMean; direct VP aliases prior zero.
The [scorer](../../../../scripts/ai-progress-combat-score.py) reuses their existing
predictions without fitting duplicate coefficients. Prior progress predictions
are also reused as a reference.

Strength differs in three pairs. Pair 1800010 offers strength 2 versus 1 with terminal
local effect +8. Pair 1800020 offers 6 versus 2.5 with effect 0. Pair 1800026 offers 14.5
versus 13 with effect 0. The other twelve paired strength values are zero, although
their terminal effects include three positives, five negatives and four zeros,
ranging from -12 to +8. This is a coverage limitation, not evidence that no later
mechanism can matter.

The fixed comparison is intercept plus one standardized ridge coefficient,
penalty 1, leaving one of fifteen distinct seeds out each time. Center, scale and
coefficients use only the other fourteen. Every fold records feature support,
scale, coefficient and prediction. Signs, cutoffs, horizons and penalties are
not tuned. The [results](results.json) retain all cases, predictions, aliases and
errors. Primary MAE and secondary MSE are:

| Model | MAE | MSE |
|---|---:|---:|
| Prior zero | 4.4000 | 36.5333 |
| Prior trainingMean | 4.7619 | 41.9184 |
| Prior scaled progress | 4.9989 | 45.5750 |
| New offered attack strength | 5.3395 | 45.6715 |

The new strength model loses both errors against zero and is not adopted. The
largest strength difference receives a leave-out prediction of about +6.94 but
its observed terminal effect is 0. Correct rule semantics and a nonzero feature
do not establish VP prediction. These already-seen labels use one original future
dice realization per case; the study neither proves nor rules out label noise as
a cause. Replicating the same intervention under different future dice is a
different experiment, not a rerun of identical policy/dice evidence.

The [checker](../../../../scripts/ai-progress-combat-check.mjs) independently
replays the same 147 recorded actions from verified movement exits, reproduces
every containing dispatch and internal snapshot, and reissues all target queries,
validation and payment settlement. It independently sums current objective scores
and checks the recorded margin against those sums. Four altered-copy controls
reject a wrong target, wrong Combat boundary, fabricated attack availability and
a fabricated margin with a consistently changed paired VP feature. The latter
was added after independent review found the missing margin-to-score assertion;
only the checker was changed and rerun. Extraction and frozen predictions did not
change. Query/settlement preserves each actual measured state and rules RNG.

The [checks](checks.json) also record a shared-SP sensitivity control from
historical match 1800001 at action 67. The control replays that prefix, obtains a
real three-attacker declaration on 17,7 requiring 3T from one dump, and verifies
the original declaration is accepted by the engine. On a disposable state with
that dump reduced to 2T, all three singleton declarations remain individually
legal, while the original joint declaration is rejected at attackerSupply[2].
This proves the instrument does not count the same supply independently for all
attackers. The source history and original RNG are unchanged. This control is
about payment semantics, not another objective-level metric observation.

Raw snapshots and full query payloads remain ignored compressed artifacts. Each
case in results binds its raw file by SHA-256. Restore registered inputs and the
retained engine before reproducing:

```sh
node scripts/ai-progress-combat-probe.mjs
python3 scripts/ai-progress-combat-score.py
node scripts/ai-progress-combat-check.mjs
```

The default engine path is the retained copy at
`artifacts/ai-progress-objective-goal-continuity/engine`. The probe accepts an
explicit --engine, and the checker accepts it as its second positional argument;
both require the registered engine digest. No current build is silently
substituted. The [independent review](review.md) covers scripts, snapshots,
payments, models, controls, documentation and the [decision trail](decisions.tsv).
The [topic document](../../../ai/vp-metrics.md#progressobjective-的合法攻擊機會與戰力)
owns the current interpretation. Default 15, policy 85, supply audit status,
promotion criteria and product-operation gates are unchanged. The goal remains open.
