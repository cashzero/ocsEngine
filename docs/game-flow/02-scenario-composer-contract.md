# M8.2 Scenario composer contract

The pure composer receives one validated `GeneratedMap`, `GeneratedOob`, `GeneratedDeployment`, and the originating request. It produces a complete Foundation `ScenarioDefinition`, production `RuleConfiguration`, seat bindings, summary, and combined warnings.

Field ownership is explicit:

- Map Definition and map provenance come from M6.
- Piece Definition Catalog and OOB provenance come from M7.
- Map/Piece runtime states and objectives come from M8 deployment.
- players, entries, sources, options, weather and generator metadata come from the ground-duel template.
- session lifecycle remains owned by Gameplay.

The composer imports no test fixture. Its output must pass `validateScenarioDefinition` and `validateRuleConfiguration` before Gameplay bootstrap.

Implementation: `src/game-flow/composer.ts`, `src/game-flow/configuration.ts`.

