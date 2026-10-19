# Policy-effect prediction on disjoint map seeds

Boundary: offline analysis of existing P8 bot games. No new games, policy changes, reward changes, promotion,
or UI acceptance. The broader goal remains open. Current findings live in
[policy-effect transfer](../../../ai/policy-errors.md#改版效果能否轉移到另一批種子), and the method contract lives in
[VP metrics](../../../ai/vp-metrics.md#改版效果預測的資料隔離).

## Question and acceptance

Can a policy's early effect measured on development maps predict its final VP effect on different maps, beyond
the historical VP-only model and zero? P8's registered same-panel correlation remains its own historical record.
This retrospective check tests a different prediction boundary.

The acceptance steps are input reconciliation against P8, a local protocol freeze before new transfer scores,
controls for genuine signal and shared noise, whole-family calibration exclusions, complete baseline and subgroup
reporting, independent review, and current topic documentation. A valid measurement procedure is not a passing
predictor. No result here completes prospective qualification or the broader research objective.

## Source identities

Base `13821dc16bc0c10fd41af1654fc72e50177923a6`. Python 3.14.4, standard library only.
The source is the committed P8 [registration](../ai-position-surrogacy-2026-10-19/registration.json),
[manifest](../ai-position-surrogacy-2026-10-19/manifest.json), and
[rounded result view](../ai-position-surrogacy-2026-10-19/results.json). Raw data are at
`/home/cashlin/ocsEngine/.claude/worktrees/ai-truck-shuttle/artifacts/ai-surrogacy/`.

The input module verifies all six historical analysis/recording source hashes, all 24 weight files, 48 row files
and summaries, complete rows, policy seats, identical paired seeds and initial state identities, finished games,
and training-map exclusion. It records saved action hashes and reconciles action counts, revisions, victory and
saved endpoints. Historical `replay.ok` remains historical evidence. This run performs no new engine replay or
state-hash recomputation. [Input audit](input-audit.json).

There are 384 game records, 192 opposite-seat pair effects, 24 variants, 12 weight families, eight shared maps,
two climates, and 6,144 rows. Only 230 trajectories are distinct. Unchanged play legitimately occurs under multiple
perturbations, so records are not treated as 384 independent games. All 240 historical GT4/dVP means exactly match
the manifest-hashed full-precision output, maximum absolute error zero. Fifty-seven committed values instead match
their four-decimal rounding. [Mean reconciliation](mean-reproduction.json).

Large panels, prediction ledgers, fitted folds and all 2,000 synthetic replicate records remain in ignored
`artifacts/ai-surrogate-transfer-study/`. [Artifact hashes](artifacts.json) identify them and the executable sources.

## Frozen comparison

The [protocol](protocol.json) was a local pre-score freeze on already inspected historical data, not a prospective
registration. [Design synthesis](synthesis.md) selects direct historical P6 M2 versus M0 predictions as primary,
with one-slope calibration and signed covariance diagnostics secondary. The historical P6 model coefficients use
only the hashed old training set, with no P8 map overlap.

For each climate, choose two of four seed pairs for development and use the other two for evaluation. This gives
36 oriented splits and 18 complementary partitions. Identity predictors average GT4 variant-side margins over
the four development pairs. Their target is the same variant's final margin on four disjoint evaluation pairs.
This seat-balanced margin against the standard is not a separately observed default-self-play difference.

Secondary OLS calibration fits one intercept and unrestricted slope on 22 development variant means. Both
directions of the held weight family are excluded. No evaluation outcomes or evaluation early metrics enter
prediction. The direct development-final benchmark intentionally requires completed development games.

The primary gain is `MSE(identity M0) - MSE(identity M2)`, in VP squared. Positive favors M2. Fixed methods include
zero, training mean, development final, raw early VP, identity M0/M1/M2, mapped M0/M1/M2, and six mapped metrics.
There is no selection or tuning. Selection diagnostics choose the largest forecast, with lexical variant-ID ties.
Numeric protocol mismatch checks and the recorded execution contract prevent silent changes to key settings.

The 864 scored predictions per method are dependent repeated evaluations. The interval descriptively resamples
12 complete family mean error differences 10,000 times with seed 20261019. It conditions on fixed predictions and
these maps, excludes refitting, and has no claimed map-population coverage. Climate scores retain the same balanced
prediction and evaluate each climate's target separately. Family deletions do not refit.

## Verification and run

```sh
python3 scripts/ai-surrogate-transfer-inputs.py --self-test
python3 scripts/ai-surrogate-transfer.py --self-test --out artifacts/ai-surrogate-transfer-study/self-test.json
python3 scripts/ai-surrogate-transfer.py --artifact-root /home/cashlin/ocsEngine/.claude/worktrees/ai-truck-shuttle --protocol docs/quality/evidence/ai-surrogate-transfer-2026-10-19/protocol.json --out artifacts/ai-surrogate-transfer-study/reproduction
```

The completed controls use 500 independent synthetic panels per mode. Genuine transfer beats zero and the training
mean. Negative transfer reverses the fitted slope. Shared-noise data have same-panel correlation exactly one, yet
disjoint prediction loses to zero by 0.25414 VP squared on average, close to the analytic 0.25 loss. The family-direction
control defeats the global family-excluded mapping while a deliberately leaky within-family fit appears successful.
[Control summaries](synthetic-controls.json). Full replicate records are hashed in `artifacts.json`.

Additional checks cover exact VP errors, cached/direct equivalence, all family exclusions, fold-local feature and
outcome perturbations, reversed signs, reordered rows, covariance/off-diagonal equality, and unsupported protocol
settings. [Protocol rejection checks](protocol-guard-test.json). Independent review recalculated all 864 targets,
3,888 OLS fits, 7,776 secondary predictions, every method MSE, primary interval and all synthetic summary statistics.
[Statistical review](statistical-review.md), [input and comment review](integrity-review.md).

The input/comment review binds the source before the numeric protocol guard. The statistical review binds final
source and verifies the guarded rerun. Predictions, fits and all scores are unchanged. Earlier incomplete control
runs were stopped for review corrections and are not passing evidence. The completion-log row was appended after
the first empirical report, so it is not a pre-run registration timestamp. Protocol and control artifacts and execution
order establish that the completed controls preceded empirical scoring. [Decision trail](decisions.tsv).

A final timed deterministic reproduction exited zero in 16.03 seconds, with no runtime error, and reproduced the
same analysis bytes and prediction hashes. [Run timing](runtime.json). It ended with `REPORTED_EXPLORATORY` and no
new game state. Per-game original endpoints remain bound in the ignored panel and input identities.

## Result

MSE is 3.25288 for identity M0, 3.02555 for M1, 3.14990 for M2, and 3.32726 for zero. The primary M2 gain over M0 is
0.102984, with a descriptive family interval [-0.575689, 0.864610]. M2 wins 17 of 36 splits, but loses in Eastern Europe
and wins in Temperate Inland. All secondary calibrated predictors have higher MSE than zero and the training mean.
M1 has the lowest point error, but was not primary and has no confirmed advantage over zero.

All scores, family effects, climate results, intervals, complementary partitions and signed covariance moments are
in [results.json](results.json). [All split scores](split-scores.json) retain failures.
[Selection records 1](selection-1.json) and [selection records 2](selection-2.json) preserve every method's choices.
No favorable subset is substituted for the frozen primary.

The direct P6 predictors retain some finite-panel association, so this does not show that all P8 association is fake.
It shows that same-panel correlation has not established reliable prediction of improvement on disjoint seeds.
Signed moment corrections are descriptive, never clipped or converted into latent R2. No predictor is qualified
for reward optimization or policy promotion by this experiment.
