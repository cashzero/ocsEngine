# M8.5 Gameplay bootstrap

`NewGameOrchestrator.create` executes the product order:

```text
validate request -> generate map -> generate OOB -> deploy -> compose/validate
                 -> GameplayEngine.createSession -> session.start
```

Gameplay and Rule Engine remain generator-agnostic. The orchestrator passes their existing public contract: Scenario, Rule Configuration, rules seed, complete seat bindings and label. A successful call returns the entire generated package plus one `ACTIVE` `GameSession`; any bootstrap exception becomes `GAMEPLAY_BOOTSTRAP_FAILED` and no partial result is returned.

Implementation: `src/game-flow/orchestrator.ts`.

