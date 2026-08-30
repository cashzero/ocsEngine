# Foundation F3: hexside and location model

## Scope

F3 adds structural identities between hex geometry and later map/piece schemas:

- directed and reciprocal hexside references;
- canonical, direction-independent Hexside IDs;
- a rule-neutral edge feature collection;
- map node, region, track, box, and Piece pool IDs;
- seven tagged Piece location variants;
- location structural validation and deterministic ordering.

## Hexside contract

`DirectedHexsideRef` is `{ hexId, direction }`. Its reciprocal starts at the
neighboring hex and uses the opposite direction. Both references normalize to a
`CanonicalHexside` whose endpoint Hex IDs are ordered by numeric axial `(q, r)`.

Canonical serialization is `firstHexId|secondHexId`. Parsing rejects malformed
IDs, invalid Hex IDs, non-adjacent endpoints, and reversed/non-canonical order.

`HexsideFeatureCollection` associates a canonical Hexside ID with immutable
Definition IDs. It does not contain crossing costs, movement permissions, bridge
state, or other rule results; F4 owns map definition/state and the Rule Engine
interprets features.

## Place identity

Map nodes, regions, tracks, boxes, and Piece pools use distinct branded IDs.
Their parsers reject empty values, surrounding whitespace, and control
characters without silently normalizing persistent identity.

## PieceLocation variants

| Tag | Payload | Meaning |
|---|---|---|
| `ON_MAP` | `hexId` | Occupies a logical map Hex. |
| `OFF_MAP_BOX` | `boxId` | Occupies a true off-map box. |
| `HOLDING_AREA` | `boxId` | Occupies a holding/congestion area. |
| `TURN_TRACK` | `trackId`, non-negative integer `position` | Occupies a track position. |
| `POOL` | `poolId` | Occupies a named available/draw/resource pool. |
| `ELIMINATED` | none | Is removed from active locations. |
| `CONTAINER` | `containerId` | Is structurally located inside another Piece. |

Map positions use Hex IDs. Boxes, tracks, pools, and eliminated state never use
sentinel/fake coordinates.

Structural validation checks canonical references, turn-track positions, and
direct self-containment. Cross-Piece container cycles, capacity, attachment and
transport legality belong to F6 and the Rule Engine.

## Deterministic ordering

Location tag order is `ON_MAP`, `OFF_MAP_BOX`, `HOLDING_AREA`, `TURN_TRACK`,
`POOL`, `CONTAINER`, `ELIMINATED`. Within a tag, coordinates use numeric axial
order, IDs use code-unit text order, and track positions use numeric order.

## Layer boundary and deferred work

- map bounds, terrain and Hex/Hexside containers are layered in F4;
- Piece Definition catalog and runtime state are layered in F5–F6;
- edge crossing cost, stacking, movement, entry and container legality (Rules);
- schema parsing, migrations, and canonical aggregate serialization (F8).

## Completion checklist

- [x] Reciprocal directed edges normalize to one canonical Hexside ID.
- [x] Canonical parser rejects invalid, non-adjacent, and reversed edges.
- [x] Edge feature storage contains no rule cost.
- [x] Place identities and all seven location tags are explicit.
- [x] Location validation and ordering are deterministic and rule-neutral.
- [x] F4+ behavior remains outside this slice.
