# Next VP policy study

Status: PROMOTED, standard heuristic@66. Baseline: immutable heuristic@35. The candidate, separate failed
independent batches, and development results are recorded in `results.json` and the
report `docs/reports/ai-vp-next-promotion-2026-10-14.md`.

Each independent batch contains exactly 80 full eight-turn games: two current map
styles, MEETING and AXIS_ATTACKS, ten same-seed swapped-seat pairs per group. Both
policies use the candidate's common engine and generator. Candidate source/build
hashes, source base and seed ranges are registered in `v*-freeze.json` before games.
Do not pool versions or extend a failed batch to change its confidence interval.

`runs.json.gz` contains summaries and supply audits. `matches/` preserves every
independent accepted-action save and decision trace losslessly as gzip. `sources/`
preserves frozen prototype source, and `logs/` keeps failed and interrupted runs
alongside successful runs. `manifest.json` records each archived raw file's SHA-256
and byte count. `v*-quality.json` binds successful quality logs to hashes;
`v*-acceptance.json` contains the final candidate's explicit acceptance checks.

Attribution reports record initiating actions and actual piece/supply changes.
Reinforcement/rebuild entry and enemy combat reactions are distinct from friendly
relocation. These mechanisms do not infer a bot's intention or prove that every
supply loss is a mistake. Regular advances use a conservative shared-stock forecast;
Overrun supply is conditional on clearing its target, excludes random captured SP,
and pays the actual attack/internal-recovery costs. Final post-Supply operations do
not reserve a nonexistent subsequent friendly meal.

Scripts are study runners tied to the repository and frozen builds. Start from the
registered source base, restore archived sources and build, provide immutable v35
policy modules, then use `batch.py VERSION meeting` and `batch.py VERSION attack`.
`audit-advances.mjs` replays actual advances and classifies recorded supply losses.
`verify.py VERSION` checks the complete registered batch and matching final source.
The failed v42 batch's stopped queue and exact missing-game recovery are preserved
by `resume80-plan.json`, recovery scripts and their logs.

This evidence verifies the bot-match boundary. It does not promote any UI operation
in the product-operation verification plan.

The historical d133b1d main rerun is strategy v57. Artifact batch ID 58 and its original trace
labels were assigned before correcting the mistaken version bump. They denote no
new strategy. `v57-current-main-delivery-plan.json` records exact source/build hashes;
verification permits only the single policy version-string correction and requires
all other production bytes to match the frozen batch.

The promoted strategy is v66 on current main 45e700a (artifact `66-main`);
this suffix identifies a new engine base, not a new strategy version. Its independent
80-game batch is registered in `v66-main-freeze.json` and all registered acceptance checks passed. The
immutable standard v35 opponent is 45e700a's upstream policy, including support for
new rebuild prices/pairs; its source/build AI hashes and source commit are registered
in that manifest. `sources/baseline-v35-main45e/` preserves its source. Earlier v35
snapshots and their failed/old-base batches remain unchanged and are not pooled.
Current policy and promotion status are maintained in
[docs/ai/current-strategy.md](../../../ai/current-strategy.md).

The initial `66-main` strict audit mixed the artifact label with trace policy version
and missed candidate-specific flags. Its acceptance was reopened. The corrected
owner-based audit replays all 80, verifies candidate flags against actual actors, and
reports 229 candidate Regular advances (223 funded, six final post-Supply) and 31
actually funded successful Overruns with zero violations. Previous outputs/logs are
retained in `diagnostics/` and `v66-main-identity-fix-plan.json` as invalidated evidence.
