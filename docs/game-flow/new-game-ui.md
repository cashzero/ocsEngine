# New Game dialog

The browser starts from `DEFAULT_NEW_GAME_REQUEST`, not a Rule test fixture. New Game is the primary session command and presents the visible sequence:

```text
New Game -> Map -> OOB -> Deployment -> Gameplay
```

The form owns only request values. Its first submission calls `NewGameOrchestrator.prepare` and shows one combined Map, OOB, deployment, metric, and warning preview. Any input change invalidates that preview. Gameplay cannot start until the combined package validates and the user chooses **Start this operation**.

Settings has a **Players** box: each side is a Player or a Computer (`NewGameRequest.seats`). Two players is the plain hot-seat
game; a computer seat carries its own seed (shown in *Reproducible seeds*, redrawn by Randomize), and the preview bar names
who plays each side. Who plays never changes the generated map, forces or deployment. What a computer seat does on screen is in
[docs/ui/computer-players.md](../ui/computer-players.md).

The dialog is two pages in sequence under one bar, titled with the page (**Settings** or **Preview**), which shows the build status with the Configure → Map → OOB → Deployment → Gameplay stages, the page's actions, and Close. The Settings page shows every setting at once in three columns (Scenario and map; order of battle; game rules and seeds); its only action is **Preview**, which always generates the package afresh from the current settings and opens the Preview page. While the package is built a loading page replaces both pages: it lists the build steps (Map, Forces, Deployment, Scenario), and `NewGameOrchestrator.prepareInStages` paints each step before running it, so the marked step is the one actually running; **Cancel** stops the build at the next step and returns to Settings. Start shows the same page with a single session step: it opens the previewed package with `NewGameOrchestrator.start`, without building it again (`create` is `prepare` followed by `start`). A field the browser rejects, or a failed build, keeps the player on Settings with the field marked. The Preview page puts the headline figures (scenario, map size, units, and objective hexes with their VP and who holds them) in the bar, the minor ones (divisions per side, deployed hexes, Rail Cap, warnings) beside the map key, gives the map most of the width, and lists one side's forces at a time under an Allied / Axis tab; pointing at (or focusing) a formation, group or counter in that list rings its starting Hexes on the map and dims the other stacks; its actions are **Back**, which returns to Settings unchanged, and **Start this operation**, which plays exactly the package shown. A Start failure returns to Settings with the error.

Start passes the previewed package to `NewGameOrchestrator.start`; on success the UI disposes the previous controller/session and mounts the returned generated map, generated OOB-backed counters, Scenario, bindings, and active session together. Standalone M6/M7 player-facing laboratories were removed because they falsely implied integration. Inputs and controls follow the UI text floor (`docs/ui/overview.md`).

Reinforcement percentage selectors, arrival timing, and fitting behavior are defined in [reinforcement-balance.md](reinforcement-balance.md).

Implementation: `src/ui/browser.ts`, `web/styles.css`.

## Decisions

- **Explicit generation** (user, 2026-10-04): nothing is generated until the player presses Preview; changing a setting
  only invalidates the preview.
- **Start opens the previewed package without rebuilding it**, so what is shown is exactly what is played.

## Known gaps

`large-map-generation` (`docs/quality/05-todo-inventory.md`): generation runs on the page's main thread, so a long step
cannot be interrupted or show progress; Cancel acts only between steps. `prepareInStages` keeps each step behind one
`beforeStage` call and returns a plain package, so the build can move into a Web Worker with the same stages and page.
`objective-marker-preview`: the preview draws objectives as plain gold stars without their holder.

## Verification

Browser rows NG-01 to NG-10 and NG-15, and BOT-01 for the Players box, in `docs/quality/03-product-operation-verification-plan.md`; `scripts/product-acceptance/run-newgame.mjs` and `scripts/reinforcement-ui-check.mjs`.
