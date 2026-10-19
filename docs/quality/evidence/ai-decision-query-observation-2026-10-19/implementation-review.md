# Independent implementation review

No remaining code blocker was found in the query-provenance and dispatch-attribution unit at the hashes below. This verdict does not close P10 or `bot-decision-gate-observability`. Movement scoring, policy conditions, expensive-check denominators, stay comparisons, and target-control outcomes remain outside `QUERY_ONLY` coverage.

The review read the actual source, six new test cases, study script, design brief, synthesis, decision trail, frozen-source manifest, equivalence payloads, and CLI outputs. The reviewer ran read-only artifact comparisons. The reviewer did not run games or tests and did not modify source. The parent reports 19 passing tests and passing typecheck. Those process results were not independently executed by this reviewer.

## Contract findings

- `src/ai/access.ts` retains the full `CandidateResult` in the existing decision-local cache and returns the same `actions` array. Cache hits do not execute a session query. The observer receives the request, original result, and cache-hit flag. There is no added policy query, scoring execution, RNG draw, or phase-memory mutation in the implementation.
- `src/ai/observation.ts` assigns distinct query and candidate ID types. Query identity uses the request tuple. Candidate identity uses the original action object. Repeated cache uses reference the same query and candidate IDs. Separate action objects with equal fields remain distinct identities. The query preserves budget, truncation, reasons, and candidate order. It does not invent the number of omitted candidates.
- Every candidate explicitly has `policyEvaluation: NOT_INSTRUMENTED`, including directly constructed choices. Every report has `coverage: QUERY_ONLY`. Generated candidates cannot be classified as visited, scored, rejected by policy, or eligible merely from these reports.
- The chosen score and breakdown belong to `choice`. Each attempted dispatch has its own candidate ID, request ID, status, violations, and resulting revision. A fallback does not acquire the rejected preference's score. Candidate IDs and query IDs are local to the report and must be joined with run ID and decision ordinal.
- `src/ai/seat-runner.ts` publishes null choices after recording the stall. It publishes exhausted attempts and fatal results after recording their errors. Accepted actions publish after counters and memory bookkeeping. The separate observation ordinal survives `reset()` and the restore branch. The callback receives a structured clone, so callback mutation cannot change the live action or breakdown through the report.
- An observation callback exception propagates after bookkeeping. Consumers must not retry the dispatched action. The existing legacy `onDecision` callback still runs before bookkeeping and can throw before the new callback. This pre-existing behavior is outside the new recording sink's containment guarantee and must remain explicit in public documentation, especially for combined `--trace --observe-decisions` use.
- The latest CLI catches observation initialization, append, and final-manifest write errors. It preserves the first error, distinguishes received decisions from written decisions, keeps recording incomplete, and includes that status in the summary failure count. The game save precedes final manifest publication. A failure of the shared output directory can also prevent saving and summary publication; the observer cannot guarantee persistence to an unwritable destination.
- The latest manifest hashes the full current JavaScript build, an external frozen policy build when used, and a custom weights file when used. This resolves the earlier omission of executed policy dependencies from weights-only provenance.

## Actual evidence inspected

Read-only Python comparisons confirmed that `equivalence/{baseline,disabled,enabled}.json` have exactly equal non-observation content. Each contains 129 decisions, 129 accepted actions, and 1,594 wrapped action-access calls. Their choices, memory before and after each decision, access results, dispatch results and events, per-action state hashes, accepted actions, and final hash agree. The heuristic fixture makes zero RNG calls, so it provides no positive RNG evidence by itself.

The enabled heuristic payload contains 129 observations, 448 query generations, 606 query calls, 158 cache hits, and 15,900 candidate identities. All report coverage values are `QUERY_ONLY`. All candidate evaluation values are `NOT_INSTRUMENTED`. All preferred candidate IDs match the first attempted candidate ID in this fixture. Its final state hash is `sha256:cf70e6cd75c5ec927997566ad86c61d771ae43936113c89d55a0e1457dcd7b3e`.

The reviewer separately parsed `equivalence-with-rng/random-{baseline,disabled,enabled}.json`. Their non-observation content is equal, each has 33 actions and 443 RNG calls, and their file hashes match the summary. This is positive RNG evidence. Their final state hash is `sha256:11960f29b6ea95772cf7cd87f8c24bd49cbd013c94e5f022e96033889ec22a2a`. The study script asserts that a serialized save loads to the same final hash. The saved equality payload records that hash but does not independently preserve the load operation's output.

The healthy `cli/` run contains 100 unique decision identities and 100 accepted actions. Every accepted attempt's request ID joins to the same action in `match-0.save.json`. Manifest and summary agree, the saved final hash agrees, and replay is recorded as successful. The four recorded observer build hashes match the current compiled files. This healthy run predates the CLI containment and full-build-hash patch, so it is not evidence for those later CLI branches.

