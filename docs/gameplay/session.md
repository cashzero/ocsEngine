# Gameplay session

## Scope

The Gameplay Engine (`src/gameplay/`): the application layer between the Rule Engine and its clients (the browser UI, the
bot driver, headless scripts). It owns one authoritative state per session, serial dispatch, seat bindings, projections,
history, diagnostics, persistence, checkpoints, replay and notifications. Every OCS legality check and state change is
delegated to the Rule Engine ([docs/rule-engine/engine-contract.md](../rule-engine/engine-contract.md)).

## Current behavior

### Ports and boundary

- Ports: `RuleEnginePort`, `ScenarioRepositoryPort`, `SaveRepositoryPort`, `ClockPort`, `SessionLoggerPort`. Only memory
  adapters exist (`src/gameplay/adapters/memory.ts`); the browser downloads and uploads save files itself.
- Clock, latency, metrics and log data describe execution only; they never reach rule state, dice, hashes, replay or
  candidates.
- Gameplay never returns mutable `GameState` and stores no UI state (selection, hover, panels, partial drafts).
  `src/rules` never imports `gameplay`.

### Creating and loading sessions

- `GameplayEngine.createSession` checks one seat per player, a uint32 rules seed, scenario and configuration
  compatibility, and the scenario and initial-state hashes. `createStoredSession` resolves the same request through the
  scenario repository; `loadSession(text)` and `loadStoredSession(id)` restore a save. Invalid input never creates a
  partial session.
- `persistence`: `AUTOSAVE` (default) hands a full save to the save port after every accepted dispatch; `MANUAL` skips it
  (bot matches).

### Lifecycle

`READY` → `start` → `ACTIVE`; `pause`/`resume` move between `ACTIVE` and `PAUSED`; the session becomes `FINISHED` when the
rule sequence reaches `COMPLETE`; `close` (idempotent) ends it as `CLOSED`. An unexpected Rule Engine exception or an
impossible post-transition hash puts it in `FAULTED`: further interaction stops, the state stays readable through
diagnostics, and it cannot be saved as a resumable game. Only `ACTIVE` accepts dispatch. The UI exposes Pause in Menu and Resume in the command deck; neither changes the rule state.

### Dispatch

- Every request is copied on receipt and queued on one promise chain. Before the rule engine is called the session checks
  lifecycle and the privacy lock, the seat-to-actor binding, the expected revision, request-ID idempotency and accepted
  action-ID uniqueness.
- Only an accepted transition replaces the state, appends history, refreshes the hash, notifies subscribers and triggers
  persistence. Two concurrent requests at one revision: the first commits, the second gets `STALE_REVISION`. A repeated
  request ID returns `DUPLICATE` with no change; a reused accepted action ID under a new request is rejected.
- Rule rejections are counted in diagnostics, not history. Subscriber exceptions and autosave failures become warnings and
  metrics and never undo an accepted transition.

### Queries, drafts and decisions

- For a seat bound to its player: action families, bounded candidates, movement range (optionally for a moving stack),
  trace and feed coverage, supply sources, rail control, rail and sea move options, fuel coverage and preview, transport
  options and attacker supply options. Discovery is disabled while the session is not active or a hand-over is locked.
- An `ActionDraft` is only seat, base revision and a complete action; `validateDraft` reports whether it is current and the
  rule explanation. Dispatch always revalidates.
- A pending decision is shown only to its owner seat (ids, revision, kind, options) and is rebuilt identically after a
  reload. `respondToPendingDecision` sends a revision-bound response through the normal dispatch queue.

### Seats and who plays them

- A seat binding (`seatId`, `playerId`, `label`) may carry a `controller`: a person (the default, stored as no controller) or a
  computer (`BOT` with a policy id and a uint32 seed). `setSeatController(seat, controller, label?)` changes it at any time,
  notifies subscribers (`SEAT_CONTROLLER_CHANGED`) and, with autosave, saves. The controller is saved with the game, so a loaded
  save has the same computer players; a save made before computer players existed has none and loads as persons. The session
  does not play a computer seat: whoever does (the UI, a headless runner) dispatches through the same `dispatch`.

