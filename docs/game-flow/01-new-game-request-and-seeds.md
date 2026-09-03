# M8.1 New Game request and seed ownership

`NewGameRequest` is the only input to the integrated flow. It selects the `GROUND_DUEL` template, map dimensions/style, OOB scale/formations, turn limit, and four explicit uint32 seeds.

| Seed | Owner | May change | Must preserve |
|---|---|---|---|
| `map` | Random Map | terrain, hydrology, roads, strategic regions | OOB identities |
| `oob` | Random OOB | formations, units, ratings | map geography |
| `deployment` | Deployment generator | initial unit locations | map and OOB identity |
| `rules` | Rule Engine | future dice results | composed map, OOB and deployment |

The request is stored in `GeneratedScenarioPackage`; all four seeds are also copied to `ScenarioDefinition.generatorMetadata`. Invalid options fail at the `OPTIONS`, `MAP`, or `OOB` stage before a session exists.

Implementation: `src/game-flow/model.ts`, `src/game-flow/orchestrator.ts`.

