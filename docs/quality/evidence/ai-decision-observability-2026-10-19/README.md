# Decision-gate data availability audit

Boundary: read-only source-contract and historical-trace inspection on `c996680`. No code or policy change,
new match, new replay, or UI acceptance. This records a missing prerequisite for P10; P10 remains open.
The owning contract is [decision-gate observation](../../../ai/vp-metrics.md#決策閘門的觀測契約).

The prior method table claimed that the decision trace already recorded every candidate's penalties. The actual
seat-runner serializes the policy first choice's intent, score and breakdown plus attempted dispatch rejections.
The action field is the final attempted action. If a fallback is used, those scores still describe the initial
choice, not necessarily the accepted action. The standard
heuristic caps its alternative action list at three, and the trace does not serialize even that list or its scores.
Dispatch rejection is not a census of candidates rejected or downgraded inside policy evaluation.

[trace-contract.json](trace-contract.json) binds the current source hashes and one existing trace's SHA-256.
The inspected source is the original attack-temperate trace in the `v84-development` folder. All 872 rows have the
same field set. All have `attempts = 1` and status `ACCEPTED`, so this trace has no fallback attribution mismatch. They contain breakdowns, but none contains candidate scores, rankings, or alternatives. The recorded
assault move toward target `13,15` has progress and exposure terms for that decision. It has no rejected-candidate
comparison from which to count which alternatives exposure prevented.

P8 was registered with trace disabled. Its accepted-action metadata contains seat ID, request ID and times,
not decision reasons or candidate scores. The existing P8 metadata cannot supply the missing gate data.

Expected result was to identify whether P10 could directly analyze complete candidate conditions. Observed result
is that it cannot. Source and file inspection completed without a runtime error. This is a contract audit, not a
measurement of candidate rejection frequencies or a claim that the policy chose the wrong move. It does not establish
why a policy's geometric opportunities failed to become retained VP.

Recheck the bound trace from the repository root:

```sh
python3 - <<'PY'
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
print('872 rows verified; candidate census unavailable')
PY
```

Missing behavior, research impact and closure evidence are tracked by `bot-decision-gate-observability` in the
[TODO inventory](../../../quality/05-todo-inventory.md). The required future observation must retain candidate
identity, generation and evaluation denominators, all evaluated conditions, explicit not-evaluated conditions after short circuits, the first failed condition in execution order, the policy first choice and the actual accepted action, reconcile them to rules
or scoring witnesses, and prove observation does not change choices or state/event hashes. Causal VP improvement
still requires separate continuation comparisons.

An [independent source and artifact review](review.md) verified the trace, source bindings and one actual P8 save. Its general fallback-attribution correction is incorporated here and in the owning contract. Its reviewed documentation hashes identify the pre-correction bytes, not the final documents. Search-budget and short-circuit semantics are requirements for future instrumentation, not claims of implemented observation.
