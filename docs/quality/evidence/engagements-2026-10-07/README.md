# Engagements 0.5.0: browser evidence (2026-10-07)

Real Chromium (Playwright headless shell 1243) on the built application at 1920×1080, driven through
`scripts/product-acceptance/session.mjs`. Each step is a script under `*/steps/NNN.mjs`, and its result is next to it in `NNN.out`.
Every action is a click, a selected option or a key press on a visible control. Every observation is read from the page.

## `final/` — the final build (acceptance evidence for SCN-R7 and NG-11)

| Step | Operation | Observed |
|---|---|---|
| 001 | Open New Game, read the Situation select, pick **Allied attack**, then Generate | Three options: Meeting engagement (selected), Allied attack, Axis attack. Each one's help text states the start and the victory condition. The preview shows Scenario "Allied attack" and Objectives 8 · 12 VP; every metric fits its box; 0 page errors |
| 002 | Pick **Axis attack**, Generate, Start, then sweep the map with the keyboard cursor | Preview: Scenario "Axis attack", 75 units, 15 formations, 12 · 12 VP, 0 warnings, plus the help paragraph under the map. Mounted game: Turn 1, **Axis player turn, the screen with the Axis commander**, no hand-over. Menu: "Axis attack · 75 units …". All 12 objective hexes hold an Allied (enemy) Objective Garrison |
| 003 | Select an Axis recon battalion in the roster, pay fuel in the fuel panel, move it with the map cursor | Fuel paid from the 15T dump at 2710; moved 2611 → 0212. Tracked units are not stopped by ZOC (4.5a), so the move went through a gap in the line |
| 004 | Play on the plain way (end steps, take the first decision option, hand over) | Axis and Allied player turns, the hot-seat screen with the map hidden, then Turn 2 and the First Player decision |
| 005 | New Game, **Meeting engagement**, Generate, Start, sweep the map | Preview and mounted game agree: 32×24, 45 deployed hexes = 45 occupied hexes, terrain identical hex by hex (768 hexes) |

## Earlier runs (issues found and fixed)

- `01-*.jpg` and `02-*.jpg` in this folder (first build): the scenario paragraph overlapped the Warnings metric, and a seventh
  metric wrapped. Fixed by moving the paragraph under the map and making the metrics row 7 columns wide (`04-scn09-*.jpg`).
- The label "Axis attack · Allied defends" wrapped out of its metric box. It is now "Axis attack"; the paragraph says who defends.
- `05-scn10-started.jpg`: the attack opened on Axis's turn while the Allied commander held the screen, so the game began with a forced
  hand-over, and the bar read "Axis player turn · Allied to act". Now the screen starts with whoever acts first (`src/gameplay/engine.ts`).
- `part2/`: the map sweep reported 77 "terrain mismatches". This was a harness bug: settlement names are announced before the
  terrain. The parser in `scripts/product-acceptance/lib.mjs` was fixed, and the comparison then showed 0 mismatches.
