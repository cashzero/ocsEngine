# Extended position metric contracts and held-out comparison

Boundary: offline research on existing `TEMPERATE_INLAND` saves. No new matches, policy changes, promotion, or UI acceptance. Base engine and metric commit was `df5a0cbdda8a1b3dac64aca127ae32b878a3bdc0`. Current definitions, conclusions, and open defects belong to [policy-errors](../../../ai/policy-errors.md#擴充指標的直接比較), not this immutable record.

## Questions

1. Do the latest fields implement payable plans, complete CRT expectations, and combat-only physical losses as their names suggest?
2. On identical held-out windows, do payable reach, CRT expectation, static objective columns, or local force ratios improve prediction over older metrics and zero-event controls?
3. What does the strongest observed candidate actually measure?

## Inputs and integrity

The raw files from [the original self-play study](../ai-position-metrics-temperate-2026-10-18/README.md) could not be located for this run. This study uses a different historical cohort. It does not reproduce that study's correlations.

- Source directories were `.claude/worktrees/ai-truck-shuttle/artifacts/ai-continue/ration-fix-games/{meeting,attack}-temperate` under `/home/cashlin/ocsEngine`.
- Eight saves per directory, heuristic versus frozen v79 with swapped policy seats. Map seeds were `295641633`, `295641827`, `295642021`, `295642215` for meeting and `295661033`, `295661227`, `295661421`, `295661615` for attack.
- Both recorders reported 8 games, 128 rows, 0 skipped. All 16 final replay hashes matched. The current `src` tree was unchanged from the source used for the ration-fix cohort.
- Initial hash, final hash and canonical accepted actions identify 12 unique trajectories. Meeting seat swaps supplied four duplicate aliases. Attack swaps supplied eight distinct trajectories on four seeds. There are 8 independent map-seed groups, not 16.
- Removing Game Turn 1 and the final player-turn window leaves 156 observations. Attack-moving has 55 windows, defender-moving 49, meeting 52. Each role has only four seed groups.
- The eight attack saves include 64 `DECLARE_AIR_MISSION` and 56 `REFIT_AIRCRAFT` actions; meeting has neither. This is not a pure-ground cohort.

[manifest.json](manifest.json) records row-file hashes and sources. [validation-all.json](validation-all.json) records summary/save/action hashes, trajectory identities and all model-source hashes. Saves and full recorder outputs remain ignored under `artifacts/` or their original worktree. Absolute source paths describe this machine; relocated raw inputs require a regenerated manifest and matching recorder `dir` provenance.

## Method

The exact tracked recorder and metric module were copied into an ignored runner using a fresh isolated build, avoiding the stale root `dist`. Neither metric implementation nor policy was modified.

At the beginning of P's player turn, O's metrics predict O's recorded losses during that window. Moving-side column and ratio features refer to P at the same instant. Outcomes are objective-control VP losses, not terminal VP margin. Trace rise is positive net change to the next row, not a count of all newly cut units or causal attribution. Loss fields retain the recorder's event-count convention and classification defects described below.

[ai-position-extensions-study.py](../../../../scripts/ai-position-extensions-study.py) reuses the hashed-input, trajectory-identity, fitting and scoring helpers of `ai-position-validate.py`. It leaves one complete map seed out within each role subset. No seed appears in training and test together. It compares zero, training median/mean, baseline regression, baseline plus candidate regression, and baseline/candidate bucket medians. Training-only preprocessing and an added-feature ridge penalty of 1 match the earlier validator.

Buckets were fixed before this comparison as a separate negative sentinel, `0`, `(0,1]`, `(1,3]`, `(3,7]`, and `>7`. This extends earlier integer buckets to fractional metrics. The previous validator's exact `==1` condition is not used for continuous CRT values. Unseen buckets use the training median. No bucket or hyperparameter search was performed. Candidate/role/model comparisons are exploratory and not multiplicity-adjusted.

Reported intervals resample the eight map-seed clusters 1,000 times on fixed out-of-fold errors. They omit refitting and feature-selection uncertainty. Role-specific intervals use only four clusters.

## Observed prediction errors

MAE is lower when better. Outcome units differ between rows.

| Outcome | Candidate / old feature | Zero | Old bucket median | Candidate bucket median |
|---|---|---:|---:|---:|
| Objectives lost | payable count / geometric count | 0.2244 | 0.2179 | 0.2308 |
| Objective VP lost | payable VP / geometric VP | 0.6795 | 0.6795 | 0.6923 |
| Non-attrition loss events | maximum CRT loss / allocated exposure | 1.1474 | 1.1891 | 1.1955 |
| Attrition events | out-of-trace / contact | 0.1090 | 0.1090 | 0.1090 |
| Positive net trace loss | cuttable / contact | 2.2949 | 2.3205 | 2.2949 |
| Dump SP lost | dump SP in reach / contact | 0.4551 | 0.4551 | 0.4583 |
| Objective VP lost | moving static column / geometric VP | 0.6795 | 0.6795 | 0.6923 |
| Objective VP lost | moving local force ratio / geometric VP | 0.6795 | 0.6795 | 0.4968 |

Local force ratio is the positive candidate in this cohort. Its bucket median gains 0.1827 VP MAE over zero and geometric-VP bucket predictions, with conditional interval `[0.0801, 0.2832]`. Per-seed gains are nonnegative, with five positive and three tied. Only 25 of 156 windows have nonzero objective VP loss.

| Role | Seeds / windows | Zero MAE | Ratio bucket MAE | Gain interval versus zero |
|---|---:|---:|---:|---|
| Attacker moving | 4 / 55 | 1.0545 | 0.8091 | [0, 0.4821] |
| Defender moving | 4 / 49 | 0.0816 | 0.0816 | [0, 0] |
| Meeting | 4 / 52 | 0.8462 | 0.7019 | [0, 0.2981] |

The pooled linear ratio model does not show a clear MAE gain; its interval is `[-0.0208, 0.1047]`. Payable count raises held-out linear R² from 0.102 to 0.173 while worsening MAE from 0.3145 to 0.3306. These results must not be collapsed into a claim that all new metrics predict better. There are only six nonzero attrition windows and no nonzero defender-moving attrition windows.

Complete role outputs preserve failures and all seven models: [all](validation-all.json), [attacker moving](validation-attacker-moving.json), [defender moving](validation-defender-moving.json), [meeting](validation-meeting.json).

## Runtime contract counterexamples

[semantics-probe.mjs](semantics-probe.mjs) runs against the compiled rule engine, metric module, recovery action, attacker-supply settlement and overstack decision. [semantics-probe.json](semantics-probe.json) records inputs, outputs, source hashes and build command. A second execution reproduced the values.

| Contract | Observed counterexample |
|---|---|
| Complete best-attack expected loss | An AR 4 attacker against AR 3 at column 5 gets metric 0 because null attacker leader means AR 0. Specifying the leader gives 0.27777778 expected direct defender loss from combat dice, and enumerating Surprise gives 0.39866255. No defending option loss is assumed in this fixture. |
| Payability after required recovery | Metric reports raw reach 1, payable 0, surplus SP 0. An accepted `RECOVER_INTERNALS` spends the four-token dump and restores FULL internal stock; the actual attacker-supply resolver then accepts INTERNAL payment with no violations. The post-recovery metric reports payable 1. |
| No unit reuse in objective assignment | One unit with four movement ticks can reach either of two empty objectives, but visiting both requires twelve ticks. The metric counts both as payable. Empty objectives bypass unit reservation. |
| Pure combat physical steps lost | An accepted overstack decision eliminates a two-step unit. One `STEP_LOST` event is emitted and classified as one `combatStepsLost`, although it is not combat and two physical steps disappear. |

Source review also finds that payable reach pools sources without proving they reach the selected post-move attackers, assumes fueling for reach without charging it, and uses greedy attack-group reduction. The static effective-column field directly projects units and does not include movement legality or hedgehog/AR dice effects. The printed force ratio and maximum column can refer to different objectives. These are definition limitations, not measured explanations for all prediction failures. No corrected-metric versus original-metric experiment was performed here.

## What the ratio signal contains

[focus-audit.mjs](focus-audit.mjs) independently replays the 12 unique trajectories, verifies every ratio against the recorder, checks accepted actions and final hashes, and reconstructs the exact focal objective. [focus-audit.json](focus-audit.json) contains its summary and the 13 high-ratio cases.

Ratio `>7` occurs in 13 windows across six seeds. All focal objectives are opponent-controlled. Eight have no defender on the objective, and seven have no enemy within two hexes. Five still have defenders. Subsequent opponent objective VP loss occurs in six of the eight empty cases and all five defended cases. The outcome is total window VP loss; this audit does not prove that the focal objective itself changed hands.

Thus the candidate mixes empty-objective opportunities with defended-objective opportunities. Separating these and linking conditions to the same target's capture and later retention is the next measurement question. Maximizing the current printed ratio is not justified by this result.

## Reproduction and final state

```sh
node_modules/.bin/tsc -p tsconfig.build.json --outDir /tmp/ocsEngine-latest-metrics-probe --declaration false --declarationMap false --sourceMap false
mkdir -p artifacts/ai-latest-metrics-study/runner/scripts
cp scripts/ai-position-record.mjs scripts/ai-position-metrics.mjs artifacts/ai-latest-metrics-study/runner/scripts/
cp package.json artifacts/ai-latest-metrics-study/runner/package.json
ln -sfn /tmp/ocsEngine-latest-metrics-probe artifacts/ai-latest-metrics-study/runner/dist
node artifacts/ai-latest-metrics-study/runner/scripts/ai-position-record.mjs /home/cashlin/ocsEngine/.claude/worktrees/ai-truck-shuttle/artifacts/ai-continue/ration-fix-games/meeting-temperate --out /home/cashlin/ocsEngine/artifacts/ai-latest-metrics-study/meeting-temperate.jsonl
node artifacts/ai-latest-metrics-study/runner/scripts/ai-position-record.mjs /home/cashlin/ocsEngine/.claude/worktrees/ai-truck-shuttle/artifacts/ai-continue/ration-fix-games/attack-temperate --out /home/cashlin/ocsEngine/artifacts/ai-latest-metrics-study/attack-temperate.jsonl
cp docs/quality/evidence/ai-position-metric-audit-2026-10-19/manifest.json artifacts/ai-latest-metrics-study/manifest.json
python3 scripts/ai-position-extensions-study.py --manifest artifacts/ai-latest-metrics-study/manifest.json --artifact-root . --out artifacts/ai-latest-metrics-study/validation.json
cp docs/quality/evidence/ai-position-metric-audit-2026-10-19/semantics-probe.mjs artifacts/ai-latest-metrics-study/semantics-probe.mjs
node artifacts/ai-latest-metrics-study/semantics-probe.mjs
node docs/quality/evidence/ai-position-metric-audit-2026-10-19/focus-audit.mjs /tmp/ocsEngine-latest-metrics-probe
```

The full ignored validation output is split by role in this folder to keep each JSON below 200 KB. Repeating the comparison produced byte-identical output. The existing validator's `--self-test` passed, covering held-out signal, null sensitivity, duplicate conflicts, alias exclusion, fold coverage and future leakage. Saved split outputs, source hashes, shared complete windows and seed exclusions were also checked against the full output.

Analysis execution returned successfully in about 0.7 seconds; replay duration was not recorded and no throughput claim is made. Recorder, probes and focus audit completed without reported engine violations or hash mismatches. Product verification rows remain unchanged. Payability, CRT expectation and loss attribution defects remain open; no metric implementation was fixed by this study. No final-VP or cross-policy improvement qualification was granted.
