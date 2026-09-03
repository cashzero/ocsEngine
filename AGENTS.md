# Repository working memory

## Delivery-status rule

- A reduced, placeholder, or deliberately simplified implementation is allowed only when its limitation is explicitly recorded as `TODO` or technical debt.
- Every such TODO must state the missing behavior, the user-visible impact, and the acceptance evidence required to close it.
- Never mark a step, gate, milestone, report, checklist item, or roadmap item `DONE`, `PASS`, or complete while any acceptance criterion is represented only by a placeholder or knowingly reduced implementation.
- Automated tests passing is necessary but not sufficient for a user-facing gate. Visual and end-to-end acceptance must be verified against the actual integrated flow.
- If later evidence disproves an earlier completion claim, reopen the gate immediately, preserve the evidence trail, and correct the status before continuing feature work.

The map text-label shortcut and the disconnected Map/OOB diagnostic laboratories are the repository's canonical negative example: both worked mechanically, but did not satisfy the integrated player experience and therefore must not have been reported as a completed UI/game-flow gate.

## Acceptance ownership rule

- Translate the user's requested workflow into explicit acceptance steps before implementation. An agent-created MVP or test suite must not narrow or redefine that workflow without the user's explicit approval.
- Tests written with the implementation are supporting evidence, not authority to lower the acceptance standard. Source-string assertions, element counts, isolated package tests, and headless shortcuts cannot substitute for exercising the requested product flow.
- A user-facing Game Flow is not complete until the actual UI has been operated through the requested boundary. For this repository, the minimum New Game gate is: configure visibly different Map/OOB inputs, preview them, start the same generated package, and complete at least one entire game turn through legal actions, pending decisions, and required hot-seat handoffs.
- Record every observed usability, correctness, latency, or dead-end issue from that run. A gate stays `IN PROGRESS` while any blocking issue remains.
- Never choose an easier MVP definition after the user has requested completion. Any proposed scope reduction requires explicit user acceptance and remains TODO until then.
- Use `docs/quality/03-product-operation-verification-plan.md` as the acceptance authority for the current product. Every listed operation remains `UNVERIFIED` until it is exercised at the named boundary with recorded evidence; agent-authored tests cannot promote it by inference.
