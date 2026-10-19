# Query provenance and dispatch observation verification

This run verifies the opt-in `QUERY_ONLY` observation unit on the source bytes in
[source-bindings.json](source-bindings.json), based on `1ab0554`. It does not verify movement scoring,
policy gates, target-control prediction, causal VP improvement, or any UI operation. P10 and
`bot-decision-gate-observability` remain open. The current research contract is
[decision-gate observation](../../../ai/vp-metrics.md#決策閘門的觀測契約).

## Inputs and expected behavior

The pre-change engine was built before source edits and copied to the ignored
`artifacts/ai-decision-observability-study/baseline-dist/` directory. [baseline.json](baseline.json)
binds its source commit and four source hashes. Two deterministic fixtures use real generated packages,
Gameplay sessions, policies, dispatches, and save/load. The heuristic fixture has two turns, attack engagement,
two divisions and one armored division per side. The random-legal positive control has one turn and one
non-armored division per side. Full requests and seeds are in the ignored execution payloads.

Expected behavior is exact equality between the frozen engine, current engine with observation disabled,
and current engine with observation enabled. The check compares policy choice, phase memory before and after
every decision, ordered action-access and RNG calls with result hashes, actual dispatch status and events,
every post-action state hash, and accepted action logs. Each saved game must reload to the same final hash.
Elapsed timings are not compared.

Observation rows must reconcile to the access calls and their ordered returned actions. Query reuse must
preserve identity and cache-hit status. Choice, alternatives and attempts must resolve to their actual actions.
The query report declares policy evaluation uninstrumented, including for candidates never selected.
Before implementation, the harness failed on the intended feature boundary, `0 !== 129` observations.

## Observed result

[equivalence.json](equivalence.json) records the final executable comparison and raw payload hashes.
The heuristic fixture completed 129 actions and 1,594 access calls. It produced 448 query generations,
158 cache hits and 15,900 candidate identities. These are returned candidates within decision-local searches,
not a count of unique legal opportunities across the game. The heuristic fixture made zero RNG calls.
The random-legal control completed 33 actions and 443 actual RNG calls. Both fixtures matched the frozen
baseline with observation disabled and enabled. Query, candidate, choice and attempt reconciliation passed.
No VP increase is claimed.

[checks.json](checks.json) records a successful build, typecheck and 19 tests in four AI test files.
The six new cases include actual zero-budget truncation, cache reuse, null choice, unavailable session,
rejected preference with accepted fallback, exhausted attempts, detached callback data, callback exception
after bookkeeping, reset identity and driver forwarding. Fatal dispatch, duplicate response and observation
after an actual restore are not separately exercised by these new cases.

[cli-checks.json](cli-checks.json) records the actual CLI runs and save hashes:

- Healthy output finished 100 actions, saved and replayed, wrote 100 observations, and exited 0.
  All accepted request IDs join to the same saved actions.
- Append failure used a task-owned observation-file symlink to `/dev/full`. It finished and saved 37 actions,
  replayed successfully, marked zero written observations and `ENOSPC`, and exited 1.
- Initialization failure used a directory at the task-owned observation-file path. It finished and saved
  37 actions, replayed successfully, marked `EISDIR` and incomplete recording, and exited 1.
- Final-manifest failure made the initial manifest read-only after it was created. It finished and saved
  132 actions, replayed successfully, marked `EACCES` in the summary and exited 1. The manifest on disk
  remains its initial incomplete version. The summary carries the received and written counts.

These cases isolate observation sinks. They do not establish persistence to an unwritable shared output
directory or contain exceptions from the separate legacy trace callback. Full saves, JSONL records and
execution payloads remain ignored under `artifacts/ai-decision-observability-study/`.

## Reproduce

Use a build of `1ab0554` as the frozen baseline. If the local captured build is unavailable, create a detached
worktree at that commit, install its locked dependencies and build it. Then run the current source:

```sh
npm run build
npm run typecheck
npx vitest run tests/ai/seat-runner.test.ts tests/ai/bot-driver.test.ts tests/ai/heuristic.test.ts tests/ai/decision-observation.test.ts
node scripts/ai-observation-study.mjs --baseline artifacts/ai-decision-observability-study/baseline-dist --out artifacts/ai-decision-observability-study/equivalence-final
node scripts/ai-match.mjs --matches 1 --parallel 1 --turns 2 --divisions 2 --armored 1 --engagement ALLIED_ATTACKS --allied heuristic --axis heuristic --observe-decisions --out artifacts/ai-decision-observability-study/cli-final
```

The CLI manifest binds every runtime `.js` file in the current build by sorted relative path and SHA-256,
plus external policy build or weights-file inputs when used. Run IDs vary between executions. The study's
behavior comparison excludes observations and elapsed timings, preserving the same engine seeds and actions.

## Independent review and decisions

[implementation-review.md](implementation-review.md) is the independent `gpt-6-astra` source, artifact,
comment and trail review. It found recording containment and build-provenance gaps that were corrected.
It inspected earlier equality payloads and the append-failure run. Its reviewed source hashes identify exactly
which bytes it saw; the final script adds candidate/attempt reconciliation and records actual request IDs.
The final equality payload hashes differ for that reason. It did not independently rerun games or tests.

[design-judge.md](design-judge.md), [synthesis.md](synthesis.md), and [decisions.tsv](decisions.tsv) preserve
the design choice and accepted deviations. The owning TODO retains missing policy conditions, search coverage,
objective joins and continuation evidence. No existing acceptance row was promoted by this headless research.
