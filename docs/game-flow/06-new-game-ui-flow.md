# M8.6 New Game UI flow

The browser starts from `DEFAULT_NEW_GAME_REQUEST`, not a Rule test fixture. New Game is the primary session command and presents the visible sequence:

```text
New Game -> Map -> OOB -> Deployment -> Gameplay
```

The form owns only request values. Its first submission calls `NewGameOrchestrator.prepare` and shows one combined Map, OOB, deployment, metric, and warning preview. Any input change invalidates that preview. Gameplay cannot start until the combined package validates and the user chooses **Start this operation**.

Start passes the previewed deterministic request to `NewGameOrchestrator.create`; on success the UI disposes the previous controller/session and mounts the returned generated map, generated OOB-backed counters, Scenario, bindings, and active session together. Standalone M6/M7 player-facing laboratories were removed because they falsely implied integration. Inputs and controls retain the UI's 13px minimum font-size contract.

Implementation: `src/ui/browser.ts`, `web/styles.css`.
