# Same-target probability and rule-condition experiment

Boundary: offline replay and statistical analysis of existing bot games. No policy change, new games, promotion,
or UI acceptance. Current contracts and findings live in [objective metrics](../../../ai/objective-metrics.md).

## Inputs and implementation

The experiment began on `767e2a3`, was integrated after rebase to `ee3f789`, and rebased again to `883beec` before delivery. The rebase changes analysis tools and
documents, with no change under `src/`. The compiled engine contains 208 JavaScript files, with digest
`875515764bbccf9a022201253b71926a66b6ecf96b65eac321cc8229081a0482`.
Runtime is Node v26.9.0 and Python 3.14.4. No external statistical package is required.

The [input manifest](../ai-position-metric-audit-2026-10-19/manifest.json) identifies two existing TEMPERATE_INLAND
row files and their original saves. Sixteen aliases deduplicate by initial state, final state and accepted actions
to 12 trajectories on eight map seeds. Attack saves include air missions. All source paths and hashes are checked.
Large observations, predictions and worklists remain in `artifacts/ai-objective-methods-study/corrected-run/`.
[Artifact hashes](artifact-hashes.json) identify them and the scripts. [Extraction output](extraction.json) records the full replay completion.

Acceptance for this unit was fixed before implementation. Observe each configured target before its outcome,
link the same target's control changes and final holder, preserve source/alias identity, prove observer equivalence,
compare frozen models with grouped folds and sparse baselines, retain failures, and independently review results.
Full legal optimization, all eight statistical families, policy-gain qualification and UI gates are outside this unit.
Their open work remains in the owning roadmap and TODO inventory.

The original pre-extraction choices are [protocol-original.json](protocol-original.json) and
[contract-original.md](contract-original.md). Feature sets, ridge convention, folds and primary M3-minus-M1 Brier
contrast were fixed there. The [current protocol](protocol.json) and [contract](contract.md) explicitly amend
ownership and calibration after correctness findings. They are not a second pre-results registration.

## Reproduction

From the repository root, with the historical raw saves and row files present:

```sh
node_modules/.bin/tsc -p tsconfig.build.json --outDir /tmp/ocsEngine-objective-study-engine --declaration false --declarationMap false --sourceMap false
node scripts/ai-objective-replay-verify.mjs --engine /tmp/ocsEngine-objective-study-engine
python3 scripts/ai-objective-study.py --self-test
python3 scripts/ai-position-validate.py --self-test
python3 scripts/ai-objective-study.py --manifest docs/quality/evidence/ai-position-metric-audit-2026-10-19/manifest.json --artifact-root /home/cashlin/ocsEngine --engine /tmp/ocsEngine-objective-study-engine --out artifacts/ai-objective-methods-study/reproduction
```

The runner writes a verified worklist, invokes the JS replay, validates all objectives and the gross/signed ledger,
fits fixed logistic models, and writes analysis and predictions. It aborts on invalid schema, identities, window
ownership, ledger mismatch, mutated state, replay mismatch or optimizer nonconvergence. A failure report is written
to the output directory. The recorded full replay returned exit 0, with no engine error. Its extraction duration was
169.194 seconds. Scoring after rebase reused the same verified observations and kept the prediction hash unchanged.
The rescore's provenance is separate from the original extraction command, preserved below.

## Correctness findings and integration

The old first-action snapshot could observe the FIRST_PLAYER chooser, who may choose second without changing
the turn key. This cohort has 84 such decisions, 59 first and 25 second. All 25 second choices require a different
mover. Before the guard fix, a real lifecycle reproduction failed with `Missing expected exception`, expected
`turn order unresolved`, in [turn-order-before-fix.log](turn-order-before-fix.log). After the fix, unresolved choices
are rejected, and first/second cases check actual owner, role and snapshot revision.
[Post-fix checks](turn-order-after-fix.json), [owner reconstruction](turn-owner-correction.json).

