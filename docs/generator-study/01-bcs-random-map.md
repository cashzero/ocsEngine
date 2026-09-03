# BCS random-map reuse study

## Sources reviewed

- `E:\work\bcsEngine\utils\mapGenerator.ts`
- `E:\work\bcsEngine\ut\mapGenerator.test.ts`
- `E:\work\bcsEngine\components\ScenarioGeneratorDialog.tsx`

## Reused design ideas

- A single seeded PRNG controls every stochastic choice.
- Generation is staged: terrain, hydrology, settlement suitability, strategic edges/sources, roads, then validation.
- Multi-octave noise yields coherent fields instead of independent per-Hex rolls.
- Settlements are spaced and suitability-ranked.
- Roads connect strategic nodes as a backbone and are validated from the edges actually drawn.
- Seed tests assert determinism, feature ranges, reciprocal topology, and network connectivity.

## Rejected direct reuse

BCS `MapData`, terrain enums, faction supply ownership, weather/air tables, command concepts, and React component state do not match the OCS Foundation boundary. The OCS implementation emits immutable `MapDefinition`, canonical Hexside collections, neutral first/second strategic regions, and a separate UI presenter. BCS's large multi-level road heuristic was reduced to a deterministic least-cost spanning backbone because M6 acceptance requires connectivity, not a complete transport simulator.

