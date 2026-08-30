# Foundation F0: vocabulary and architecture decisions

## Scope

This document freezes the vocabulary and dependency rules needed by Foundation
F1–F6. Scenario aggregation begins in a later Foundation stage and is not part
of this implementation slice.

Normative F0 documents are split for reviewability:

- [`00-glossary.md`](00-glossary.md)
- [`adr/001-package-boundaries.md`](adr/001-package-boundaries.md)
- [`adr/002-definition-state-derived-view.md`](adr/002-definition-state-derived-view.md)
- [`adr/003-hex-orientation.md`](adr/003-hex-orientation.md)

Implemented Foundation contracts:

- [`01-core-primitives-and-identity.md`](01-core-primitives-and-identity.md)
- [`02-hex-geometry-contract.md`](02-hex-geometry-contract.md)
- [`03-hexside-and-location-model.md`](03-hexside-and-location-model.md)
- [`04-map-definition-and-state.md`](04-map-definition-and-state.md)
- [`05-piece-definition-catalog.md`](05-piece-definition-catalog.md)
- [`06-piece-state-and-relations.md`](06-piece-state-and-relations.md)

## Vocabulary

| Term | Meaning | Owner |
|---|---|---|
| Hex coordinate | Logical pointy-top axial `(q, r)` location | `core/hex` |
| Hex ID | Canonical serialized coordinate `q,r` | `core/hex` |
| Hexside | Edge shared by two neighboring hexes | Foundation F3 |
| Piece | Top-level physical or informational game object | Foundation F5–F6 |
| Unit | Ground, air, or naval Piece with unit-specific data | Foundation F5–F6 |
| Definition | Scenario-stable printed/source data | Foundation |
| State | Minimal authoritative data that changes during play | Owning domain/runtime aggregate |
| Derived value | Value calculated from definition, state, rules, and configuration | Rule Engine |
| View | Viewer-safe projection of authoritative data | Rule/Gameplay boundary |

## Architecture decisions

### Package direction

```text
core -> domain -> rules -> gameplay -> ui/generation/ai
```

`core` imports no higher layer. Foundation code contains no React, browser,
generator, AI, phase, movement, ZOC, supply, or combat dependency.

### Hex orientation

- pointy-top axial coordinates;
- direction order: `NE`, `E`, `SE`, `SW`, `W`, `NW`;
- `(q + 1, r)` is east and `(q + 1, r - 1)` is north-east;
- size means center-to-corner radius;
- layout origin and size are explicit function inputs, never globals.

This matches the pure geometry convention observed in `bcsEngine`, while the
implementation is separated from BCS types, constants, movement, LOS, and map
rules.

### Definition/state/derived/view ownership

- printed values will live in immutable definitions;
- mutable facts will live in state;
- current RE, effective MA/strength, ZOC, and supply status will be derived;
- viewer redaction will create a separate projection;
- no derived or view field is duplicated into persistent Foundation state.

### Error handling

- parse/validation boundaries return typed `Result` values;
- invalid programmer configuration may throw `RangeError`;
- errors use stable codes and data, not UI text as identity.

### Exact quantities

- Supply is stored as integer Tokens (`4T = 1 SP`);
- movement is stored as integer quarter-MP ticks;
- RE is stored as integer quarter-RE ticks;
- floating-point values are presentation/input only and must convert exactly.

## Non-goals for F0–F6

- scenario aggregates, persistence, and rules;
- phase/state/action/reducer contracts;
- movement cost, pathfinding, stacking, ZOC, supply, combat, UI, generation, AI;
- copying BCS rule utilities or UI code.

## Completion checklist

- [x] Vocabulary and dependency direction are explicit.
- [x] Hex orientation and direction order are fixed.
- [x] Definition/state/derived/view ownership is fixed.
- [x] Exact quantity representation is fixed.
- [x] F0–F6 non-goals and stopping point are explicit.