Schema 1 actor-specific scores are invalid. The [invalid baseline record](invalid-owner-baseline.json) preserves
their counts and identities without treating them as current prediction evidence. Schema 2 defers snapshots until
after the choice and asserts stable ownership in every observed action. The apparent four own-target losses in the
old interpretation disappear. Current endpoint/accounting results are in [counts.json](counts.json).

The independent [statistical review](statistics-review.md) also found equal-seed calibration was reweighting seeds
inside each bin. Fixed complete-subset weights now give the correct bin mass and reconstruct headline scores.
The unequal-bin reproduction is part of [self-test.json](self-test.json). This correction changes tables, not model
predictions. The [instrument review](integrity-review.md) predates the ownership correction. The
[owner-fix review](owner-fix-review.md) covers corrected scripts and the full cohort before rebase integration.

Rebase revealed main already fixed the recorder in `6cef00e`, re-recorded P2/P5, and completed P7 on new games.
The earlier review's statement that the current 255-trajectory corpus remained unrepaired is superseded by this
integration evidence. [Main alignment](main-alignment.json) verifies the committed P5 hashes for the same source
games and compares 208 alias windows. Actual movers and both players' gross objective counts/VP all match schema 2.
Current P2-P7 conclusions remain intact. Only the old input/audit comparison is withdrawn. The
[integration review](main-integration-review.md) records this scope correction. Its written verdict and checks were
saved before the reviewer hit its usage limit, and it explicitly excludes final evidence-package completion.
The final rebase adds P8 documents and a separate surrogacy script without changing the reviewed objective scripts,
helpers or engine. The roadmap conflict retains completed P8 and this unit's partial P9 note. P8's existing results
remain intact. Final package links and hashes were checked by the primary agent, not a second independent reviewer.

## Observed result

All 9,484 accepted actions match observer-disabled replay in acceptance, events and state hashes. All 256 probes
leave state unchanged, and 100 accepted objective combat declarations have explanation/forecast witnesses.
Every alias endpoint and both-player ledger match. [Replay checks](replay-checks.json).

There are 156 windows, 1,352 configured-target rows, 704 initially enemy-held targets and 39 retained acquisitions,
worth 116 VP in 29 nonzero windows. All 648 initially own-held targets remain owned. No neutral target occurs.
The corrected roles each have 52 windows. Final states match the original saved final hashes.

Pooled M3 Brier is 0.03769665 versus M1 0.04293569. The paired fixed-error seed interval for M3 minus M1 is
[-0.01691079, 0.00176889]. Four seeds improve and four worsen. M3 window expected-VP MAE is 0.81453 versus
0.91209 for M1 and 0.74359 for zero. These scores do not establish a winning general model or stronger bot.

- [All scores and calibration](scores-all.json), [paired intervals](paired-intervals.json), [folds](folds.json).
- [Attack role](scores-attacker-moving.json), [defense role](scores-defender-moving.json),
  [meeting role](scores-meeting.json). Per-seed score files preserve every seed.
- [Rule conditions](rule-conditions.json) preserve conditional combat, matched-unit strength contributions,
  supplied/unfunded defender contrasts and 15 retained captures outside the initial two-hex force radius.
- [Window predictions](window-predictions.json) retain zero-target windows and expected versus observed acquisition VP.
- [Provenance](provenance.json) and [decision trail](decisions.tsv) retain the verification and scope decisions.

These historical seeds were already inspected. The intervals resample fixed held-out errors and exclude refitting,
selection and multiple-comparison uncertainty. Conditional adjacent odds do not prove legal movement, fuel or joint
supply payment. P9's count outcomes and Holm/BH rejudgment of P7 are not implemented by this experiment.

Original full extraction command:

```sh
python3 scripts/ai-objective-study.py --manifest docs/quality/evidence/ai-position-metric-audit-2026-10-19/manifest.json --artifact-root /home/cashlin/ocsEngine --engine /tmp/ocsEngine-objective-study-engine --out artifacts/ai-objective-methods-study/corrected-run
```
