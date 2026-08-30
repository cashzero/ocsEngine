# Foundation F5: Piece definition catalog

## Scope and ownership

F5 defines immutable, versioned Piece source data. A Piece Definition describes
what a counter/unit/resource/facility/marker is; F6 PieceState will describe a
particular runtime instance.

```text
PieceDefinitionCatalog (SchemaVersion)
└─ PieceDefinition
   ├─ engine-owned Definition ID, family, name, category
   ├─ side, faction, nationality, formation/group affiliation
   ├─ zero or more printed faces
   │  └─ one or more remaining-step profiles
   ├─ typed capability declarations
   ├─ family-specific resource/facility/marker profile
   └─ field-level normalization evidence
```

No definition contains current location, face, step loss, mode, marker state,
cargo, attachment, supply status, or other runtime/derived value.

## Families

The initial families are `GROUND`, `RESOURCE`, `AIR`, `NAVAL`, `FACILITY`,
`MARKER`, and `DEFERRED`.

- `RESOURCE` requires an exact integer printed-quantity/capacity profile and referenced
  resource/unit definitions.
- `FACILITY` and `MARKER` require their corresponding type definition.
- `DEFERRED` preserves a non-empty raw classification until reviewed.
- Ground, Air, and Naval definitions require at least one printed face.

Side, faction, nationality, formation, and group are nullable Definition
references so neutral markers and unassigned imports do not require sentinel
identities. Current runtime owner is intentionally absent and belongs to F6.

The deferred family quarantines unknown imported pieces without guessing OCS
semantics. It is not an eligibility wildcard.

## Faces and step profiles

Faces have stable local Face IDs, a label, optional mobility-class Definition,
and an arbitrary number of step profiles. Step profiles are keyed by positive
`remainingSteps` and must cover every value from one through maximum steps.

Normalized common ratings include combat strength, Action Rating, exact
quarter-MP ticks, nullable exact quarter-RE ticks, and range. Additional printed
ratings use Definition IDs plus finite number/string values. Nullable ratings
mean “not applicable”; they are not silently converted to zero.

This deliberately does not assume a front/back or full/reduced model. Combat and
Move orientation can each describe every multi-step state required by the
source counter.

## Capabilities

Capabilities contain a stable Capability ID and typed data-only parameters:

- `FLAG`;
- signed safe `INTEGER`;
- non-empty `TEXT`;
- `DEFINITION_ID` reference;
- non-negative integer `EXACT_QUANTITY` with a unit Definition ID.

Declarations such as `ATTACK_CAPABLE` or `TRANSPORT_CAPACITY` state data only.
They contain no function, eligibility predicate, effect handler, or BCS/VASSAL
command. The Rule Engine owns their meaning.

## Source and normalization evidence

Each Definition contains at least one field-level evidence record with:

- field name;
- unmodified raw value;
- reviewed normalized value;
- source document and locator;
- confidence;
- review status.

Engine-owned Definition IDs remain authoritative. A VASSAL prototype, `gpid`,
piece-slot path, image filename, or trait may be retained in evidence, but never
becomes identity or executable rules. OCS/game rules are authoritative; the
Beyond the Rhine VASSAL module is secondary cross-check evidence.

## Catalog/index and validation

The persistent catalog is a readonly array with explicit SchemaVersion and
catalog provenance. `createPieceDefinitionCatalogIndex` derives ID lookup,
code-unit ordered iteration, and family filters without sorting/mutating the
persistent input.

Validation covers catalog/version/provenance, duplicate Definition/Face/
Capability IDs, family/profile consistency, missing/invalid faces and steps,
exact ratings, resource capacity, capability parameters, organization refs, and
source evidence.

## Layer boundary and deferred work

- Piece instance state and relation ledgers are layered in F6;
- capability eligibility/effects and derived strength/RE/ZOC (Rule Engine);
- strict JSON parsing, canonical serialization, hashes, migrations (F8);
- historical BTR catalog extraction and generator archetypes (generator study).

## Completion checklist

- [x] Catalog and definitions are versioned, immutable data contracts.
- [x] All required families and organization references exist.
- [x] Faces support arbitrary contiguous multi-step profiles.
- [x] MP and RE use exact integer ticks.
- [x] Resource capacity and facility/marker profiles are explicit.
- [x] Capabilities accept typed data only and contain no behavior callback.
- [x] Raw/normalized evidence, confidence, and review status are preserved.
- [x] Indexing and validation are deterministic and do not mutate definitions.
- [x] Runtime state is layered separately in F6; rule effects remain outside F5.
