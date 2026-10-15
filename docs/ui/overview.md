# UI overview

## Scope

How the browser UI is built and what it may and may not do: its boundary with the Gameplay session, the rendering stack,
the session and hot-seat flow, accessibility and typography. The command deck is in [command-deck.md](command-deck.md), the
map and counters in [map.md](map.md), computer players in [computer-players.md](computer-players.md), and the New Game dialog in
[docs/game-flow/new-game-ui.md](../game-flow/new-game-ui.md). The plan is `docs/roadmap/04-ui-wbs.md`.

## Current behavior

### Boundary

- The UI is an adapter over the Gameplay `GameSession` (`src/ui/controller.ts`). It reads the viewer's
  `GameplayView` and the session's queries, and changes the game only through `dispatch`, `respondToPendingDecision`,
  the hand-over calls, checkpoints and save/load.
- It holds only interaction state: selection, camera, open panels, drafts and the tab on show. None of it enters a save.
- It never reads `GameState`, rolls dice, decides legality or applies a rule. Every reason, cost, odds figure and
  forecast it shows comes from a rule query's facts.
- The scenario definition is kept to draw the map and to read public printed counter values; anything viewer-sensitive
  (faces, steps, quantities, statuses) comes only from the projection.

### Rendering

- Templates are lit-html (`src/ui/browser.ts`, `src/ui/command-deck.ts`), loaded through an import map: only changed DOM
  is updated, so focus, scroll positions and input contents survive a refresh.
- The theater map is one canvas (`src/ui/map-canvas.ts`); the New Game preview is SVG from the same art module
  ([map.md](map.md)).
- The command deck's templates carry no handlers; one delegated listener in `browser.ts` handles them.
- An action that takes time disables the controls that could repeat it and shows "Working…" until the next render. The
  wait for a paint has a 50 ms timer fallback, so a hidden or covered page never stalls an action.

### Session and hot seat

- The page boots into the default New Game package. The ☰ Menu dialog holds New Game…, Download save, Load save…, the
  hot-seat hand-over, the "pass the other player's step when blowing a dump is their only option" setting (on by default),
  and checkpoints.
- Menu offers Pause. While paused, game actions are disabled and the deck offers Resume; pausing and resuming preserve revision, phase and units. Loading a previously paused save resumes it as before.
- Undo: the top bar's Undo takes back the last action that only rearranged the player's own units and stocks (up to 30 in
  a step). An action that rolled dice, revealed information or asked the other player clears the actions before it, and
  the hint says why. Without a single action to undo, Undo goes back to the start of the step (one automatic checkpoint
  is kept in the save for this).
- A seat can be played by a computer ([computer-players.md](computer-players.md)): the screen then stays on the person's
  seat, the computer acts by itself with Pause, Step and a speed, and no hand-over is ever shown for it. The hand-over
  below is for a game with persons on both seats.
- Hand-over: when the other player must act, the deck says who and why (defend a hex, answer a result, Reaction); the
  privacy screen then removes the map, lists, tooltips, dialogs and private accessible names from the page, and only
  "I am <player>" continues. The next player's view is built fresh, without the previous player's search, selection, tab
  memory or popups. Coming back, the player first sees "While you were away": the other side's combat results and the
  steps that passed.
- Game End shows the result, with the final save and replay to download; it can be dismissed to look at the final map and
  reappears when a finished game is loaded.
- Loading a save accepts only a save of the scenario now mounted (TODO `load-same-scenario`).

### Accessibility and typography

- Body text is 16 px; supporting text 14 px; the smallest interface text is 12 px (see Decisions). Counter artwork is
  exempt and follows its own level of detail ([map.md](map.md)).
- Native buttons keep their keyboard behavior; dialogs trap focus and return it on close; `:focus-visible` outlines are
  always shown; `prefers-reduced-motion` is honored. Browser zoom is not disabled.
- The canvas map is one focusable `role="application"` element: arrow keys move a visible hex cursor, Enter or Space acts
  on the hex, `+`/`-` zoom, and a polite live region announces the hex (terrain, what it is a target for, the units in it).
  Counters are also reachable through the stack list and the All units roster.
- Tab badges carry their count in the accessible name ("Air, 2 waiting").

### Supported screens

Desktop only: 1920×1080 by default and 1680×1050 supported. The layout is a 60 px top bar over a 400 px command deck and
the map.

## Decisions

- **Desktop only** (user, 2026-09-06): narrow-screen layouts were removed from scope.
- **Smallest interface text 12 px** (user, 2026-10-14), instead of the earlier 13 px. A few labels use it: the New Game
  stage strip and headline labels and the status marks such as FUEL.
- **Unit-centred interaction** (2026-10-01): select a unit, see its reach and targets on the map, preview, confirm. The
  earlier action drop-down and candidate lists were removed because they hid the map and the choices.
- **Results are shown, not inferred**: every combat produces a result card and a readable Log line, because hand-overs
  used to swallow results so that neither player saw them.
- **Pause preserves the game**: the existing SES-01 operation is supported without changing its acceptance criterion.

## Modal keyboard focus

Menu and New Game keep Tab and Shift+Tab inside the visible modal. Switching Settings, Preview
and loading pages restores focus if the old control was removed. Closing returns focus to the
opener when it still exists, otherwise Menu. The stack hover inspection is inert and adds no Tab
stops; the selectable stack list and roster remain keyboard accessible.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `session-reload`, `load-same-scenario`, `TODO-CM2` (screen reader), `deck-state-records`.

## Verification

- `tests/ui/` (controller flow, command deck, counter, map art, typography contract).
- Browser rows UI-01 to UI-05, SES-01 to SES-09 and ACT rows in
  `docs/quality/03-product-operation-verification-plan.md`; scripts in `scripts/product-acceptance/`.

- Keyboard-only New Game, map move, modal confinement and full-turn handoffs: [operations evidence](../quality/evidence/operations-2026-10-15/README.md).

- Roster full-name tooltips at both desktop sizes: [UI-02 evidence](../quality/evidence/roster-tooltip-2026-10-15/README.md).
