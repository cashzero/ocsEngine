# G10 Gameplay / UI Contract Gate

## Gate result

The headless Gameplay Engine G0-G10 application slice is complete. A future UI can create/load a session, bind Seats, manage lifecycle and hot-seat privacy, obtain redacted views and legal action discovery, revalidate drafts, coordinate pending decisions, dispatch serially, subscribe to notifications, page history, inspect diagnostics, save/reload, checkpoint/undo, and export replay without importing Rule internals or receiving raw authoritative state.

## End-to-end evidence

The deterministic synthetic scenario runs through setup, Movement, Supply, Reaction, Artillery Barrage, Combat, resource reservation/commit, Retreat, Advance, Exploitation, Clean Up, the second Player Turn, and turn-limit completion using only the public `GameSession` API. The final canonical save reloads with the same state hash, history-derived events, pending state, and replay envelope.

Contract tests also prove serialized concurrent dispatch, stale/duplicate handling, listener/storage fault isolation, projection redaction, hot-seat privacy lock, strict unknown-field rejection, pending-boundary reload, checkpoint integrity/undo, corrupted-save rejection, fatal Rule isolation, bounded headless execution, complete UI-facing methods, and one-way package dependencies.

## Stop boundary

Only memory Scenario/Save/Clock/Logger adapters are supplied. React/UI rendering, browser/filesystem/Electron storage, networking, random map/OOB generation, and AI policy remain later milestones. Gameplay contains no OCS movement, supply, combat, table, or RNG calculation.

## Automated evidence

- `tests/gameplay/session-dispatch.test.ts`
- `tests/gameplay/discovery-pending-projection.test.ts`
- `tests/gameplay/history-persistence-recovery.test.ts`
- `tests/gameplay/headless-ui-contract.test.ts`
- `tests/dist-smoke.mjs`

Verified on 2026-08-30 with `npm run check`: TypeScript checking passed, 22 test files / 119 tests passed, declaration/JavaScript build passed, and the public-package smoke test passed. No percentage coverage threshold is configured; acceptance is lifecycle-, concurrency-, projection-, persistence-, replay-, recovery-, headless-scenario-, and boundary-based.
