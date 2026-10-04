# Objectives in Major Cities and towns (2026-10-04)

User request 2026-10-04: the map should have more VP, and VP should be in towns. Before this change the
generated game had a single 5 VP objective on the settlement nearest the map centre, often a village. Now
objectives are only on Major Cities (3 VP, on the core Hex) and towns (1 VP). Each side's zone holds the same VP
total, filled with its Major Cities and then its towns nearest the front. Each side starts controlling the
objectives in its own zone. Rule: `docs/game-flow/03-deployment-generator.md` step 7.

**Drivers:** `scripts/objective-acceptance.mjs` and `scripts/map-theme-acceptance.mjs`. Both ran against the
built UI (`npm run build`, `OCS_UI_PORT=4391 node scripts/serve-ui.mjs`) in Microsoft Edge through Playwright
(`OCS_CHROMIUM=.../msedge.exe`) at 1600×1000. Each step is a visible control or the map's keyboard cursor.

**Settings:** the New Game defaults (32×24 Temperate inland, COMPACT, 6 divisions per side, 2 armored,
8 turns, default seeds).

## Observations

| Check | Observed |
|---|---|
| Preview summary | `Objectives 8 · 12 VP`, Warnings 0; 8 objective stars drawn on the preview map |
| Mounted map, keyboard sweep of all 768 Hexes | 8 Hexes announced as objectives, matching the preview |
| Objective Hexes | 1602 Marlay town 1 VP, 1302 Berbach town 1 VP, 2405 Corwyck city 3 VP, 1612 Vaustad town 1 VP, 1313 Dormont town 1 VP, 3113 Lindorf city 3 VP, 1516 Wesmar town 1 VP, 1323 Berburg town 1 VP |
| Objectives off a city or town | 0 |
| Placement | the towns lie along the middle columns where the zones meet (13–16); the two Major Cities lie in their sides' zones |
| Whole turn (`map-theme-acceptance.mjs`, Eastern Europe on the same seeds) | Start → both sides placed arrivals → Game Turn 2 reached at driver step 17, 92 s, browser errors: none |

The same rule on other sizes (from `prepareNewGame`, not the UI): 16×12 Temperate gets 4 objectives at 3 VP a
side; 64×48 Temperate gets 34 objectives at 24 VP a side; 32×24 Eastern Europe gets 4–10 objectives with equal VP.
On 16×12 Eastern Europe the sides start unequal (for example 3 vs 1 VP) and the preview shows an "Objectives are
unbalanced" warning. This stays open as a TODO in the deployment doc.

An earlier version chose each side's largest towns. On this seed none of those towns lay in the middle of the
map, so an 8-turn game would rarely capture one. The rule now prefers the towns nearest the front.

**Not exercised in this run:** no unit moved, so no objective changed hands in the UI. Scores show only on the
Game End dialog (SES-06, still UNVERIFIED). The hover line names an objective's VP but not who holds it, because
the player projection does not carry Hex control.

## Screenshots

- `01-preview-objectives.jpg`: the default preview with 8 objective stars.
- `02-game-start.jpg`: the started game at 100 %; stars at Vaustad, Dormont and Wesmar near the middle.
- `03-game-zoomed-out.jpg`: 70 %, with Berbach, Marlay and the Major City Corwyck also visible.
- `04-eastern-turn-2.jpg`: Game Turn 2 reached in the Eastern Europe whole-turn run.
