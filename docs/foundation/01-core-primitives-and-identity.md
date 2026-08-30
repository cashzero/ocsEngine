# Foundation F1: core primitives and identity

## Public surface

`src/core` provides:

- `Result<T, E>` with `ok`, `err`, `mapResult`, and `flatMapResult`;
- branded stable IDs for hexes, pieces, definitions, players, and scenarios;
- typed ID parsers that reject empty, padded, or control-character values;
- validated `SchemaVersion`, `Revision`, and SHA-256 `ContentHash` envelopes;
- `SourceReference` for traceable rule/scenario provenance;
- integer Supply Tokens, quarter-MP ticks, and quarter-RE ticks;
- exact display-unit conversion helpers;
- deterministic comparison, collision-safe compound keys, stable sorting, and
  duplicate-key discovery;
- typed validation issues with warning/error severity;
- minimal immutable collection replacement/update helpers.
- shared data-only typed scalar values for capabilities and runtime statuses.

## Invariants

- persistent IDs are never silently trimmed or normalized;
- exact quantities are non-negative safe integers;
- `1 SP = 4 SupplyToken`;
- `1 MP = 4 MovementPointTick`;
- `1 RE = 4 RegimentalEquivalentTick`;
- input values not exactly representable in the selected unit are rejected;
- the wrappers hold representation only and do not implement rule costs;
- compound keys are length-prefixed, avoiding delimiter collisions;
- sorting does not use locale-dependent collation and preserves equal-item order.

## Deferred

- ID allocation/catalog uniqueness belongs to aggregate validation;
- resource ledgers and arithmetic transactions belong to the Rule Engine;
- content hash calculation, canonical serialization, and migrations begin in F8;
  F1 only defines and validates their scalar envelopes.

## Proof

Focused tests cover valid/invalid IDs, JSON boundary revalidation, exact
conversion boundaries, metadata envelopes, Result composition, stable ordering,
duplicate IDs, validation severity, immutable updates, and invalid scalars.

## Completion checklist

- [x] Public identity and quantity contracts are documented.
- [x] Invalid boundary inputs return typed errors.
- [x] Exact quantities do not use floating-point state.
- [x] Ordering, key construction, and collision detection are deterministic.
- [x] Metadata, validation, and immutable update contracts are public.
- [x] Rule arithmetic remains outside Foundation.
