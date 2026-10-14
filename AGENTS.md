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

## Documentation maintenance rule

Documents describe the current product, not the history of the work. Git history is the change log.

- When a behavior, contract, design decision, or status changes, update the owning topic document in the same commit as the code. Rewrite the affected section so it states the current truth. Do not append `Update YYYY-MM-DD` blocks, dated addenda, "superseded by" notes, or a per-document change history.
- Do not create dated or per-session narrative files (`<topic>-YYYY-MM-DD.md`, reviews, rebuild notes, verification write-ups). A finding that still matters goes into the owning topic document; the story of how it was found goes into the commit message.
- Every fact has exactly one home:

  | Content | Home |
  |---|---|
  | Behavior, contracts, design, and the decisions behind them | the topic folder: `foundation/`, `rule-engine/`, `gameplay/`, `ui/`, `game-flow/`, `generator/`, `oob/`, `ai/` |
  | Acceptance rows and their `PASS` / `FAIL` / `UNVERIFIED` status | `docs/quality/03-product-operation-verification-plan.md` |
  | Open TODOs and technical debt | `docs/quality/05-todo-inventory.md` |
  | Plans and work breakdowns | `docs/roadmap/` (mark items open/done in place; results go to the topic document) |
  | Text record of an acceptance run: commit, inputs, expected and observed result, timings, console errors, final state | `docs/quality/evidence/<run>/`, immutable; see its README |
  | Screenshots, traces, match logs, large saves and replays | the gitignored `artifacts/` folder, never committed |
  | Reusable acceptance, measurement and analysis scripts | `scripts/` |
  | Published rules and external references | `docs/rules/`, `docs/study/` |

- A topic document has these sections as applicable: Scope; Current behavior (the contract); Decisions (what was chosen and why, including rejected alternatives that must not be retried); Known gaps (IDs from `05`); Verification (links to `03` rows and evidence folders). Other documents link to it instead of restating it.
- Name files by subject. No dates, session names, or version numbers in file names (evidence folders excepted).
- Visual acceptance still requires screenshots: produce them in `artifacts/`, review them, and write what they show into the text record. Do not commit them.
- When code and a document disagree, the document is wrong: fix it before continuing. Delete obsolete documents or sections instead of leaving the first draft in place.
- The delivery-status rule's "preserve the evidence trail" is satisfied by git history and `docs/quality/evidence/`; it does not require keeping disproven text in a topic document. When a claim is disproven, rewrite the status in place and state the evidence that disproved it.
