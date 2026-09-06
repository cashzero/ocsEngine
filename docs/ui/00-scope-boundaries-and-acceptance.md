# U0 — Scope, boundaries, and acceptance

## Study result

The existing Gameplay Engine already owns lifecycle, action discovery, dispatch serialization, pending decisions, viewer projection, history, persistence, checkpoints, and hot-seat privacy. The UI is therefore an adapter over `GameSession`, with only transient selection and camera state of its own.

## Boundary

- `src/ui/controller.ts` calls Gameplay public methods only.
- The browser retains immutable `ScenarioDefinition` to draw map geometry and resolve
  public printed-counter definitions. Viewer-sensitive runtime facts still come only
  from `GameplayView.projection`; the definition catalog must never be used to bypass
  projected face/step/resource/status redaction.
- Viewer-sensitive counters always come from `GameplayView.projection`; the UI never reads `GameState`.
- No rule calculation, dice roll, resource mutation, or transaction progression exists in UI code.

## Acceptance

A browser user can start the synthetic scenario, inspect its map, execute generated legal actions, resolve decisions, recover/save, and perform a privacy-safe seat handoff without a console or JSON editor.
