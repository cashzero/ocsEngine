# F7 Scenario / Configuration Envelope

## Outcome

F7 defines the complete immutable input that a future Gameplay Engine can load. A fixed hand-authored scenario and a generated scenario use the same `ScenarioDefinition`; generated data differs only by optional descriptive metadata.

## Aggregate boundary

`ScenarioDefinition` owns references to, but does not merge, these persistent aggregates:

- `MapDefinition` and the initial `MapState`
- a versioned `PieceDefinitionCatalog` subset and initial `PieceRuntimeState`
- players and their Side Definition IDs
- starting turn and first player
- off-map/holding boxes, tracks, and piece pools
- entry and source declarations
- immutable Option, Weather, and external Table Definition IDs
- provenance and optional generator ID/version/seed metadata

The envelope contains data only. It does not import a random generator, calculate rules, sequence play, or store UI state.

## Cross-aggregate validation

`validateScenarioDefinition` first delegates validation to the map, map-state, piece-catalog, and piece-state validators. It then checks references crossing those boundaries:

- all controllers, owners, and the first player resolve to a declared Player;
- on-map locations and entry/source declarations resolve to existing Hexes;
- off-map, holding, track, and pool locations resolve to a declared compatible place;
- track positions remain within the declared range;
- configured external Tables have exactly one source reference;
- stable IDs, names, provenance, ranges, seeds, and semantic collection keys are valid and non-duplicated.

Every issue carries a full path from the Scenario root. Foundation validation is structural: it does not decide whether a placement, option, weather value, or turn order is legal under OCS rules.

## Fixed and generated scenarios

`generatorMetadata` is nullable. When present it records a generator Definition ID, generator version, and named seed values. No callable generator or generator-specific object is retained, so the Scenario can be persisted, replayed, and loaded by the same downstream API as a fixed scenario.

## Verification

`tests/domain/scenario.test.ts` proves:

- a complete fixed envelope validates;
- the identical envelope with generator metadata validates without a generator dependency;
- missing Players, incompatible Boxes, unknown Hexes, and missing Table sources are reported with rooted paths.
