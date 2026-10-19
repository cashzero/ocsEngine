# Movement options and objective outcomes

This run verifies an offline join from movement observations to actual objective
control. It does not qualify a predictor, change a policy, close P10, or promote a
product-operation gate. The owning [contract](../../../ai/vp-metrics.md#移動選項與同目標結果)
and [findings](../../../ai/policy-errors.md#移動選項與實際-vp-的連結) state the current interpretation.

## Inputs and acceptance

Source base is `d7269a7`. The reusable script is `scripts/ai-movement-objectives-study.mjs`.
[results.json](results.json) binds its exact bytes, the full runtime tree, producer
provenance, equivalence summary and both input payloads. Large input/output files
remain ignored under `artifacts/ai-movement-objective-study/` and
`artifacts/ai-movement-observation-study/reproduced/equivalence/`.

The generated input reuses a complete two-turn attack fixture. The recorded input
reuses the 30-action fresh-memory continuation from the fixture snapshot described
in the [observation evidence](../ai-movement-observation-2026-10-19/README.md).
Neither input is a new match, a new policy comparison or a reconstruction of
historical policy memory. Both use run ID `equivalence`, so input identity remains
part of every group ID.

Acceptance requires exact real-session reconstruction and initial hash, every
dispatch's action/request/seat/status/revision/events/violations/post-state hash,
every observation's pre-state identity, complete accepted history, all 69 movement
groups, and preservation of the actual capture even without an assigned target.
The replay must distinguish initial holding, acquisition, actual accepted
candidate and observed/censored future endpoints.

## Observed results

Both CLI runs exited zero and replayed all 159 dispatches and accepted actions.
[results.json](results.json) records process elapsed times as execution records,
not speed comparisons. There were no console errors on these healthy runs.

| Population | Generated game | Recorded continuation |
| --- | ---: | ---: |
| Dispatches | 129 | 30 |
| Movement groups | 50 | 19 |
| Groups assigned a VP objective | 22 | 7 |
| Related objective rows | 44 | 29 |
| Rows with observed own-turn endpoint | 44 | 0 |
| Rows with observed later opponent-turn endpoint | 37 | 0 |
| Unique player/objective/own-end windows | 16 | 0 |
| Unique player/objective/opponent-end windows | 9 | 0 |
| Actual immediate captures | 0 | 1 |

The generated game's four turn closures have owners allied, axis, axis, allied,
at post-dispatch revisions 46, 61, 82, 129. The allied chooser at revision 61 chooses
second, so turn `2:0` belongs to axis. The final state is COMPLETE. Seven objective
rows lack a subsequent opponent turn because the game ended. They are censored,
not retention failures. All 44 observed own-turn rows have no new capture.

The recorded continuation ends at revision 108 in `2:0:MOVEMENT:MOVEMENT`.
It has no completed own or opponent turn. Its 29 related objective rows are
censored for both horizons. [capture-witness.json](capture-witness.json) preserves
dispatch index 1, HQ candidate `candidate:30`, accepted request, the path through
`15,4`, and the four-point control change from axis to allied. This group's
assigned target is NONE. Own-controlled VP rises by four and the objective margin
changes by eight. The future hold is unavailable despite immediate acquisition.

The only supply-exhausted group is a HUNT at nonobjective `2,9`; it has no scored
path involving an objective. These fixtures therefore contain no objective-level
supply-exhaustion contrast. Objective rows and repeated groups share outcomes.
No independent-trial count or statistical association is inferred from them.

## Endpoint proof and controls

[source-proof.json](source-proof.json) records the exact engine tree and source
references for pure `ADVANCE_SEQUENCE`. Its lifecycle hooks leave configured
objective controls unchanged. `applyFrontControl` explicitly excludes objectives;
the other control writers belong to relocation, entry, combat or transport actions.
The script binds this proof to the exact reviewed runtime tree and also asserts
before/after holder invariance. Zero net change alone is not used as proof of no
intermediate capture/recapture. Boundary event identity stays separate from the
measured post-dispatch snapshot. Other builds or action kinds receive
UNAVAILABLE_INTERNAL_BOUNDARY rather than an invented holder.

The self-test executed own-own-opponent ordering, initially held versus new
acquisition, VP and margin arithmetic, prefix and terminal censoring, rejection of
unproven internal endpoints, and selected versus accepted alternative identity.
It passed. These synthetic cases supplement the real fixture replay.

[reader-controls.json](reader-controls.json) records four actual CLI failures.
Unbound input bytes fail hash identity. A correctly rebound wrong observation
hash fails the pre-state join. A correctly rebound wrong request fails attempt
identity. A swapped turn owner in recorded events fails actual event replay.
Each exited one at the intended disagreement and wrote no result.

[fallback-control.json](fallback-control.json) records a synthetic two-decision
observation fixture derived from the recorded prefix. A real session rejects an
injected stale HQ selection, then accepts the original alternative and capture.
The output links acquisition to the accepted candidate/request, gives no control
change to the rejected request and censors future retention. This is an identity
control with manually constructed observation data, not a heuristic-produced
trajectory or evidence for policy passivity.

## Review and open scope

The local design comparison uses two sequential parent sketches. The second model
runner was rejected by the host thread limit; the Astra runner then reached its
usage limit before delivering a design. Neither failure counts as a review.
The completed [independent design review](design-review.md) required endpoint source proof, actual
accepted-alternative identity, own-own-opponent control, explicit VP formulas and
nested per-objective feature rows. Those corrections precede implementation.

[integrity-review.md](integrity-review.md) records one independent `gpt-6.1-sol`
reviewer, reused after the capacity failure. It checked source and hashes,
independently reconciled all 69 group identities and per-objective route features,
reran the self-test and four negative CLI controls, and found no blocking source
issue. It inspected positive/fallback reports rather than rerunning those CLI
replays. The comment audit found no comments, suppressions or refactor targets.
[decisions.tsv](decisions.tsv) preserves the prospective decisions, failures and
append-only correction of a transcribed count. Reduced design diversity remains
explicit; the reused reviewer counts once.

[delivery-review.md](delivery-review.md) checks the owning documents, evidence
hashes, links, trail and open statuses. It found no blocking contradiction and
performed no source edits, games, tests or builds.

No UI acceptance, full atomic gate coverage, legal alternative continuation or
cross-policy prediction is claimed. The current-build/internal-action limitation
and broader data gaps remain in `bot-decision-gate-observability` and
`bot-vp-predictive-metrics`. No build or existing policy test was repeated because
this unit changes only an offline script and documents; the real CLI and its
controls are the relevant checks.

## Reproduce

Use the exact recorded build and producer inputs. Do not substitute an unverified
build for the source-bound endpoint proof.

```sh
node scripts/ai-movement-objectives-study.mjs --self-test
node scripts/ai-movement-objectives-study.mjs --input artifacts/ai-movement-observation-study/reproduced/equivalence/enabled.json --summary artifacts/ai-movement-observation-study/reproduced/equivalence/summary.json --provenance artifacts/ai-movement-observation-study/reproduced/equivalence/provenance.json --engine dist --out artifacts/ai-movement-objective-study/generated.json
node scripts/ai-movement-objectives-study.mjs --input artifacts/ai-movement-observation-study/reproduced/equivalence/recorded-enabled.json --summary artifacts/ai-movement-observation-study/reproduced/equivalence/summary.json --provenance artifacts/ai-movement-observation-study/reproduced/equivalence/provenance.json --engine dist --out artifacts/ai-movement-objective-study/recorded.json
```

Rerun timings differ. State hashes, action outcomes and descriptive counts must
agree when source, build and inputs agree. A rerun gets its own evidence folder.
