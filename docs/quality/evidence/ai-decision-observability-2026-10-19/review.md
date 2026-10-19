# Decision observation contract review

Review boundary is the unstaged documentation at HEAD `c9966802fe11eb53b6e3b18afde6c57cd9ae08ba`, existing source, and existing artifacts. No source edit, new game, replay, UI run, causal experiment, or candidate-frequency measurement occurred. This independent review supplies architecture grounding for P10 and does not close P10 or a product gate.

## Findings

1. Correct the general attribution of `intent`, `score`, and `breakdown` before committing. `src/ai/seat-runner.ts:167-192` dispatches the initial `decision.action` followed by bounded alternatives. It serializes `trace.action` as the last attempted action, which is the accepted fallback on success. The other three fields always come from the initial policy decision. The current owning contract, TODO row, roadmap P10, evidence README, and JSON interpretation use variants of "selected decision" without explaining this distinction. A reader can associate an initial choice's score with an accepted fallback. Record "initial policy choice" for those fields and distinguish it from the final dispatch action. Future P10 observation must preserve both identities. This is a contract wording finding rather than a policy behavior defect.
2. The missing-candidate prerequisite is supported. `src/ai/policies/heuristic.ts:151-153` stores at most three action-only alternatives. `src/ai/model.ts:61-68` provides no candidate scores, gate outcomes, or ranking in `BotDecision`. `src/ai/seat-runner.ts:189-193` serializes neither that alternatives list nor additional policy candidate information. Its `rejections` contain attempted dispatch failures, not policy-filter outcomes. The evidence correctly refuses to infer blocking frequencies or causal VP effects.
3. P10 remains open in the roadmap. The TODO row specifies missing behavior, research impact, and closure evidence. No reviewed document marks candidate observation or its acceptance complete. The fault-tree method table correctly treats the existing E6 selected-move terms as a case locator rather than a full candidate census. Its continuation requirement preserves the distinction between a negative score term, an observed filter outcome, and a causal improvement.
4. Tighten future "all conditions" semantics during implementation. Existing policy evaluation short-circuits. For example, `bestCombat` skips disallowed actions, unfunded overruns, absent forecasts, and low odds before applying later score terms at `heuristic.ts:1151-1205`. A gate not evaluated after a prior failure cannot be reported as false or absent. Either observe all applicable conditions without affecting behavior, or record explicit `not evaluated` outcomes and keep complete-condition acceptance open. A recorded first failing condition is evaluation order, not an exclusive cause. The TODO correctly asks for simultaneous-condition examples and independent continuation checks.

## Executed artifact checks

The README Python check was executed, with additional assertions for the three `sourceBindings`, the selected sample, breakdown count, retry rows, and P8 registration. Exit code was 0. The exact bound trace SHA-256 is `99f22309b5aaf099ecff1d403980c470c17c485b5815a3abad02d829c52e3e6b`.

Observed 872 trace rows. Every row has the recorded field set and a breakdown field. No row has `candidates`, `candidateScores`, `rankings`, or `alternatives`. All three source hashes match. Every row is `ACCEPTED` with `attempts = 1`, so this trace has no fallback mismatch and its sample ordinal 14 matches every recorded sample field. These checks establish what this trace contains. They do not establish which unrecorded candidates existed or why they lost.

Both commands in the P8 registration omit `--trace`. `scripts/ai-match.mjs:26,55,138-141` defaults tracing to false and registers `onDecision` only when enabled. The P8 artifact root is `.claude/worktrees/ai-truck-shuttle`, as also recorded by the prior transfer input audit. One actual P8 save was inspected at `.claude/worktrees/ai-truck-shuttle/artifacts/ai-surrogacy/contactBad-double/attack-temperate/match-1600001.save.json`. Its SHA-256 is `173eea7d72d4161c53036c283f8b3c4fe6ccb48e3ba8ceab2234601a8941b94f`. All 726 accepted-action metadata records contain exactly `acceptedAtMs`, `durationMs`, `requestId`, and `seatId`. This agrees with `src/gameplay/session.ts:676-678`. Accepted actions and snapshots exist elsewhere in the save, but this metadata does not preserve policy alternatives or gate conditions. This was a one-save metadata check, not a census of all P8 files.

The executable trace check was:

