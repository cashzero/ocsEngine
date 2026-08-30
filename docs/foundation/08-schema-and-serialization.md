# F8 Schema, Serialization, Hashing, and Migration Seam

## Persistent versions

Every persistent Foundation aggregate now carries `schemaVersion`:

- `ScenarioDefinition`
- `MapDefinition`
- `MapState`
- `PieceDefinitionCatalog`
- `PieceRuntimeState`

`FOUNDATION_SCHEMA_VERSION` is currently `1`. Loading accepts only that exact version. A positive but unsupported future version is reported at the aggregate's rooted `schemaVersion` path rather than being treated as current data.

## Strict loading contract

`parseScenarioDefinition(unknown)` and `parseScenarioJson(string)` construct live branded types through explicit recursive decoders. They do not cast parsed JSON to a domain type. Every object is closed: an unknown property at any nesting depth produces `UNKNOWN_SCHEMA_FIELD` with the complete path. Primitive types, tagged variants, branded IDs, quantities, revisions, and versions are decoded before domain and cross-aggregate validation runs.

The forward-compatibility policy is therefore explicit rejection. A producer must not silently attach future fields to a version-1 aggregate.

## Canonical form and content hash

`canonicalizeScenarioDefinition` detaches the value and sorts all semantically unordered collections by stable keys. Ordered meanings, such as the turn start, remain scalar fields. Piece step profiles are normalized by remaining steps. `canonicalJson` then sorts every object key, normalizes negative zero, omits optional undefined object properties, and rejects non-finite numbers, unsupported values, undefined array entries, and cycles.

`serializeScenarioDefinition` validates through the strict loader before emitting canonical JSON. `hashScenarioDefinition` hashes those exact UTF-8 bytes with SHA-256 and returns the branded `sha256:<64 lowercase hex>` representation. Reordering a set-like input collection cannot change either canonical text or hash.

## Migration seam

`SchemaMigration` declares aggregate kind, adjacent source/target versions, and a migration returning validated unknown data. `migratePersistentAggregate` applies only an explicit contiguous chain. `FOUNDATION_MIGRATIONS` is empty because no historical schema exists; a requested transition currently returns `MISSING_SCHEMA_MIGRATION`.

Migration output must still pass the current strict decoder. Registering a migration never bypasses schema or domain validation.

## Verification

`tests/serialization/scenario-serialization.test.ts` proves strict nested-field rejection, full issue paths, aggregate version rejection, canonical round-trip, order-independent hashes, and the intentionally empty migration seam.
