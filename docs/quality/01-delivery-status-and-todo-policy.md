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

## Current reopened gates (2026-09-01)

- `U10 Operable UI`: **IN PROGRESS**. A sequence-only browser run reached Turn 2, but a real `MOVE_PIECE` selection blocked for more than 40 seconds and most player operations remain unverified.
- `M8 Generated game flow`: **IN PROGRESS**. Map/OOB values reach the mounted package, but the current build has not passed the frozen product-operation matrix.

The acceptance authority and execution order are `docs/quality/03-product-operation-verification-plan.md`.

The M6 Map generator and M7 OOB generator library gates remain complete as deterministic generation packages. Their former standalone UI laboratories are not considered proof of M8 player-flow integration.
