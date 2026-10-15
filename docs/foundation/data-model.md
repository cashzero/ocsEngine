# Foundation data model

## Scope

The structural data types every layer shares: core primitives, hex geometry, hexsides and locations, maps, piece
definitions, and piece runtime state with its relations. Rule meaning (costs, legality, effects) belongs to the Rule
Engine; this layer only stores and validates structure. Principles are in [principles.md](principles.md).

## Current behavior

### Core primitives (`src/core`)

- `Result<T, E>` with `ok`, `err`, `mapResult`, `flatMapResult`.
- Branded IDs for hexes, pieces, definitions, players and scenarios; parsers reject empty, padded or control-character
  values and never trim or normalize silently.
- Validated `SchemaVersion`, `Revision` and SHA-256 `ContentHash`; `SourceReference` for provenance.
- Integer Supply Tokens, quarter-MP ticks and quarter-RE ticks (1 SP = 4 T, 1 MP = 4 ticks, 1 RE = 4 ticks), with exact
  conversion helpers that reject values not representable in the unit.
- Deterministic comparison, length-prefixed compound keys (no delimiter collisions), stable sorting without locale
  collation, duplicate-key discovery, typed validation issues (warning or error), immutable collection helpers.
- `TypedDataValue` for capabilities and statuses: flag, signed integer, text, definition reference, or exact quantity
  with a unit.

### Hex geometry (`src/core/hex`)

- Construction, equality, canonical ID encode/parse, neighbors and opposite direction, distance, range, ring and line,
  axial/cube conversion, 60° rotation about the origin or a centre, reflection across a named cube axis, and pointy-top
  logical/pixel conversion with an explicit layout.
- Invariants (property-tested): neighbor then opposite returns to the origin; distance is symmetric and obeys the
  triangle inequality; a ring of radius r > 0 has 6r hexes and a range 1 + 3r(r + 1); a line has distance + 1 adjacent
  hexes including both ends; pixel round-trips; six rotations or two reflections are the identity.

### Hexsides and locations (`src/domain/map`)

- `DirectedHexsideRef` is `{ hexId, direction }`; it and its reciprocal normalize to one `CanonicalHexside` whose
  endpoints are in numeric axial order, serialized `first|second`. Parsing rejects malformed, non-adjacent or reversed
  IDs. Hexside feature collections hold definition IDs only, never costs or permissions.
- Map nodes, regions, tracks, boxes and piece pools have their own branded IDs.
- A piece is in exactly one `PieceLocation`:

| Tag | Payload | Meaning |
|---|---|---|
| `ON_MAP` | `hexId` | On a map hex |
| `OFF_MAP_BOX` | `boxId` | In an off-map box (reinforcements, off-map airfields) |
| `HOLDING_AREA` | `boxId` | In a holding area |
| `TURN_TRACK` | `trackId`, position | On a track position |
| `POOL` | `poolId` | In a named pool |
| `CONTAINER` | `containerId` | Inside another piece (cargo) |
| `ELIMINATED` | none | Removed (the Dead Pile) |

  No sentinel coordinates are used for off-map places. Locations sort by tag in the order above (with `ELIMINATED`
  last), then numerically by coordinate or by ID.

### Maps

- `MapDefinition` is immutable: rectangular axial bounds, sparse ordered hex records (one or more terrain definition IDs;
  typed printed-feature, facility, source and entry references), canonical hexside feature records (roads, rail, rivers,
  bridges), provenance and game-specific override IDs.
- `MapState` is the minimal mutable overlay: revision, per-hex control, and feature instances (hex or hexside location,
  kind and definition, statuses, controller, level or damage), for example port state and hedgehogs. The printed
  definition is never modified.
- `createMapDefinitionIndex` derives lookups and ordered views as a cache; neighbor lookup returns `undefined` at a real map
  edge, and a featured hexside with a missing endpoint is invalid. `mapFeaturesAt` combines printed data and state without
  interpreting them.
- Validation reports bad bounds and IDs, duplicates, empty terrain, out-of-bounds hexes, orphan edges, bad references
  and incomplete provenance; for state, bad revisions, duplicates, absent references and invalid levels. Updates
  increment the revision and keep deterministic order.

### Piece definitions

- `PieceDefinitionCatalog` (versioned, with provenance) holds `PieceDefinition`s: an engine-owned ID, family, name,
  category; nullable side, faction, nationality, formation and group references; printed faces; typed capabilities; a
  family profile; and field-level source evidence. No runtime value (location, face, steps, mode, cargo, supply) is in a
  definition.
- Families: `GROUND`, `RESOURCE`, `AIR`, `NAVAL`, `FACILITY`, `REPLACEMENT` (Pax and Eq replacement units, 13.5),
  `MARKER`, `DEFERRED` (an unreviewed import kept with its raw classification). Ground, air, naval and replacement
  definitions need at least one face; resources need an exact integer capacity profile.
- A face has a stable ID, label, optional mobility class and one step profile per remaining step from 1 to the maximum:
  strength, Action Rating, quarter-MP ticks, nullable quarter-RE ticks, range, and further printed ratings by definition
  ID. A nullable rating means "not applicable", never zero. Combat and Move faces can each describe every step.
- Capabilities are data only (an ID and typed parameters, e.g. `ATTACK_CAPABLE`, `TRANSPORT_CAPACITY`, `BREAKDOWN`); the
  Rule Engine gives them meaning.
- Each definition carries source evidence: field, raw and normalized value, source document and locator, confidence and
  review status. VASSAL GPIDs, image names or traits may appear in evidence but are never identity.

### Piece runtime state

- `PieceRuntimeState` (revisioned) holds `PieceState`s: piece ID and definition, owner, one location, current face and
  remaining steps, OCS mode (`COMBAT`, `MOVE`, `RESERVE`, `STRAT`, `EXPLOITATION`, `DG`; independent of the face), typed
  statuses (unique per piece; e.g. unit name, return turn, hedgehog level), `stackOrder`, and current resource quantity.
- Stacks are derived: each piece has one location and a stack order; `PieceStateIndex.atLocation` sorts occupants by
  stack order then ID. There is no second membership list.
- Relations, keyed by kind plus source piece (an update replaces, never appends):
  `CARGO` (quantity and unit; the cargo's location must be `CONTAINER` of the same target), `ATTACHMENT`, `PARENT`
  (e.g. a Breakdown's division), `GROUP_MEMBERSHIP`, `FORMATION_MEMBERSHIP`.
- Validation: references, mode and family, resource quantity within capacity, statuses, stack order, duplicates,
  self or mismatched cargo and hierarchy, `TRANSPORT_CAPACITY` per unit, and container and hierarchy cycles. Scenario-wide
  references are checked by the scenario validator.

## Decisions

- **No closed terrain enum**: hexes carry one or more terrain definition IDs, so game data can add terrain without
  changing Foundation.
- **Faces and modes are independent**: DG or Exploitation never overwrites the chosen Combat or Move face.
- **Stack membership is derived** from location and stack order, so it can never disagree with locations.
- **Movement bookkeeping is not Foundation state**: movement spent, moved flags and phase allowances are Rule Engine
  usage records.

## Known gaps

None open.

## Verification

`tests/core/`, `tests/domain/` (map, piece definition, piece state, relations), `tests/integration/foundation-gate.test.ts`.
