# Game flow

## Scope

How a game is made and played end to end: the New Game request and its seeds, generation, deployment, composition and
validation of the scenario, starting the Gameplay session, Game End, saves and replay. Deployment is in
[deployment.md](deployment.md); the New Game dialog in [new-game-ui.md](new-game-ui.md). Code: `src/game-flow/`.

## Current behavior

### The pipeline

```text
NewGameRequest
  -> Random Map (src/generation/map)        GeneratedMap: map definition, strategic regions
  -> Random OOB (src/generation/oob)         GeneratedOob: piece catalog, force identities
  -> Deployment (deployment.ts)              piece and map runtime state, objectives, garrisons
  -> Composer (composer.ts, configuration.ts)
       GeneratedScenarioPackage: ScenarioDefinition, RuleConfiguration, seat bindings, summary, warnings
  -> cross-domain validation (validation.ts)
  -> GameplayEngine.createSession -> session.start -> ACTIVE
  -> play (UI or headless client) -> Rule phase COMPLETE -> Gameplay FINISHED -> Game End
```

| Component | Owns | Never owns |
|---|---|---|
| New Game UI | settings, preview, progress, cancel | terrain, forces, deployment or rule calculations |
| `NewGameOrchestrator` | stage order, seeds, failure reporting, the final package | generator algorithms or rule legality |
| Map generator | terrain and strategic geography | units, deployment, session |
| OOB generator | force identity, piece definitions, support and logistics | hexes, owners, locations |
| Deployment | piece owners, locations, modes, steps, starting resources, control, objectives | movement or combat results |
| Composer | the complete immutable `ScenarioDefinition` and rule configuration | session lifecycle |
| Gameplay Engine | session lifecycle, dispatch, save/load/replay, projections | generation, rules |
| Rule Engine | legal actions and transitions | UI or generation workflow |

Gameplay and the Rule Engine are generator-agnostic: the orchestrator calls their ordinary public API with a scenario,
a rule configuration, the rules seed and the seat bindings.

### The request

`NewGameRequest` (`src/game-flow/model.ts`) is the only input: the `GROUND_DUEL` template; the engagement (Meeting
Engagement, Allied attack or Axis attack); map width, height, style and sea; OOB scale, divisions per side and how many
are armored, air forces and air transport; four seeds; the turn limit (until the player sets one it follows the map size, see [turn-limit.md](turn-limit.md)); the start month; and optionally Rail Cap, Sea Cap
and inland entry per side. Absent optional fields keep the meaning they had before the field existed, so older requests
and saves stay valid. Limits and the default request are in `docs/quality/03-product-operation-verification-plan.md`
("Approved scope").

| Seed | Changes | Leaves alone |
|---|---|---|
| `map` | terrain, hydrology, roads, rail, strategic regions | force identities |
| `oob` | formations, units, ratings | map geography |
| `deployment` | starting locations | map and forces |
| `rules` | dice during play | the composed scenario |

The whole request is kept in the package and the four seeds in `ScenarioDefinition.generatorMetadata`.
`sweepGameFlowSeedOrthogonality` (`src/game-flow/sweep.ts`) changes one seed at a time from the default request and
checks, by canonical JSON, that only that dimension changes.

### Building and starting

- `prepare(request)` builds the package; `prepareInStages(request, beforeStage)` builds the same package one step at a
  time (Map, OOB, Deployment, Scenario) so a UI can paint each step and cancel between steps; `start(package)` opens a
  session on a package already built; `create` is `prepare` then `start`.
- The session starts `ACTIVE`; a successful `start` returns the package with the session. Any bootstrap exception becomes
  `GAMEPLAY_BOOTSTRAP_FAILED` and no partial session is returned.

### Validation

Every failure names its stage (`OPTIONS`, `MAP`, `OOB`, `DEPLOYMENT`, `SCENARIO`, `GAMEPLAY_BOOTSTRAP`), a code, a message
and a structured path, and is returned before a session exists:

- `OPTIONS`: template, engagement, sea, seeds (uint32), turn limit 1–60, map size limits, start month (September–April,
  and the last turn must fall inside the Weather Table), Rail Cap, Sea Cap and inland entry (a side without inland entry
  needs a sea and at least 1 Sea Cap).
- `SCENARIO`: the composed scenario passes Foundation validation and the rule configuration is valid; no unit begins on
  water; opposing sides never share a hex; no starting stack exceeds the stacking limit; every player has a supply source,
  an entry (or, landing by sea, a port it holds) and a unit that can move.

Rule legality is never relaxed to let generated output pass.

### Game End

When the Rule sequence reaches `COMPLETE`, Gameplay becomes `FINISHED`. The UI reads the projected `victory` (winner or
draw, both scores, reason, final revision) and offers the final save, the replay and New Game; it never computes victory.

### Saves and replay

Gameplay saves contain the authoritative state, including the composed scenario and its seeds; there is no separate
generator save format. A final save reloads as `FINISHED` with the same result; a replay holds every accepted action with
the same initial and final hashes. Loading in the UI accepts only a save of the scenario now mounted
(TODO `load-same-scenario`).

## Decisions

- **One pipeline, no laboratories**: the earlier standalone Map and OOB screens were removed because they implied an
  integration that did not exist; a player never downloads and connects generator JSON.
- **The application layer orchestrates**: orchestration lives in `src/game-flow`, not in the generators, the engines or
  browser handlers.
- **The preview is the game**: Start opens exactly the previewed package; changing any setting invalidates it.
- **Independent seeds**, so a player can keep a map and reroll forces, or the reverse.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `load-same-scenario`, `session-reload`, `large-map-generation`, `PERF-7`.
The milestone status (M8) is in `docs/roadmap/07-game-flow-integration-wbs.md`.

## Verification

- `tests/game-flow/new-game-flow.test.ts` (package, bootstrap, play to `FINISHED`, final save reload, replay, seed
  orthogonality), `tests/game-flow/deployment-plan.test.ts`.
- Browser rows NG-01 to NG-14, SES-01 to SES-09 in `docs/quality/03-product-operation-verification-plan.md`.
