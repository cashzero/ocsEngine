# M8.0 Current gap and game-flow contract

## Observed current state

- Browser startup creates Gameplay from the fixed `createRuleGameStateFixture()` scenario.
- Random Map produces `GeneratedMap` for preview/download only.
- Random OOB produces `GeneratedOob` for preview/download only.
- Neither generated output is converted into the active `ScenarioDefinition`.
- Gameplay correctly accepts a complete Scenario but does not own generation or composition.
- There is no deployment output that turns generated force identities into owned, located `PieceState` records.
- Game End exists internally as Rule phase `COMPLETE` and Gameplay lifecycle `FINISHED`, but has no generated-game result flow in the UI.

This proves the reported symptom: package dependencies are one-way, but the product flow is not yet integrated.

## Frozen observable flow

```text
New Game
  → Generate Map
  → Generate OOB
  → Compose and deploy Scenario
  → Create and start Gameplay Session
  → Play legal actions through UI/headless client
  → Rule phase COMPLETE / Gameplay FINISHED
  → Game End result, final save and replay
```

## Contract

1. New Game is the sole owner of orchestration and stage progress.
2. Each stage consumes the previous validated output or fails without activating a partial session.
3. Map, OOB, deployment and rules seeds are independent and retained in Scenario metadata.
4. The same composed Scenario supplies the visible map, counters, players, legal actions, saves and replay.
5. Gameplay and Rule Engine public contracts remain generator-agnostic.
6. Game End is derived from authoritative state, never from UI inference.

## Acceptance

- No fixed fixture participates in the normal New Game path.
- A generated scenario passes Foundation and Rule bootstrap validation.
- UI and headless clients can start the same generated Scenario package.
- A session can reach FINISHED and expose one deterministic result.
- Reload/replay preserves the generated Scenario hash and seed metadata.

## Architecture decision

Create an application-layer `NewGameOrchestrator` and pure `ScenarioComposer`/`DeploymentGenerator`. Do not place orchestration in generator internals, Rule Engine, Gameplay Engine, or browser event handlers. See [game-flow architecture](../architecture/game-flow.md) and [M8 WBS](../roadmap/07-game-flow-integration-wbs.md).

