# M8.6 New Game UI flow

The browser starts from `DEFAULT_NEW_GAME_REQUEST`, not a Rule test fixture. New Game is the primary session command and presents the visible sequence:

```text
New Game -> Map -> OOB -> Deployment -> Gameplay
```

The form owns only request values. Its first submission calls `NewGameOrchestrator.prepare` and shows one combined Map, OOB, deployment, metric, and warning preview. Any input change invalidates that preview. Gameplay cannot start until the combined package validates and the user chooses **Start this operation**.

The dialog is two pages in sequence under one bar, titled with the page (**Settings** or **Preview**), which shows the build status with the Configure → Map → OOB → Deployment → Gameplay stages, the page's actions, and Close. The Settings page shows every setting at once in three columns (Scenario and map; order of battle; game rules and seeds); its only action is **Preview**, which always generates the package afresh from the current settings and opens the Preview page. While the package is built a loading page replaces both pages: it lists the build steps (Map, Forces, Deployment, Scenario), and `NewGameOrchestrator.prepareInStages` paints each step before running it, so the marked step is the one actually running; **Cancel** stops the build at the next step and returns to Settings. Start shows the same page with a single session step: it opens the previewed package with `NewGameOrchestrator.start`, without building it again (`create` is `prepare` followed by `start`). A field the browser rejects, or a failed build, keeps the player on Settings with the field marked. The Preview page puts the headline figures (scenario, map size, units, and objective hexes with their VP and who holds them) in the bar, the minor ones (divisions per side, deployed hexes, Rail Cap, warnings) beside the map key, gives the map most of the width, and lists one side's forces at a time under an Allied / Axis tab; pointing at (or focusing) a formation, group or counter in that list rings its starting Hexes on the map and dims the other stacks; its actions are **Back**, which returns to Settings unchanged, and **Start this operation**, which plays exactly the package shown. A Start failure returns to Settings with the error.

Start passes the previewed deterministic request to `NewGameOrchestrator.create`; on success the UI disposes the previous controller/session and mounts the returned generated map, generated OOB-backed counters, Scenario, bindings, and active session together. Standalone M6/M7 player-facing laboratories were removed because they falsely implied integration. Inputs and controls retain the UI's 13px minimum font-size contract.

Implementation: `src/ui/browser.ts`, `web/styles.css`.

## TODO: generation for large maps

The loading page and the staged build were sized for 64×48, where a whole build takes about a second; New Game now accepts up to 256×256, so this TODO applies to every map above that size. Generation still runs on the page's main thread:

- **Missing behaviour.** A step cannot be interrupted or report progress while it runs: Cancel takes effect only between steps, the page cannot repaint inside a step, and the step list shows no progress within a step.
- **User-visible impact.** With larger maps a single step (Map or Deployment) could run for seconds; the spinner keeps turning (it is a compositor animation), but the page does not respond to input and Cancel waits for the step to end.
- **Room already left.** `prepareInStages` keeps every step behind one `beforeStage` call and returns a plain package; the loading page reads only the current step; Start no longer rebuilds the package. Moving the build into a Web Worker can therefore keep the same stages and page.
- **Acceptance evidence to close it.** On the largest supported map, measured in the browser: the page answers input during every step, Cancel stops the build within 250 ms, each step that takes over a second shows progress inside it, and the worker-built package equals `prepare`'s (scenario hash and initial state hash) for the same request.