The later `cli-write-failure/` run records 37 received decisions, zero written decisions, `ENOSPC`, and `complete: false`. The game finishes, retains 37 accepted actions in its save, and records successful replay. Its manifest matches the summary and saved final hash. The parent identifies the injected sink as `/dev/full` and reports exit code 1. This reviewer inspected the produced artifacts but did not observe that process exit directly. Initialization and final-manifest failures were inspected in source, not separately exercised in the supplied artifacts.

The six new tests exercise a real session for truncation, cache reuse, zero budget, null choice, unavailable-session reasons, rejected preference with accepted fallback, exhausted retries, callback mutation and exception, reset identity, and driver forwarding. The unavailable-session test covers the action-access boundary because the runner correctly does not ask an inactive policy to decide. The new tests do not exercise an actual fatal dispatch, duplicate response, restore followed by observation, or both callback APIs throwing. Those are evidence limits, not claims of verified coverage.

## Resolved findings and remaining delivery work

The initial review found uncontained observation-file initialization and finalization writes in `scripts/ai-match.mjs`. The implementation now catches both and carries incomplete status into the result. The appended-file failure case is supported by the actual failure artifact above.

The initial review also found incomplete executed-build provenance for `heuristic:<file>` and `heuristic@<directory>`. The latest code adds the full current build digest and external build digest. This addresses the source finding. A healthy run using the latest CLI remains useful evidence for those newly emitted fields.

Before delivery, the owning topic document must describe the current query-only API, ID scope, callback exception semantics, and CLI incomplete-output behavior. The TODO inventory must retain the missing policy-gate behavior, its user impact, and closure evidence. Acceptance status must not infer a UI gate or P10 completion from these artifacts.

At inspection, `decisions.tsv` still ended with cross-judge pending even though the synthesis included the judge's result. The trail also omitted implementation, equivalence, CLI failure, and review resolution decisions. The local checklist still had design and implementation steps unchecked. These are trail flags for the coordinator to reconcile before reporting delivery. They do not contradict the runtime evidence, and unchecked work must not be silently reported complete.

## Comment and suppression audit

The scoped changed files are `src/ai/access.ts`, `model.ts`, `observation.ts`, `seat-runner.ts`, `driver.ts`, `scripts/ai-match.mjs`, `scripts/ai-observation-study.mjs`, and `tests/ai/decision-observation.test.ts`. The added diff contains one doc comment, the public `BotObservationOptions.onDecision` contract. It is a permitted public API comment. The new observation implementation, study script, and tests add no narrative comments. Deletion count is zero. `MUST KILL` count is zero. New suppression count is zero. Untouched legacy comments were outside the added-diff audit and were not endorsed by this review.

Type System Discipline shaped the identity review. The separate template-literal types prevent accidental query-ID and candidate-ID interchange, while the fixed coverage and evaluation literals prevent this version from claiming policy-gate evidence.

## Reviewed hashes

The base is `1ab0554c97ba89ef3089523b5f29a7c609c2a0b1`. The frozen manifest's four source hashes match `git show` at that commit. SHA-256 values below identify the reviewed working files.

| File | SHA-256 |
|---|---|
| `src/ai/access.ts` | `2b41d364bef02130370bf421a2fab490b58fc2e5ad8cdf595dea6a9957add2e6` |
| `src/ai/model.ts` | `d39cad6d1d01557aa4a76eb01a9c4d4c763cb3ad0d6b667487760d0458ad7e26` |
| `src/ai/observation.ts` | `4d19e8e6571c5935d42cc53f13b3557298bb19cd4a869518c627adcf77dc6913` |
| `src/ai/seat-runner.ts` | `a4a8f4cbcd66290baddfc1d181f1034226d00de0275c7c85aa3245387fb2c06b` |
| `src/ai/driver.ts` | `8fd6cb2f223f806bacca6b3883eed3c3826e245eef86027ee97a2a529fbe5a0c` |
| `scripts/ai-match.mjs` | `bfb1c5c2dc52f064bf44e071bfad67bf21b17700d67099097b68dcc1fdfa2eb6` |
| `scripts/ai-observation-study.mjs` | `14c90c35f0fdf46012cd97c5ee6644facd6bdbd09c90b3ac671eb9366bd6d1fc` |
| `tests/ai/decision-observation.test.ts` | `0cc406344d4f00a74a174c4e2419ec2fe93d7fc2f48bea47dea480061cf8bb1b` |

The original equivalence baseline and disabled files both hash to `6f5db986729b52f10800054013271654512b4e118ea64b4f3d9e997f65e3e9be`. The enabled file hashes to `b430e8e9811da7e0bdbacb54c0fd04317f479476b9f24e62b2b749f5bbfc5b95`. The positive RNG baseline and disabled files both hash to `2e21bb8e1075338f3db10bcb1e8931f2e64190283deeff1df911acf77bb2aa96`. Its enabled file hashes to `ef4dd27dd88a4aa93e8d8fb69294415936877f1f31eb013e351a8d09079cbd42`.
