# R1 Reducer, Action, Event, and RNG Contract

`GameState` is the complete authoritative Rule envelope: schema/revision, static Scenario, Rule configuration, turn sequence, current Map/Piece states, usage, current mover, RNG, active transaction, pending decision, and victory state.

Every `GameAction` has a stable action ID, actor, and expected Revision. `validateGameAction` applies common stale/actor/lock checks before action-specific rules. `applyGameAction` is atomic: failure returns the identical state reference, no events, no RNG draw, no reservation, and no nested mutation. Success increments GameState Revision exactly once and returns stable event order local to that transition.

The xorshift32 Rule RNG is explicit state. A two-die roll consumes exactly two draws and records before/after state. Only transaction commit may draw; declaration, validation, choices, cancellation, and failed actions cannot.
