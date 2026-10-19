# Movement observation and gate diagnostics

This run verifies the bounded non-truck destination observer and descriptive score analysis. It does not
qualify a VP predictor, prove a policy improvement, close P10, or promote a product UI gate. Current contracts
belong to [decision observation and score sensitivity](../../../ai/vp-metrics.md#決策閘門的觀測契約).
Results belong to [observed movement gates](../../../ai/policy-errors.md#移動決策的實際阻擋).

## Inputs and expected result

The source worktree is based on `967a49a`. [provenance.json](provenance.json) binds all seven observer/test
files, their source-set SHA-256, the recorded fixture and both actual JavaScript builds. The root reader is
bound separately by [reader-binding.json](reader-binding.json). Full requests, call returns, accepted actions,
per-action hashes and observations remain ignored under `artifacts/ai-movement-observation-study/reproduced/`.

The generated heuristic fixture has two turns, attack engagement, two divisions and one armored division
per side. The random-legal positive control has one turn and one non-armored division per side. The recorded
fixture is `tests/ai/fixtures/vp-trace-gain-1221000.state.json.gz`, continued for 30 accepted actions from its
snapshot. Each branch starts with the same fresh runner memory. This compares the same frozen continuation
with observation off/on; it does not reconstruct an unavailable historical policy memory.

Expected behavior is exact equality of frozen, current-disabled and current-enabled choices, phase memory,
ordered access and policy-RNG API calls with raw returns and hashes, dispatch results/events/violations,
every post-action hash, accepted action logs, and save/load results. The no-writer frozen-policy control must
retain v1 QUERY_ONLY coverage on the new runner. Candidate scores, original term snapshots, correction and
supply-check order, skipped reasons and actual selected identity must reconcile to the calls that ran.

The earlier `/tmp` worktree disappeared. Its large outputs remain reference data and supply no acceptance
evidence here. Source was recovered in the persistent ignored worktree, then every accepted fixture was
regenerated. [decisions.tsv](decisions.tsv) is an honest post-run record from retained commands and artifacts,
not a preregistration or a claim that its timestamps preceded measurement.

## Observed verification

[equivalence.json](equivalence.json) binds all ten behavior payloads and provenance. The generated heuristic
fixture has 129 decisions and 1,594 access calls. The random control has 33 decisions and 443 policy-RNG API
calls. The recorded prefix has 30 decisions, 375 access calls, 20 movement choices, 49 movement queries and
121 explanations. Frozen/off/on comparisons passed. The frozen policy emitted 129 v1 reports with
uninstrumented evaluation.

Across the heuristic and recorded fixtures, v2 contains 69 groups and 13,737 scored candidates. Independent
reconstruction checked eligibility, capture-priority order, the correction cap, actual explanation-call order,
composite outcomes, retained terms, stay comparisons and selection. One group executes 13 final-supply
checks, demonstrating that the 12-candidate correction cap is a different population. No individual nested
short-circuit operand is claimed observed solely from its presence in an explanation.

[producer-checks.json](producer-checks.json) records successful typecheck, build, eight focused tests, actual
study and CLI execution, including output hashes. The healthy CLI finished and replayed, emitted 30 reports,
and declared both v1 and v2 in [cli-manifest.json](cli-manifest.json). [cli-runtime.json](cli-runtime.json)
records measured timings and errors. These timings are execution records, not a speed comparison.

[integration-checks.json](integration-checks.json) records the root integration's successful typecheck, build
and 21 tests in five AI files, plus exact source and runtime-build agreement with the reviewed producer.
The first whole-build comparison found two obsolete generated modules whose source files no longer exist.
All common JavaScript bytes already matched. Those old outputs were archived in ignored artifacts, after
which the complete root runtime hash matched. No tracked build behavior was changed for this cleanup.

## Descriptive analysis

[gates-generated.json](gates-generated.json) and [gates-recorded.json](gates-recorded.json) contain validated
counts and pooled/equal-group rates by role, assigned purpose and target identity. Assigned targets are
planning identities, not verified objective control. Arithmetic sensitivity removes the same term from both
candidate and stay. Crossings overlap and remain separate for groups without a selected move.

There are 58 selected groups, ten with no improving retained score, and one with all improving candidates
refused by the final supply guard. Thirty-nine route refusals occur in six groups; five still find an
alternative. This supports measuring group exhaustion separately from route rejection frequency. It does
not show that staying was wrong or that eliminating a refusal would improve VP.

The reader self-test checks both-side arithmetic, the common-penalty false-positive case, strict zero
boundary, repeated terms, nonfinite rejection, and unequal group sizes with a zero-denominator group.
[reader-controls.json](reader-controls.json) records two actual CLI rejection controls. Changed input bytes
fail the registered-hash check. Correctly rehashing a corrupted retained score reaches and fails score
reconciliation instead. These are the intended disagreements, not missing-file or usage failures.

## Independent review and limits

[integrity-review.md](integrity-review.md) records `gpt-6-astra` source, artifact, arithmetic, rate and comment
review, with exact hashes. It independently parsed all bound payloads, reconstructed movement groups and
reconciled both reader outputs. Target identity grouping and the missing applied/checked rate were corrected
before the final reader was frozen. No remaining source blocker was found. The reviewer inspected recorded
process results and verifier assertions; it did not independently rerun games, builds, tests or save/load.
The frozen build was hash-checked, not independently rebuilt.

[delivery-review.md](delivery-review.md) records the independent `gpt-6.1-sol` review of the owning
documents, scoped counts, evidence links and delivery trail. It found no blocking contradiction or
completion claim. It did not rerun games, builds or tests.

Atomic predicates, other policy branches, ungenerated search space, same-objective control/retention joins,
and legal alternative continuations remain open in `bot-decision-gate-observability` and
`bot-vp-predictive-metrics`. Candidates and adjacent groups are dependent observations. No independent-sample
confidence interval or VP effect is inferred from these fixture counts.

## Reproduce

Build the current source and use a retained or freshly built query-only `967a49a` build as the baseline:

```sh
npm run build
npm run typecheck
npx vitest run tests/ai/seat-runner.test.ts tests/ai/bot-driver.test.ts tests/ai/heuristic.test.ts tests/ai/decision-observation.test.ts tests/ai/movement-observation.test.ts
node scripts/ai-observation-study.mjs --engine dist --baseline artifacts/ai-movement-observation-study/baseline-dist --out artifacts/ai-movement-observation-study/reproduced/equivalence
node scripts/ai-movement-gates-study.mjs --self-test
node scripts/ai-movement-gates-study.mjs --input artifacts/ai-movement-observation-study/reproduced/equivalence/enabled.json --summary artifacts/ai-movement-observation-study/reproduced/equivalence/summary.json --out artifacts/ai-movement-observation-study/reproduced/gates-generated.json
node scripts/ai-movement-gates-study.mjs --input artifacts/ai-movement-observation-study/reproduced/equivalence/recorded-enabled.json --summary artifacts/ai-movement-observation-study/reproduced/equivalence/summary.json --out artifacts/ai-movement-observation-study/reproduced/gates-recorded.json
```

A rerun records its own source/build/input hashes. CLI run IDs and process timings vary. Preserve the
declared baseline, fixture, seeds and memory boundary when comparing behavior.
