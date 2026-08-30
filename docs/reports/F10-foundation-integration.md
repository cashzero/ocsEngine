# F10 Foundation Integration Report

## Gate result

The synthetic Foundation slice is structurally complete and ready to be consumed by the Rule Engine. It contains no Rule resolution, Gameplay sequencing, random generation, AI, or UI behavior.

## Exercised pipeline

The integration gate performs this exact data flow:

`deterministic fixture → strict validation → canonical serialization → SHA-256 → strict reload → canonical serialization/hash comparison`

The reloaded aggregate must equal the detached canonical Scenario, emit byte-identical JSON, and produce the same branded content hash.

## Enumerated content

The fixed F9 fixture supplies:

| Content | Count / coverage |
|---|---:|
| Hexes | 25 |
| Featured canonical Hexsides | 4 |
| Piece Definitions | 6 |
| Piece states | 6 |
| Piece relations | 1 cargo relation |
| Players | 2 |
| Piece location variants exercised | on-map, off-map, holding, container |

The gate resolves Map-state Hexes/controllers, Piece-state Definitions/owners/faces/locations, entry/source Hexes, external Table references, cargo endpoints, and container targets.

## Structural proofs

- Every Hexside parses as canonical adjacent endpoints. Forward and reciprocal directed references canonicalize to the same ID.
- The cargo relation resolves both Pieces and agrees with the contained Piece location; aggregate validation also proves matching capacity.
- Updating the Transport mode creates a new runtime aggregate and Piece array, increments Revision once, and leaves the original mode unchanged.
- Production `src/**/*.ts` is scanned for BCS-specific domain terms (`BCS`, Combat Train, SNAFU, Stopping Engagement, Engagement Zone, Screen Zone); the expected result is zero matches.
- The built-package smoke test imports the public fixture/serialization API, reloads its output, and computes a SHA-256 hash from `dist`.

## Automated evidence

- `tests/integration/foundation-gate.test.ts`
- `tests/testing/foundation-fixtures.test.ts`
- `tests/serialization/scenario-serialization.test.ts`
- `tests/dist-smoke.mjs`

The repository-level evidence command is `npm run check`, which runs TypeScript checking, the complete Vitest suite, declaration/JavaScript build, and the dist smoke test.

Verified on 2026-08-30: typecheck passed, 10 test files / 72 tests passed,
build passed, and the built-package smoke test passed. No coverage threshold is
configured in the repository; the Foundation gate is acceptance/invariant based.
