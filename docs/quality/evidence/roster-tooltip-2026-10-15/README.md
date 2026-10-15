# Roster full-name tooltip acceptance

Run date: 2026-10-15, Asia/Taipei. Base commit `eca3a07f6e84c25550f4f631f2422d01d91d57ea`
plus the working-tree changes in `fingerprints.json`. Built UI in Playwright Chromium at
1680×1050 and 1920×1080. Screenshots stay in ignored `artifacts/roster-tooltip/<size>/`.

## Acceptance authority

The user explicitly accepted roster-name ellipses when a tooltip shows the full name:
“UI-02應該沒關係吧 用tooltip顯示full name就好了”. The approved exception is recorded in
`03-product-operation-verification-plan.md`; unrelated clipping is still forbidden.
Keyboard focus also exposes the full name and the existing accessible name remains complete.
The earlier failure confirmation is immutable evidence of the earlier criterion and implementation.

## Reproduction and inputs

```sh
npm run build
node scripts/product-acceptance/run-roster-tooltip.mjs artifacts/roster-tooltip 1680x1050
node scripts/product-acceptance/run-roster-tooltip.mjs artifacts/roster-tooltip 1920x1080
```

Choose fresh artifact directories on a rerun. Both runs use actual visible controls, real hover,
Tab/Enter/Escape and legal game actions. No controller calls or injected fixtures.

First preview and start 16×12 / COMPACT / 1 division / 0 armored / no air / 2 turns,
seeds 23111/23112/23113/23114. Then visibly change to the exact NG-07:
TEMPERATE_INLAND / 18×12 / LARGE / 4 divisions / 2 armored / no air / 3 turns,
seeds 91001/91002/91003/91004; preview and start the same package.

## Expected and observed

Open All units. Inspect all clipped names and the reported witness `Chmbln TF (Det. 2) / 10.A`.
The compact row still ellipsizes, but hover shows the complete, exact name in the tooltip at both
sizes. Tooltip is fully inside the viewport, 187.77×36.19 px, with no internal clipping. Hover
activation takes 57 ms at 1680 and 52 ms at 1920, under the 1,000 ms ordinary-interaction budget.

Move pointer away: tooltip disappears. Tab from roster search to that row: tooltip shows the same
full name; the row accessible name is `Chmbln TF (Det. 2) / 10.A, 0505`.
Escape hides only the tooltip; the roster stays open. Enter selects that actual unit, closes the
roster and clears tooltip text. The selected unit card names it in full.

Change the selected unit legally to Move Mode. Complete the whole Game Turn, including required
handoffs and the first-player decision. Final state at both sizes: Turn 2/3, Axis Reinforcement,
no pending decision, tooltip hidden. Mounted game, roster and final game have no page overflow or
whole-deck scrolling; map, phase and End remain reachable. Zero console/page errors.

**UI-02 observed result: PASS under the user-approved exception.** SES-09 remains FAIL and was
not changed by this work. Its reload behavior was not part of this tooltip acceptance.

## Screenshot review

Opened and reviewed:

- Both sizes, `03-full-name-hover.jpg`: compact row ends with ellipsis, while the floating tooltip
  below it reads `Chmbln TF (Det. 2) / 10.A` in full. Its border and text are not clipped by the roster.
- 1680×1050, `04-full-name-keyboard.jpg`: focused row has a visible gold outline and the same
  complete tooltip; the map toolbar and End stay visible.
- Selection and complete-turn state are recorded in `observations.json` and the runner screenshots;
  these checks use real selection, mode change, required decisions and handoffs.

## Implementation and regression

Roster rows carry the same projected full name used by their accessible labels. One floating
text-only tooltip sits outside the roster's scrolling box and clamps to the viewport. Pointer
leave, blur, scrolling, resizing, rerender/selection/closing and private handoff clear it; Escape
can dismiss it without closing the roster. No rule-state, persistence or generation code changes.

Typecheck, build and smoke exit 0. Existing command-deck regression: 8 tests passed (1 file),
8.21 s. Reusable acceptance scripts pass `node --check`; `git diff --check` is clean.
The full suite was not repeated for this presentation-only follow-up; the previous full run
remains in the operations evidence, and the actual integrated tooltip/turn flows were rerun here.
