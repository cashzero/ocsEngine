# F9 Foundation Fixture / Test Kit

## Outcome

F9 provides small deterministic builders and one reusable synthetic Scenario. It is test data, not a scenario authoring framework and not a random Map/OOB generator.

## Builders

The public test-kit surface is:

- `createFixtureIdFactory(namespace)` — isolated deterministic Definition/Piece counters;
- `buildHexDefinition(q, r, overrides)` — one plain Hex with field-level overrides;
- `buildPieceDefinition(overrides)` — one valid Ground Piece Definition baseline;
- `buildPieceState(overrides)` — one valid Piece state baseline;
- `createFoundationScenarioFixture(overrides)` — the complete integration fixture;
- `createMalformedFoundationFixtures()` — named invalid scenarios and their stable expected issue codes.

All builders are deterministic. They do not read clocks, global counters, entropy, or `Math.random`. Overrides are applied last and deliberately permit malformed values so tests can target one field without constructing an entire aggregate.

## Synthetic integration fixture

The complete fixture contains:

- a 5×5 plain-terrain axial Map;
- canonical road, river, rail, and river-plus-bridge Hexsides;
- Ground, two-step, HQ, Artillery, Transport, and Supply Dump Definitions and states;
- on-map, off-map Box, holding area, and container locations;
- a matching cargo relation and structural Transport capacity;
- two Players, start turn, entry/source declarations, Box/Track/Pool declarations, Weather/Option/Table references, and provenance.

Every ID and source is synthetic and fixed. No copyrighted scenario or module data is embedded.

## Malformed collection

The included negative fixtures cover an absent on-map Hex, unknown Piece Definition, duplicate Piece ID, and missing external Table source. Each declares the expected stable validation code; tests may add more cases without changing the valid baseline.

## Verification

`tests/testing/foundation-fixtures.test.ts` checks determinism, required content, field overrides, absence of random ID generation, valid cross-aggregate structure, and every malformed fixture's expected code.