### Views and hot seat

- `getView(seat)` returns the rule projection for that seat plus session metadata; enemy redaction is the Rule Engine's.
- Hand-over is two steps: `beginHandoff` locks every view and discovery result; only the exact token passed to
  `completeHandoff` activates the next seat. Hand-over state never changes the revision or enters the save.

### History and diagnostics

- Accepted dispatches get a monotonic sequence with request, seat and action identity, ordered rule events, revisions
  before and after, timing and an event summary; pages support offset, bounded limit and action-kind filters.
- Diagnostics: lifecycle, revision and hash, pending kind, history length, rejection codes, accepted/rejected/duplicate
  counts, subscriber and persistence failures, slowest dispatch and any fatal code. Log records carry only level, code,
  session, revision and time: never hidden facts, save contents or action parameters.

### Saves, checkpoints and replay

- A save (`serializeSave`, schema 1, version `0.5.0`) holds session metadata, lifecycle, bindings, source, initial and
  final hashes, canonical initial and current rule snapshots, accepted actions with their request, seat and timing,
  and checkpoints. Rule events are regenerated from the action log, not trusted as a second record.
- Loading rejects unknown fields, malformed ids or actions, unsupported versions, bad bindings, invalid snapshots, hash
  mismatches, actions that no longer replay, a current state that disagrees with the replay, corrupted checkpoints and
  lifecycle disagreement. Versions `0.2.0`–`0.4.0` are migrated (`migrateLegacySave`): the original hash is checked,
  the snapshot upgraded, the hash recomputed and the actions replayed. `0.1.0` saves predate the rules rebuild and are
  refused with an explanation.
- A checkpoint records action index, revision, hash and snapshot, including open transactions and pending decisions.
  `undoTo` runs in the dispatch queue, verifies the snapshot, truncates later history and checkpoints, clears idempotency
  caches and returns the session `PAUSED` for an explicit `resume`.
- `exportReplay` gives the initial snapshot, the accepted actions and the boundary hashes. `loadReplay(text, bindings)` strictly decodes the file, replays every action, checks source and initial/final hashes through the save loader, and returns an active or finished session. The browser exposes Load replay in Menu; its current-scenario restriction matches Load save.
- Logistics queries and sequence preflight are described in [Logistics helpers](logistics.md).

### Headless driver

`runHeadlessCommands` runs a fixed command list; `runHeadlessSession` asks a script for the next command until the game
finishes, no command comes, a command is rejected or a budget runs out. Both use only `GameSession.dispatch` and return
accepted and rejected counts, the final revision and hash, results and the stop reason. It is a client seam, not an AI;
the bot driver is `src/ai/driver.ts` ([docs/ai/architecture.md](../ai/architecture.md)).

## Decisions

- **Gameplay holds no rule logic**: no movement, supply, combat, table or dice calculation; it only orders, records and
  exposes the Rule Engine's work.
- **No raw state for clients**: observers or debugging would need an explicit new policy rather than bypassing the
  projection.
- **Older saves are migrated, never reinterpreted**: a migration must reproduce the original hash before upgrading, so a
  save cannot silently change meaning.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `session-reload`, `load-same-scenario` (the UI side of loading),
`repl-legacy-unit-migration`.

## Verification

`tests/gameplay/session-dispatch.test.ts`, `discovery-pending-projection.test.ts`,
`history-persistence-recovery.test.ts`, `headless-ui-contract.test.ts` (complete UI-facing API, one-way dependencies),
`save-migration.test.ts`, `save-serialization.test.ts`; `tests/dist-smoke.mjs`.

- Pause/action refusal/Resume and downloaded final save/replay reproduction: [operations evidence](../quality/evidence/operations-2026-10-15/README.md), SES-01/07.
