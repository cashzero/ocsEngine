# Command deck and top bar

## Scope

The layout and behavior of the game screen around the map: the top bar, the left command deck with its phase tabs and
task mode, the move popup, the roster and stack list, and keyboard order. Code: `src/ui/browser.ts`,
`src/ui/command-deck.ts`, `web/command-deck.css`. Overall UI rules are in [overview.md](overview.md); the map in
[map.md](map.md).

## Current behavior

### Layout

A 60 px top bar spans the page; below it a 400 px command deck on the left and the map filling the rest. The page and the
deck never scroll as a whole; the deck has exactly one scrolling area, and the All units list scrolls inside its own popup.

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Turn 1/8 · date, weather │ VP │ Rail Cap │ Sea Cap │ [Phase ▾] ↶ Undo [End … · Next: …] │ ☰ Menu │
├──────────────────────┬───────────────────────────────────────────────────────────────┤
│ Step objective        │                                                               │
│ Selected unit · Done  │                          MAP                                  │
│ Tabs · All units (n)  │        reach, path, targets, entry hexes      ┌────────────┐  │
│ the one scroll area   │                                               │ Move popup │  │
│ status line           │                                    legend · zoom · hover info │
└──────────────────────┴───────────────────────────────────────────────────────────────┘
```

### Top bar

- Turn and limit with date and weather; the VP each side holds and the neutral VP; Rail Cap and Sea Cap left when the game
  has them.
- The phase chip names the current step; on hover or focus it opens the whole Player Turn as a track (done, passed
  automatically, current, to come; Reaction shows the acting side).
- **Undo** ([overview.md](overview.md)) and **End**: "End <segment or phase>" with "Next: <step>" below. When it cannot
  end, the reasons are listed under it. With units unmoved, or hexes overstacked, the first press turns it orange
  ("Finish anyway: 3 units have not moved", "Press again to confirm"). Below End the deck also warns of Breakdowns the
  phase end will absorb ([docs/rule-engine/breakdowns.md](../rule-engine/breakdowns.md)).
- ☰ Menu opens the game menu ([overview.md](overview.md)).

### Command deck

From the top: a one-to-three-line objective for the step (with a banner when relevant), the selected unit (counter, name,
hex, mode, supply, status sentence, **Done**), the tab row with **All units (n)**, the scrolling area, and a status line
that appears only when there is a message (`role=status`).

Tabs depend on the step; required work comes first and carries a count:

| Condition | Tab |
|---|---|
| Reinforcement Phase, or units waiting to enter | **Arrivals** (pick a unit, then a blue entry hex) |
| Supply Phase, Breakout Segment, or supply actions open | **Supply** / **Breakout** (internal stocks, formation trace, feeding, breakouts) |
| Aircraft Refit Phase, or a base can refit | **Refit** |
| Rebuilds, consolidations or the replacement tables to show | **Rebuild** (never counted; optional) |
| Combat, Exploitation or a Barrage segment | **Targets** (attackable and barrageable hexes; an empty list says why) |
| Every step except Aircraft Refit | **Unit** (the selected unit's actions: mode, release, fuel, trucks, dumps, Breakdowns, construction, Exchange) |
| Air missions available | **Air** (optional, after Unit, never counted) |
| Supply paid or moved this Player Turn | **Ledger** (read-only: what was paid, from which dump or truck, what is left) |
| Always | **Log** (player-language lines; engine codes in the tooltip) |

- A new step opens its first tab; a tab the player picks stays for the rest of the step.
- Picking a unit switches to Unit, except from the work lists (Arrivals, Supply, Refit, Rebuild).
- The Unit tab's truck section (in the Movement Segment) lists each dump in the hex with a Token amount, the cargo (partly
  unloadable) and splitting; unavailable rows stay listed with the rule's reason. A truck that is the current mover warns
  that moving another unit ends its move (6.1g). Selecting a dump lists the trucks in its hex that can carry it.

### Task mode

These replace the whole tab area, in this order, and give the tabs back afterwards with their scroll position:

1. What must be answered: the hand-over prompt, or a pending decision (defence, losses, retreat, supply payment, first
   player, interception, return to base…). Combat decisions show the steps of that combat and the answers already given.
2. Attack, barrage and air mission drafts: participants, lead unit, facts and odds, supply cost, the rule's blocking
   reasons, Cancel and the action.
3. The combat result card (strengths, odds, DRM, dice, table result in plain words, losses, retreats, advances).
4. "While you were away".

Drafts and decisions are not popups: they are long and would cover the map the player needs to decide. End is disabled
in task mode and says why.

### Moving a unit

Selecting a unit shows its whole reach on the map ([map.md](map.md)). Clicking a reachable hex (or a counter on it) opens
a popup anchored to that hex: destination, cost and MP left, "The move ends there" (enemy ZOC, all-MP terrain or minimum
move), an overstack warning (4.8a), and the rule's first refusal reason (the rest in the Unit tab, Confirm disabled),
with Cancel and Confirm.

- Placed after the destination, else above or below it, last beside the path; it avoids the zoom controls, legend and
  hover line, and sticks to the viewport edge without its arrow when the hex is dragged out of view.
- Focus goes to Confirm (Enter confirms); Escape cancels and returns focus to the hex. Clicking the same hex again also
  confirms. It is not modal and is exclusive with the roster and the stack list.
- After a move the unit and camera stay; the reach is queried again, and the selection clears when the unit cannot move
  further.
- A unit part-way through its move is ended only by **Done** (6.1g); Escape then points at Done.

### Stacks and the roster

- Clicking a counter selects that unit; clicking a multi-unit hex opens the stack list beside it (with the enemy's hidden
  count), from which any own unit can be selected.
- **Move together (6.1f)**: the Unit tab lists the other units in the selected unit's hex; ticking them (or "Whole stack")
  moves them with it on one path, and unticking one of a moving stack drops it off, with a warning that it cannot move
  again this phase.
- **All units (n)** opens the roster popup: grouped by formation, searchable, with Moved/Attacked/Out of supply/DG badges,
  a Moved / Not moved filter in Movement, and off-map and eliminated groups. Focus goes to the search box and returns to
  the button on close. Long names may use an ellipsis; hovering or keyboard-focusing a roster row shows its full name in a tooltip outside the scrolling box. The tooltip stays within the viewport; leaving, scrolling, closing, selecting or handing over removes it. Escape dismisses the tooltip before closing the roster. The row’s accessible name also retains the full unit name.

### Keyboard

- Tab moves between the main areas; the map has one focus entry with arrow keys ([overview.md](overview.md)).
- Escape closes, in order: roster, move popup, stack list, menu, New Game, draft, then clears the selection.
- After a refresh focus returns to the same control or its natural successor; hidden tabs hold no focusable elements.

### Busy and error states

While an action runs, End, Confirm and declaration buttons are disabled and the status line says "Working…"; an action is
never shown as done before it is accepted. A failure keeps the selection and camera and says what went wrong; it is never
shown as "no legal actions". An empty list says so in one sentence.

## Decisions

- **One deck, no right rail** (user, 2026-09-06): the map gets the rest of the screen.
- **Phase tabs and task mode** (2026-10-02): the earlier fixed five-block deck crammed every phase's work into one area;
  tabs follow the step and the answers that must be given come first.
- **End lives in the top bar** next to the phase chip, with a two-press confirmation when units are left unmoved.
- **The move confirmation is a popup on the destination**; drafts and decisions stay in the deck.
- **The defender's choices stay separate decisions**: supply, lead unit and terrain are asked one after another, in one
  panel with the combat's progress. Merging them into one form needs the decision coordinator to accept several answers
  (TODO `defender-single-form`).

## Rail destination review

Rail transport offers legal stations and a "Check another hex" field. Entering a map hex outside
the legal list shows the Rule Engine's reasons and citations, including enemy ZOC and Rail Cap;
confirmation stays disabled. An unknown or empty hex clears the previous destination, so an old
selection cannot be sent accidentally.

## Logistics helpers

The optional Logistics tab in friendly Movement and Supply phases shows transport planning,
chosen-unit fuel comparison and current-position Supply predictions. Its rule simulation,
confirmation and partial-failure contract is owned by [Logistics helpers](../gameplay/logistics.md).

## Known gaps

From `docs/quality/05-todo-inventory.md`: `defender-single-form`, `compound-cost-review`, `deck-state-records`, `enemy-zoc-display`, `overrun-selection-release`,
`unit-status-reserve`, `TODO-CM1`. Observed, not tracked as TODOs: during a hand-over or decision the selected-unit row
still shows the previous selection; a Targets tab that is empty repeats the objective's sentence.

## Verification

- `tests/ui/command-deck.test.ts` (tabs, badges, step changes, popup placement and refusals, End), `tests/ui/flow.test.ts`,
  `undo-action.test.ts`, `stack-movement.test.ts`, `transport-panel.test.ts`, `supply-ledger.test.ts`.
- Browser rows UI-01 to UI-04 and the ACT rows in `docs/quality/03-product-operation-verification-plan.md`; run records in
  `docs/quality/evidence/product-2026-10-14/`.

- Logistics, explicit Supply and rail refusals/front control: [operations evidence](../quality/evidence/operations-2026-10-15/README.md), SUP-B01–08, ACT-06 and RAIL-05–10/15–16.

- Roster full-name tooltips at both desktop sizes: [UI-02 evidence](../quality/evidence/roster-tooltip-2026-10-15/README.md).
