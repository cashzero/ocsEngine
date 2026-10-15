# M6 Random Map work breakdown

Status: **DONE** (M6.0–M6.12). The standalone map laboratory of M6.8 was later replaced by the New Game preview (`docs/game-flow/new-game-ui.md`).

M6 outputs a deterministic, validated Foundation `MapDefinition`. It does not generate units, deployment, objectives, or a playable Scenario; those belong to M7/M8.

| Step | Described in | Exit proof |
|---|---|---|
| M6.0 | `docs/generator/random-map.md` | Explicit options, output, non-goals |
| M6.1 | `docs/generator/random-map.md` | One uint32 seed, byte-identical output |
| M6.2 | `docs/generator/random-map.md` | Multi-field coherent terrain |
| M6.3 | `docs/generator/random-map.md` | Coastal sea and canonical rivers |
| M6.4 | `docs/generator/random-map.md` | Spaced settlements, opposing entry/supply |
| M6.5 | `docs/generator/random-map.md` | All strategic nodes in one road component |
| M6.6 | `docs/generator/random-map.md` | Foundation plus generator validators |
| M6.7 | `docs/generator/random-map.md` | Canonical JSON and dependency boundary |
| M6.8 | `docs/generator/random-map.md` | Style/size/seed preview and download |
| M6.9 | `docs/generator/random-map.md` | 1,000 seeds, zero invalid/exception |
| M6.10 | `docs/generator/random-map.md` | Full check and visual smoke |
| M6.11 | `docs/generator/map-styles.md` | BtR-scale road mesh and settlement density; coverage validated |
| M6.12 | `docs/generator/map-styles.md` | Eastern Europe (Russia) theme: Case Blue / GBII-calibrated flatter terrain, fewer roads, railways and towns |
