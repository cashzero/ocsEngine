# M6 Random Map work breakdown

M6 outputs a deterministic, validated Foundation `MapDefinition`. It does not generate units, deployment, objectives, or a playable Scenario; those belong to M7/M8.

| Step | Study output | Exit proof |
|---|---|---|
| M6.0 | `docs/generator/00-scope-options-and-output-contract.md` | Explicit options, output, non-goals |
| M6.1 | `docs/generator/01-seed-rng-and-determinism.md` | One uint32 seed, byte-identical output |
| M6.2 | `docs/generator/02-noise-and-terrain-classification.md` | Multi-field coherent terrain |
| M6.3 | `docs/generator/03-coast-and-hydrology.md` | Coastal sea and canonical rivers |
| M6.4 | `docs/generator/04-settlements-and-strategic-regions.md` | Spaced settlements, opposing entry/supply |
| M6.5 | `docs/generator/05-connected-road-network.md` | All strategic nodes in one road component |
| M6.6 | `docs/generator/06-topology-and-quality-validation.md` | Foundation plus generator validators |
| M6.7 | `docs/generator/07-serialization-and-package-boundary.md` | Canonical JSON and dependency boundary |
| M6.8 | `docs/generator/08-ui-preview-and-download.md` | Style/size/seed preview and download |
| M6.9 | `docs/generator/09-seed-sweep-protocol.md` | 1,000 seeds, zero invalid/exception |
| M6.10 | `docs/reports/M6-random-map-gate.md` | Full check and visual smoke |

