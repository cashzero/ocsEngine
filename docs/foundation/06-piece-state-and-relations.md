# Foundation F6: Piece runtime state and relation ledger

## Runtime ownership

`PieceRuntimeState` is the revisioned aggregate for Piece instances:

```text
PieceRuntimeState
├─ Revision
├─ PieceState[]
│  ├─ Piece ID and PieceDefinition reference
│  ├─ current Player owner and one PieceLocation
│  ├─ current Face ID and remaining steps
│  ├─ OCS mode (separate from face)
│  ├─ typed statuses
│  ├─ stack-order value
│  └─ current resource quantity when applicable
└─ PieceRelation[]
   ├─ CARGO
   ├─ ATTACHMENT
   ├─ PARENT
   ├─ GROUP_MEMBERSHIP
   └─ FORMATION_MEMBERSHIP
```

Definition owns printed ratings/capacity/affiliation. State owns only facts that
can change during play. Current RE, effective strength/MA/AR/range, ZOC, supply,
stack legality, and capability effects remain derived Rule Engine values.

## Face, step, and mode

Current Face references an F5 Face Definition. Remaining steps must select a
profile belonging to that Face. Definitions without faces store both as `null`.

Ground Piece modes are `COMBAT`, `MOVE`, `RESERVE`, `STRAT`, `EXPLOITATION`, and
`DG`. Face orientation and mode are independent: entering DG or Exploitation
does not overwrite the selected Combat/Move face. F6 validates only structural
family applicability; phase/EZOC/transport transitions belong to Rules.

Movement spent, moved/finished, movement commitment, active stack, drop-off,
mission history, and phase-scoped allowances are deliberately absent until Rule
Contracts define their lifecycle.

## Status and resource state

Capabilities and statuses share the core data-only `TypedDataValue` contract:
flag, signed integer, text, Definition reference, or exact quantity with unit.
Status Definition IDs must be unique per Piece.

Resource Definitions keep printed quantity/capacity. Resource PieceState keeps
the current exact integer quantity and structural validation prevents it from
exceeding Definition capacity.

## Stack ownership

Each Piece stores one location and one non-negative `stackOrder`. There is no
second stack-membership list. `PieceStateIndex.atLocation` derives occupants and
sorts by stack order then Piece ID, leaving persistent input untouched.

Stacking limits, enemy coexistence, fog-of-war presentation, and checkpoint
legality are Rule/View concerns.

## Relation ledger

- `CARGO` owns load quantity/unit and container semantics. The cargo Piece's
  authoritative location must be `CONTAINER` with the same target.
- `ATTACHMENT` and `PARENT` are Piece-to-Piece hierarchy edges.
- `GROUP_MEMBERSHIP` and `FORMATION_MEMBERSHIP` record runtime-variable
  membership by Definition ID.

Relations have deterministic semantic keys: relation kind plus source Piece.
Updates replace a relation with the same semantic key instead of appending a
second membership.

Container location cycles and combined Attachment/Parent cycles are invalid.
Cargo quantities are positive exact integers. For the structural
`TRANSPORT_CAPACITY` declaration, loads are grouped by unit Definition and must
not exceed its typed `capacity` parameter. This checks declared storage shape;
who may load, costs, timing, capture, and capacity modifiers remain Rules.

## Validation boundaries

F6 validates:

- Piece/Player/Definition/Face/step references;
- mode/family, resource/profile, status, and stack-order structure;
- duplicate Piece IDs, statuses, stack slots, and semantic relations;
- missing/self/mismatched cargo/hierarchy references;
- cargo capacity plus container/hierarchy cycles.

Actual Hex, box, pool, player roster, and scenario membership resolution is
deferred to the F7 aggregate validator, which has all required collections.

## Deferred

- movement/mode/marker/action legality and derived ratings (Rule Engine);
- cargo load/unload costs, eligibility, capture, Extender transformations;
- attachment and group eligibility/capacity effects;
- scenario-wide reference validation and initial-state composition (F7);
- canonical JSON, migration, hashing, replay and persistence (F8+).

## Completion checklist

- [x] Definition, runtime state, derived values, and views remain separate.
- [x] Face orientation and all six OCS modes are independent.
- [x] Status/resource values use exact typed data.
- [x] Stack membership is derived from one location plus stack order.
- [x] Cargo, attachment, parent, and group relations have unique semantic keys.
- [x] Reference, cross-location, capacity, and cycle validation exists.
- [x] Updates are immutable, revisioned, and deterministically ordered.
- [x] No movement bookkeeping or rule eligibility/effects are implemented.
