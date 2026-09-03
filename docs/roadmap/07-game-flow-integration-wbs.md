# M8 Game Flow Integration work breakdown

Status: **IN PROGRESS** (reopened 2026-09-01; real-browser turn gate passed 2026-09-03, remaining product-operation rows open).

## Objective

Deliver one observable product flow:

```text
New Game → Generate Map → Generate OOB → Compose/Deploy Scenario
         → Gameplay Session → Game End
```

M8 is complete only when the active UI map, counters, legal actions, save/replay and final result all come from the same generated `ScenarioDefinition`. Independent Map/OOB laboratories remain diagnostic tools, not the normal New Game path.

Architecture: [end-to-end game flow](../architecture/game-flow.md).

## Work breakdown and study outputs

| Step | Study/output document | Implementation result | Exit proof |
|---|---|---|---|
| M8.0 | `docs/game-flow/00-current-gap-and-flow-contract.md` | Freeze New Game → Game End observable contract and non-goals | No stage or owner is implicit |
| M8.1 | `docs/game-flow/01-new-game-request-and-seeds.md` | `NewGameRequest`, template/scale and independent map/OOB/deployment/rules seeds | Same request is byte-deterministic; each seed is orthogonal |
| M8.2 | `docs/game-flow/02-scenario-composer-contract.md` | Pure composer for map, OOB, deployment and complete Scenario envelope | Output passes Foundation Scenario validation |
| M8.3 | `docs/game-flow/03-deployment-generator.md` | Seeded player ownership, PieceState, legal locations, modes, steps, resources and objectives | No duplicate/illegal/overstacked placement |
| M8.4 | `docs/game-flow/04-cross-domain-validation.md` | Route, supply, force, template and Rule compatibility validation | Invalid generated inputs fail before session creation |
| M8.5 | `docs/game-flow/05-gameplay-bootstrap.md` | `NewGameOrchestrator` creates bindings and calls existing `GameplayEngine.createSession` | Generated session reaches READY and starts ACTIVE |
| M8.6 | `docs/game-flow/06-new-game-ui-flow.md` | One New Game wizard/progress/error flow; resulting session replaces fixture | Displayed map/OOB and Gameplay state share scenario/hash |
| M8.7 | `docs/game-flow/07-game-end-result.md` | FINISHED result view with winner, score, reason, final save and replay/New Game actions | COMPLETE phase always produces one result |
| M8.8 | `docs/game-flow/08-persistence-recovery.md` | Save/load/checkpoint/replay retain generated scenario and all seeds | Reload reproduces the same scenario and final result |
| M8.9 | `docs/reports/M8-orthogonal-seed-sweep.md` | Fixed-map/vary-OOB, fixed-OOB/vary-map and deployment sweeps | Geography and force identities remain independently stable |
| M8.10 | `docs/reports/M8-generated-game-flow-gate.md` | Browser and headless New Game-to-Game End playthrough | Human completes a generated game; only then start AI |

Every step produces its document before or together with code. A later step cannot mark an earlier missing integration seam as “deferred.”

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
  oob: { scale: OobScale; formationsPerSide: number };
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
