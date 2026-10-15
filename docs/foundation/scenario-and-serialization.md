# Scenario, serialization and fixtures

## Scope

The scenario envelope every game is loaded from, how it is validated, serialized, hashed and migrated, and the
deterministic test fixtures. Data types are in [data-model.md](data-model.md).

## Current behavior

### Scenario envelope (`src/domain/scenario`)

`ScenarioDefinition` is the complete immutable input to a game. It references, without merging: the `MapDefinition` and
initial `MapState`; a versioned `PieceDefinitionCatalog` and initial `PieceRuntimeState`; players and their sides; the
starting turn and first player; boxes, tracks and pools; entry and supply source declarations; option, weather and
external table references; provenance; and optional `generatorMetadata` (generator ID, version and named seeds). It holds
data only: no generator, rule calculation, sequencing or UI state. A hand-made and a generated scenario use the same type
and the same downstream API.

`validateScenarioDefinition` runs the map, map-state, catalog and piece-state validators, then checks what crosses them:
controllers, owners and the first player resolve to declared players; on-map locations and entry and source declarations
resolve to existing hexes; boxes, tracks and pools resolve to declared places of the right kind; track positions are in
range; each external table has exactly one source; IDs, names, provenance, ranges, seeds and collection keys are valid and
unique. Every issue carries its full path from the scenario root. This is structural only; OCS legality of a placement or
option is the Rule Engine's.

### Serialization (`src/serialization`)

- Every persistent aggregate (`ScenarioDefinition`, `MapDefinition`, `MapState`, `PieceDefinitionCatalog`,
  `PieceRuntimeState`) carries `schemaVersion`; `FOUNDATION_SCHEMA_VERSION` is 1 and only it is accepted. An unsupported
  version is reported at its aggregate's `schemaVersion` path.
- `parseScenarioDefinition(unknown)` and `parseScenarioJson(text)` decode recursively into branded types; nothing is cast.
  Every object is closed: an unknown property anywhere is `UNKNOWN_SCHEMA_FIELD` with its path.
- `canonicalizeScenarioDefinition` sorts set-like collections by stable keys and normalizes step profiles;
  `canonicalJson` sorts object keys, normalizes `-0`, omits undefined properties, and rejects non-finite numbers,
  unsupported values, holes and cycles. `serializeScenarioDefinition` validates first; `hashScenarioDefinition` is
  SHA-256 of the canonical UTF-8 bytes as `sha256:<64 hex>`. Reordering a set-like input changes neither text nor hash.
- Migration seam: a `SchemaMigration` names its aggregate and adjacent versions; `migratePersistentAggregate` applies only
  an explicit contiguous chain, and the result must still pass the strict decoder. `FOUNDATION_MIGRATIONS` is empty; a
  requested migration returns `MISSING_SCHEMA_MIGRATION`. (Gameplay save versions migrate separately,
  [docs/gameplay/session.md](../gameplay/session.md).)

### Fixtures (`src/testing`)

- `createFixtureIdFactory`, `buildHexDefinition`, `buildPieceDefinition`, `buildPieceState`: deterministic builders whose
  overrides apply last and may be malformed on purpose.
- `createFoundationScenarioFixture`: a synthetic 5×5 plain map with road, river, rail and river-plus-bridge hexsides;
  ground, two-step, HQ, artillery, transport and supply dump definitions and states; on-map, off-map, holding and container
  locations with a matching cargo relation; two players, entries, sources, boxes, tracks, pools, weather, options, tables
  and provenance. All IDs are synthetic; no copyrighted data.
- `createMalformedFoundationFixtures`: named invalid scenarios with their expected issue codes.
- Rule, gameplay and generated-game fixtures (`rule-fixtures.ts`, `gameplay-fixtures.ts`,
  `generated-rule-fixtures.ts` with `RULE_FIXTURE_NEW_GAME_REQUEST`) build on these for the higher layers.
- No builder reads a clock, global counter or `Math.random`.

### Foundation gate

`tests/integration/foundation-gate.test.ts` runs fixture → strict validation → canonical JSON → SHA-256 → strict reload →
canonical JSON and hash again, and requires byte-identical output; it also checks hexside reciprocity, cargo resolution,
immutable revisioned updates, the import direction and the absence of BCS vocabulary in production code.

## Decisions

- **Explicit rejection of unknown fields**: a producer may not attach future fields to a version-1 aggregate; forward
  compatibility comes only through a registered migration.
- **Generated scenarios are ordinary scenarios**: generator metadata is descriptive, so saves and replays never need a
  generator.

## Known gaps

None open.

## Verification

`tests/domain/scenario.test.ts`, `tests/serialization/scenario-serialization.test.ts`,
`tests/testing/foundation-fixtures.test.ts`, `tests/integration/foundation-gate.test.ts`, `tests/dist-smoke.mjs`.