```sh
python3 - <<'PYCODE'
import hashlib
import json
from pathlib import Path
record = json.loads(Path('docs/quality/evidence/ai-decision-observability-2026-10-19/trace-contract.json').read_text())
path = Path(record['traceFile'])
assert hashlib.sha256(path.read_bytes()).hexdigest() == record['traceSha256']
rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
assert len(rows) == 872
assert all(sorted(row) == record['fieldNames'] for row in rows)
assert not any('candidates' in row or 'candidateScores' in row or 'rankings' in row or 'alternatives' in row for row in rows)
assert sum('breakdown' in row for row in rows) == record['rowsWithBreakdown']
for source, expected in record['sourceBindings'].items():
    assert hashlib.sha256(Path(source).read_bytes()).hexdigest() == expected
sample = next(row for row in rows if row['ordinal'] == record['sample']['ordinal'])
assert all(sample[key] == value for key, value in record['sample'].items())
assert all(row['status'] == 'ACCEPTED' and row['attempts'] == 1 for row in rows)
print('872 rows verified; candidate census unavailable; source bindings and sample match; no fallback rows')
PYCODE
```

## Architecture grounding for P10

`BotActionAccess` is the policy's boundary for current-seat, current-revision queries. `src/ai/access.ts:19-24` caches queries by action kind, piece, and budget, and retains only the returned `.actions`. Its default candidate budget is 400. It discards any candidate-query completeness information. Combat explicitly requests budget 200 at `heuristic.ts:1470`. Movement separately limits relocation-supply corrections to 12 promising candidates at `heuristic.ts:1046-1050`. A census of generated, evaluated, and truncated candidates therefore needs separate denominators and scope, rather than the label "all legal moves".

The policy owns tactical filters and scores. Movement compares each scored destination against a stay score, sorts improving moves, checks supply until the first survivor, updates planning memory, and returns at `heuristic.ts:1026-1082`. Combat has rule-validation and policy thresholds before score comparison. Instrumenting only the seat runner cannot recover these internal paths. Instrumenting only candidate queries cannot recover all policy-generated conditions or priority decisions either.

The seat runner owns actor selection, phase memory, seeded policy RNG, fallback dispatch, and final trace emission. Future observations need a stable decision identifier with revision, seat, phase, candidate identity, generation scope and budget, evaluation status, condition witness and order, score terms where defined, initial policy choice, attempted actions, and actual accepted action. Join objective-related candidates to the same objective's later control events before describing conversion or retention. Keep generated-but-unscored, legal-but-unselected, and search-truncated cases distinguishable.

Observation must preserve action order, rule-acceptance results, emitted events, state hashes, policy memory effects, and RNG consumption with observation enabled and disabled. Extra queries or eager evaluation can change caches, planning state, and cost even when final hashes match. The present review does not test that property. Counterfactual continuation remains necessary for causal VP claims after the observation gap closes.

Type System Discipline shaped the contract recommendation to give policy choice, dispatch attempt, and accepted action distinct identities. The how review located each responsibility at its actual source boundary. Technical writing and unslop shaped the separation between measured artifact facts and future acceptance requirements.

## Reviewed hashes

Hashes below identify the reviewed bytes before any root-agent correction.

| File | SHA-256 |
|---|---|
| `scripts/ai-match.mjs` | `f12267cf106747487504baff605d8b849d630a5eb59b5728c7c66baca27a65a4` |
| `src/ai/seat-runner.ts` | `8641e64f675b1d7e03099d8946bda42d66e9d817c0c47f8588d6e3b9091d05b8` |
| `src/ai/policies/heuristic.ts` | `84710117e3106750bec4ae6a0214a33b47442afc5d106226953d9128425ebbdc` |
| `src/ai/model.ts` | `0aeaf590e5e4e0bfa922b9f3daa0f8ef23b5f417f78e981b318545db4034d521` |
| `src/ai/access.ts` | `c693d40157ff2e5784c893e8f673d03b36a1aadc9cb53517fe90ff855c45593b` |
| `src/gameplay/session.ts` | `470562782e05435619660dbf0c13afa8795616a65fdaeb4e6d7be680c542afd6` |
| `docs/quality/evidence/ai-position-surrogacy-2026-10-19/registration.json` | `df9ce9f264632da0542fad7210043ede1449bc2c32d2f5ddc257973848609557` |
| `docs/ai/vp-metrics.md` | `cb899e3e34f449a146436e2df5c43f00a4fa07940338ebecee41a97a8a00624e` |
| `docs/quality/05-todo-inventory.md` | `90629d6ad73848df81f09930537319632e27bb6ab0abeb09a8ad4c454c6d1cee` |
| `docs/roadmap/18-position-metrics-wbs.md` | `789d1da021fc54fb80765305e8dc13237cceaf5939ebdbf41e2f09680745378f` |
| `docs/quality/evidence/ai-decision-observability-2026-10-19/README.md` | `cc0d16bb1a1fb08bc08d346e4a1c86648dae1963cc80624560ecb7d837cf1323` |
| `docs/quality/evidence/ai-decision-observability-2026-10-19/trace-contract.json` | `02112fedc068b8998f94df86e1c4eb1b7b3e87898d4ed267456383eaf3135134` |
