# M8 Game Flow Integration work breakdown

Status: **IN PROGRESS**. Steps M8.0–M8.9 are implemented and described in `docs/game-flow/`; the M8.10 gate stays open while
any P0 row of `docs/quality/03-product-operation-verification-plan.md` sections A–D (New Game, map and OOB, counters,
rule actions, session lifecycle) is not `PASS`.

## Objective

Deliver one observable product flow:

```text
New Game → Generate Map → Generate OOB → Compose/Deploy Scenario
         → Gameplay Session → Game End
```

M8 is complete only when the active UI map, counters, legal actions, save/replay and final result all come from the same generated `ScenarioDefinition`. The standalone Map/OOB laboratories were removed; generation, preview and Start share the New Game flow.

Current behavior: [game flow](../game-flow/overview.md).

## Work breakdown and study outputs

| Step | Scope | Described in | Exit proof |
|---|---|---|---|
| M8.0 | New Game → Game End contract and non-goals | `docs/game-flow/overview.md` | No stage or owner is implicit |
| M8.1 | `NewGameRequest` and independent seeds | `docs/game-flow/overview.md` | Same request is byte-deterministic; each seed is orthogonal |
| M8.2 | Pure composer for the complete Scenario | `docs/game-flow/overview.md` | Output passes Foundation Scenario validation |
| M8.3 | Deployment | `docs/game-flow/deployment.md` | No duplicate, illegal or overstacked placement |
| M8.4 | Cross-domain validation | `docs/game-flow/overview.md` | Invalid generated inputs fail before session creation |
| M8.5 | Gameplay bootstrap | `docs/game-flow/overview.md` | Generated session starts ACTIVE |
| M8.6 | New Game dialog | `docs/game-flow/new-game-ui.md` | Displayed package and Gameplay state share scenario and hash |
| M8.7 | Game End result | `docs/game-flow/overview.md` | COMPLETE always produces one result |
| M8.8 | Saves and replay keep the scenario and seeds | `docs/game-flow/overview.md` | Reload reproduces the same scenario and result |
| M8.9 | Orthogonal seed sweep | `docs/game-flow/overview.md` | Geography and force identities stay independently stable |
| M8.10 | Browser New Game → Game End gate | `docs/quality/03-product-operation-verification-plan.md` | Every P0 row of sections A–D `PASS` |

A later step cannot mark an earlier missing integration seam as “deferred.”

## Delivery slices

### Slice A — composable generated Scenario

M8.0–M8.4 deliver pure data composition and validation without UI. The focused test constructs Random Map and Random OOB outputs, deploys them, composes one `ScenarioDefinition`, validates it, serializes/hashes it, and reloads it byte-identically.

### Slice B — generated Gameplay bootstrap

M8.5 removes the fixed-fixture assumption from application startup. A generated Scenario package is accepted by the unchanged Gameplay/Rule public contracts, reaches READY, starts, exposes legal actions and persists its first snapshot.

### Slice C — player-facing New Game flow

M8.6 makes New Game the primary UI entry. Generation stages show progress and fail with actionable stage/seed explanations. Successful completion mounts the generated scenario map and counters into the existing Gameplay UI.

### Slice D — real terminal flow

M8.7–M8.10 prove the game can reach FINISHED, present an authoritative result, save/replay it, and remain deterministic across seed matrices and a manual browser playthrough.

## Required public contracts

```ts
interface NewGameRequest {
  templateId: 'GROUND_DUEL';
  map: { width: number; height: number; style: MapGenerationStyle };
  oob: { scale: OobScale; divisionsPerSide: number; armoredDivisionsPerSide: number; air?: AirForceLevel };
  seeds: { map: number; oob: number; deployment: number; rules: number };
  turnLimit: number;
}

interface GeneratedScenarioPackage {
  scenario: ScenarioDefinition;
  configuration: RuleConfiguration;
  bindings: readonly SeatBinding[];
  summary: GeneratedScenarioSummary;
  warnings: readonly string[];
}

interface NewGameOrchestrator {
  prepare(request: NewGameRequest): Result<GeneratedScenarioPackage, NewGameFailure[]>;
  create(request: NewGameRequest): Promise<Result<CreatedNewGame, NewGameFailure[]>>;
}
```

Names may be refined during M8.0, but the ownership and stage boundaries cannot be collapsed into UI handlers.

## Failure contract

Every failure identifies `OPTIONS`, `MAP`, `OOB`, `DEPLOYMENT`, `SCENARIO`, or `GAMEPLAY_BOOTSTRAP`, includes a structured path, and returns no partially active session.

## Non-goals

- AI policy or automated player;
- air/naval/optional OCS expansion;
- exact historical BTR scenario import;
- multiplayer/network service;
- changing Rule Engine legality to make an invalid deployment pass.

## Exit gate

- New Game creates one generated Scenario package without fixture data.
- The UI map and counters come from that exact package.
- Gameplay starts and dispatches legal actions against it.
- Save/load/replay preserve scenario and seed identity.
- The session reaches FINISHED and presents Game End.
- Orthogonal seed sweeps and one generated manual playthrough pass.
- No AI work starts before all conditions pass.
