# Extraction and audit integrity review

## Scope and result

Read-only review of `scripts/ai-objective-replay.mjs`, `scripts/ai-objective-replay-verify.mjs`, `scripts/ai-objective-study.py`, the frozen contract/protocol/decision ledger, and the extractor smoke observations. The review follows the supplied original direction to read current statistical and non-statistical methods, then proceed and continue. The artifacts define the implemented unit as same-target, pre-window condition observation plus sparse retained-capture probability validation on the existing cohort. Full legal joint-plan/payability, full net-VP, prospective/cross-policy qualification, and product or policy changes remain open and are not claimed here.

The focused replay verifier passed against `/tmp/ocsEngine-objective-study-engine`. It exercised capture, release and recapture accounting; target-ID swapping; real adjacent formations; explicit leaders including AR 0; supplied-defender comparison; immutable snapshots; and observer state/event equivalence cases. The smoke observation has 1 trajectory, 1 alias, 13 windows, and 846 accepted actions. Its input, extractor, and engine hashes match the checked-in smoke worklist, current replay source, and the 208 JavaScript files in the supplied engine directory. This is structural smoke evidence only. The full 12-trajectory run is still in progress and is not assessed as failed or complete here.

## Integrity findings

- Window boundaries are keyed from the replay state's `(gameTurn, playerTurnIndex)` before each accepted action. A prior active window is reconciled as the state enters the next turn; only expected windows from the source recorder are opened, then exact window coverage is required. Start/end state hashes and revisions are retained.
- Target identity comes from configured objective hex IDs. Every configured objective is snapshotted in each window, and the Python validator requires exact target-ID and point-value coverage. Features are captured before the first action and kept separate from declaration witnesses and future labels.
- Conditional combat observations use own eligible units at actual hex distance 1 and defenders on the target. The extractor does not move units. It calls the engine odds function with the actual attacker/defender IDs, then compares supplied defenders against an empty supplied-defender list. Leaders are selected by maximum AR with an ID tie-break and passed explicitly; finite AR 0 is accepted.
- Observer-on and observer-off action applications are checked for acceptance, event digest, and resulting state hash after every accepted action. Probe state hashes are checked before/after each query. The smoke record reports 846 checked actions and 21 observer queries.
- Provenance covers the raw input worklist, compiled engine JavaScript tree, replay source, each source save/action identity, and each alias's trace, row file, and summary. The Python validator recomputes the trace/row/summary hashes and validates save/action identity before accepting observations.
- The target control ledger tracks holder transitions per action, including neutral transitions, and derives `everCaptured` separately from end-of-window `retainedCapture`. Both the replay and Python validator reconcile target-level gross objective/VP changes against recorded turn totals and signed VP changes against start/end holdings.
- The frozen protocol specifies M0–M3, the primary M3-vs-M1 Brier comparison, grouped held-out map-seed folds, calibration, and fixed-error uncertainty before new target results. The smoke file contains observations, not model results. No outcome claim is inferred from it.
- Decision trail records the frozen contract and protocol before extraction results. The supplied original directive is represented in `grounding.md` as the request to proceed after method review, while the additional “continue” instruction is present only in the supplied review context, not independently recorded in the artifact trail.

## Attention flags

1. `localeCompare` is used for the leader ID tie-break in `snapshotTargets`. It is deterministic in the current verifier environment and the fixture checks the tie case, but locale-sensitive ordering can vary with runtime locale/ICU. If the contract requires bytewise reproducibility across environments, replace this with an explicitly defined code-point/bytewise comparison before relying on cross-runtime output identity. This does not invalidate the current smoke evidence.
2. The artifact decision ledger currently stops at “required” verification, and the study TODO checklist still has implementation, full acceptance, and hand-back items open. Keep those statuses open until the full run, statistical results, and required audit trail are complete. This report does not promote them.

## Comment audit

Applied the requested `comment-sicko` audit to the three scoped scripts. No explanatory comments, TODO/FIXME comments, suppressions, or commented-out code were found; no deletions were indicated. `MUST KILL` flags: none. Skips: none within scope.

## Verification command

`node scripts/ai-objective-replay-verify.mjs --engine /tmp/ocsEngine-objective-study-engine`

Result: `PASS` for the verifier's listed focused checks.
