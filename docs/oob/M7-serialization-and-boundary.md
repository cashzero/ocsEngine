# M7.7 Serialization and package boundary

`serializeGeneratedOob` uses the existing canonical JSON serializer. Stable property ordering plus deterministic arrays makes equal options byte-identical. Catalog provenance includes the BTR module SHA-256 and a generator-version/options locator.

The generator may import Core, Domain Piece definitions, Serialization, and its existing seeded RNG. It must not import Rule Engine, Gameplay, UI, or AI modules. UI consumes generation through public exports. The BTR installation path is never opened at runtime; reviewed locators are embedded so builds and tests remain portable.

`GeneratedOob` is not a `ScenarioDefinition`. M8 owns the explicit conversion that combines Random Map, Random OOB, players, Piece State, entry/supply declarations, objectives, and validation.

