# Foundation F4: map definition and state

## Ownership split

`MapDefinition` is immutable printed/scenario-stable data:

```text
MapDefinition
├─ axial bounds
├─ sparse ordered HexDefinition records
│  ├─ one or more terrain Definition IDs
│  └─ typed printed/facility/source/entry references
├─ canonical Hexside feature records
├─ provenance
└─ game-specific override Definition IDs
```

`MapState` is the minimal mutable overlay:

```text
MapState
├─ revision
├─ per-Hex control
└─ feature instances
   ├─ Hex or Hexside location
   ├─ typed feature kind and Definition ID
   ├─ status Definition IDs and nullable controller
   └─ non-negative level/damage state
```

Control, mutable infrastructure, scenario-created features, damage, and
reduction levels never modify or duplicate the printed MapDefinition.

## Container and bounds decision

Persistent map data uses readonly sparse arrays plus an explicit rectangular
axial bounds envelope. This supports irregular maps without allocating absent
Hexes and gives F8 a deterministic serialization surface.

`createMapDefinitionIndex` derives private lookup maps and frozen ordered views.
The index is a cache, not authoritative state: it exposes lookup methods but no
mutable collection. Hex iteration uses numeric axial `(q, r)` order; Hexside
iteration uses canonical ID order.

Neighbor lookup returns `undefined` at a real map edge. A featured Hexside whose
endpoint is absent is invalid data rather than an implicit off-map connection.

## Feature representation

- every Hex has one or more terrain layers; no closed single-terrain enum;
- printed Hex features use typed `PRINTED_FEATURE`, `FACILITY`, `SOURCE`, and
  `ENTRY` references;
- road, rail, river, and bridge definitions attach to canonical Hexsides;
- mutable/scenario features carry matching typed kinds and Hex/Hexside location;
- `mapFeaturesAt` returns printed data plus state overlays without calculating
  cost, capacity, ownership effects, or repair outcomes;
- game-specific override seams are Definition IDs, never executable callbacks.

Port, airbase, hedgehog, source, road, rail, river, and bridge meaning lives in
referenced game/series definitions. F4 only preserves their typed placement.

## Validation

Definition validation reports invalid bounds and IDs, duplicate Hexes/Hexsides/
features, empty terrain, out-of-bounds Hexes, missing/orphan edge endpoints, bad
Definition references, and incomplete provenance.

State validation reports invalid revisions, duplicate control/feature records,
absent Hex/Hexside references, bad player/status references, kind/location
mismatch, and invalid level/damage quantities.

State update helpers increment Revision, return new arrays, preserve their input,
and maintain deterministic order.

## Deferred

- terrain/hexside movement cost and continuous-road handling (Rule Engine);
- rail movement/gauge effects, port/airbase capacity, damage and repair rules;
- MapDefinition/MapState canonical JSON schema and migration (F8);
- Piece definitions and runtime state are layered in F5–F6;
- renderer/view culling and interaction (UI milestone).

## Completion checklist

- [x] Definition and mutable state ownership are separate.
- [x] Sparse container, bounds policy, lookup, ordered iteration, and neighbors exist.
- [x] Multi-terrain, typed Hex features, and canonical edge features are supported.
- [x] Printed features and state overlays have one combined query.
- [x] Structural validators cover duplicates, missing/orphan edges, and bad refs.
- [x] Immutable updates are revisioned and deterministic.
- [x] No movement, capacity, repair, UI, generator, or AI behavior is present.
