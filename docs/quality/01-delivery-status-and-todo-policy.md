# Delivery status and TODO policy

Status is an evidence claim, not a synonym for code existing or tests passing.

## Allowed status

- `TODO`: missing, placeholder, deliberately simplified, or not yet exercised in the integrated product flow.
- `IN PROGRESS`: implementation exists, but one or more acceptance checks remain open.
- `DONE` / `PASS`: every documented acceptance condition is met and evidenced at its real integration boundary.

## Required record for a shortcut

Every accepted shortcut must record:

1. the exact missing behavior;
2. its user-visible or architectural impact;
3. why the shortcut is temporarily acceptable;
4. the test, visual check, or end-to-end exercise required to remove the TODO.

Passing unit tests cannot close a UI or game-flow TODO by itself. A player-facing gate also requires browser evidence that the generated data, active session, interactions, and visual presentation are the same integrated flow.

## Where status lives

- Acceptance rows and their status: `03-product-operation-verification-plan.md`. Count them with
  `node scripts/quality/acceptance-summary.mjs`.
- Milestone and gate status (for example M8 Generated game flow and U10 Operable UI): the milestone table in
  `docs/roadmap.md`, derived from the rows in `03`.
- Open TODOs and observed issues: `05-todo-inventory.md`.

Status is rewritten in place when evidence changes; this document does not keep dated status updates.
