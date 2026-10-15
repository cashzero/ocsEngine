# Rule Engine contract

## Scope

The interface every client of `src/rules` relies on: state, actions, events, dice, the turn sequence, pending decisions,
transactions, queries and what each player may see. Which OCS rules are enforced, and their known gaps, is in
[rule-coverage.md](rule-coverage.md).

The Rule Engine is a headless, deterministic package. It depends on `core` and `domain` only; it never imports
`gameplay`, `ui`, `generation` or `ai` (`tests/integration/foundation-gate.test.ts`). The Gameplay session wraps it
(`docs/gameplay/`); the bot uses it only through that session ([docs/ai/architecture.md](../ai/architecture.md)).

## Current behavior

### State and actions

- `GameState` (`src/rules/kernel/model.ts`) is the whole authoritative state: schema version, revision, the static
  scenario and rule configuration, the turn sequence, map and piece state, usage ledger, current mover and moving stack,
  rules RNG, active transaction, pending decision, weather, fuel, interrupts, formation trace choices, victory, air,
  replacements, rail and sea state. Nothing else is needed to continue or replay a game.
- Every `GameAction` carries an action ID, an actor and the expected revision. `validateGameAction` checks stale revision,
  actor and locks before the action's own rules; `applyGameAction` either fails with violations and returns the same state
  (no events, no dice, no change), or succeeds, raises the revision by exactly one and returns ordered events.
- `replayRuleActions` re-applies an action log from the initial state; a game's final state and events are reproduced
  exactly. Snapshots are canonical JSON with a SHA-256 hash (`src/rules/kernel/snapshot.ts`); unknown fields are rejected.

### Dice

- The rules RNG is xorshift32 state inside `GameState` (`src/rules/kernel/rng.ts`). A die is one draw; a 2d6 roll is two
  draws and records the state before it.
- Dice are drawn only by the rule that needs them: a combat, barrage or air mission after its last decision, the weather
  and first-player rolls when the sequence reaches them, the Variable Replacement Table and Supply Table at the start of a
  Reinforcement Phase, attrition, breakout, capture and dump blowing. Validation, queries, failed actions and choices made
  before a roll never draw.

### Sequence and pending decisions

- The sequence records game turn, Player Turn index, phase, segment, phasing player and acting player; Reaction gives the
  action to the non-phasing player. `ADVANCE_SEQUENCE` is an ordinary validated action.
- Advancing keeps going past every step in which the acting player has no legal choice; this is the same as that player
  declining to act. The starting position skips the empty steps before the first real choice.
- Before a step can end: pending attrition and displacement interrupts are settled by their owner, overstacked hexes must
  shed units (4.8a), and a Breakdown with several possible absorbers asks its owner (20.0g).
- A `PendingDecision` belongs to one player and is plain serializable data. While it is open only `RESPOND_DECISION` from
  its owner is accepted. Decisions with a single option are applied at once without asking.
- The sequence runs both Player Turns, then the next turn's Weather, and ends in `COMPLETE` at the turn limit.

### Transactions

- Combat, overrun, barrage and air missions are `RuleTransaction`s: participants, target, owner, reservations, roll and
  result are frozen in the transaction, which locks unrelated actions and the sequence while it is open.
- Resource choices reserve SP; nothing is spent until the roll. The owner may `CANCEL_TRANSACTION` before the roll, which
  releases every reservation and draws nothing. After the last decision the transaction rolls, spends and resolves itself;
  there is no separate commit action for clients. After the roll it cannot be cancelled, and loss, retreat and advance
  decisions are each completed exactly once.

### Queries and explanations

- `ruleEngine` (`src/rules/engine.ts`) offers action families, bounded and de-duplicated candidates, movement ranges,
  trace and feed coverage, and `explain(action)`.
- Every query returns `allowed`, a value, stable reason codes, typed facts and the state it depends on; explanations carry
  OCS rule citations. Clients show these facts and never re-implement a rule. Cached query values never enter `GameState`.
- Facts include the forecasts clients need to choose well, such as combat odds and DRMs, supply costs, and the supply
  effect of a move, advance, retreat or rebuild. Forecasts that belong to one player are only given to that player.

### Visibility (4.9)

The viewer projection (`src/rules/query/projection.ts`) gives a player every friendly piece. Of an enemy stack it shows the
top Combat Mode unit, without lost steps or statuses, and a hidden count; hedgehogs, Air Bases and the top Active aircraft
are always seen. Internal stocks, replacements, the Dead Pile, lost trucks and another player's pending decision are never
shown to the enemy. During a combat both players see each side's total strength, odds and Action Rating difference (4.9b-c).

## Decisions

- Rules are enforced in one place. The UI and the bot read reasons and facts from queries instead of re-checking rules.
- A step with nothing to do passes by itself, and a single-option decision is applied at once, so play stops only for
  real choices.
- Dice live in the state so that replay, undo and save/load reproduce every result.

## Known gaps

Rule gaps are listed per feature in the manifest ([rule-coverage.md](rule-coverage.md)). Contract-level gaps:
none open.

## Verification

- `tests/rules/rule-engine-integration.test.ts`: a generated game played to `COMPLETE` through public actions only, then
  replayed to the same hash.
- `tests/rules/ocs-conformance.test.ts`, `tests/rules/ocs-logistics.test.ts`: sequence, locks, transactions and rule
  behavior, rule by rule.
- `tests/integration/foundation-gate.test.ts`: package boundaries.
