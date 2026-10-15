# Foundation principles

## Scope

The vocabulary, package boundaries and data rules every layer follows. The data structures are in
[data-model.md](data-model.md); scenarios, serialization and fixtures in
[scenario-and-serialization.md](scenario-and-serialization.md).

## Current behavior

### Glossary

Normative for Foundation and later layers; game-specific terms may extend it but never redefine an entry.

| Term | Definition |
|---|---|
| Piece | Any independently identified physical or informational object in game state |
| Unit | A Piece representing a military formation (ground, air or naval) |
| Counter | A presentation form, not a domain superclass; it may depict a Unit, Marker or Facility |
| Marker | A Piece that records or communicates state and is not a Unit |
| Facility | A Piece representing an installation or logistical asset rather than a formation |
| Definition | Immutable, scenario-stable printed or source data |
| State | The minimal authoritative facts that change during play |
| Derived value | A value calculated from definition, state, rules and configuration; never stored as authority |
| View | A viewer-specific projection of authoritative information, with concealment applied |
| Hex coordinate | A pointy-top axial `(q, r)` logical map position |
| Hex ID | The canonical serialization `q,r` of a hex coordinate |
| Hexside | The canonical shared edge between two neighboring hexes |

### Package direction

```text
core -> domain -> rules -> gameplay -> ui / generation / game-flow / ai
```

- `core`: dependency-free identity, exact scalars, validation, ordering, hex geometry.
- `domain`: map, piece and scenario data structures and their structural validation; no rule decisions.
- `serialization`, `testing`: strict loading, canonical JSON, hashing, migration seam; deterministic fixtures.
- `rules`, `gameplay`: legality and transitions; session orchestration, logs and replay.
- UI, generators, game flow and AI consume public projections and never own authoritative state.

Foundation code imports no React, browser API, UI state, generator, AI or gameplay code, and no BCS domain or rule module.
`tests/integration/foundation-gate.test.ts` enforces the direction by scanning every import.

### Definition, state, derived, view

- Definitions hold immutable printed or source facts shared by every run of a scenario.
- State holds only what can change during play.
- Derived values (current RE, effective strength and MA, ZOC, supply status) are calculated by the Rule Engine from
  definition, state and configuration, and never copied into state.
- Views are player- or observer-specific projections and may redact.
- Updates are immutable: a change produces a new state graph and never mutates its input.

### Exact quantities

Supply is integer Tokens (4T = 1 SP), movement integer quarter-MP ticks, stacking integer quarter-RE ticks. Floating point
is for input and display only and must convert exactly; a value that cannot is rejected.

### Hex orientation

Pointy-top axial `(q, r)` with implicit cube `s = −q − r`; directions in the order NE, E, SE, SW, W, NW; east is
`(q + 1, r)` and north-east `(q + 1, r − 1)`; canonical ID `q,r` without whitespace, leading zeros or `-0`; layout size
is centre-to-corner radius, and origin and size are explicit inputs, never globals. Printed four-digit hex numbers are a
presentation label derived from the coordinate (`printedHexLabel` in `src/ui/presenter.ts`), never an identity.

### Errors

Parsing and validation return typed `Result`s with stable codes and data; UI text is never an identity. Invalid
programmer configuration may throw `RangeError`; expected content errors never use exceptions for control flow.

## Decisions

- **One-way dependencies** so the rules can be tested without any UI, generator or session.
- **No derived values in state**, so a save can never disagree with the rules that read it.
- **Integer quantities** so quarter-MP and quarter-RE arithmetic is exact and replays are byte-identical.
- **The BCS hex convention, without BCS code**: `bcsEngine`'s pure geometry convention was adopted for compatibility; its
  terrain, movement, LOS, global map and UI code were not reused, and production code contains no BCS-specific terms
  (checked by the Foundation gate test).

## Known gaps

None open.

## Verification

`tests/integration/foundation-gate.test.ts` (import direction, BCS vocabulary scan), `tests/core/`.
