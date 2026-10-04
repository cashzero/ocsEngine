# MAP-06 run: Eastern Europe (Russia) map theme (2026-10-04)

**Driver:** `scripts/map-theme-acceptance.mjs`. It runs against the built UI (`npm run build`,
`OCS_UI_PORT=4417 node scripts/serve-ui.mjs`) in Microsoft Edge through Playwright
(`OCS_CHROMIUM=.../msedge.exe`) at 1600×1000. Every step is a visible control:

- the menu and the New Game style selector;
- Generate operation and Start;
- the Arrivals list and the map's keyboard cursor with Enter on a blue entry hex;
- End phase and the hot-seat handoff buttons.

**Settings:** the New Game defaults (32×24, COMPACT, 6 divisions per side, 2 armored, 8 turns, default seeds).
Only the style changes: Temperate inland first, then Eastern Europe (Russia) on the same seeds.

## Observations (console log of the run)

| Check | Observed |
|---|---|
| Style options | `Temperate inland`, `Mediterranean coast`, `Eastern Europe (Russia)` |
| Temperate preview (Generate 511 ms) | terrain fills: 452 clear, 191 woods, 118 rough, 7 marsh; 387 road paths (288 main); 119 rail paths (39 multi-track) |
| Eastern preview (Generate 680 ms) | terrain fills: 578 clear, 164 woods, 11 rough, 15 marsh, no mountain; 207 road paths (121 main); 83 rail paths (39 multi-track) |
| Eastern ÷ temperate | roads 0.53, rails 0.70 |
| Preview summary | Map 32×24, 48 units, 12 formations, 32 deployed hexes, 1 objective, 0 warnings |
| Started game | map card `32×24 · eastern europe`; the legend lists Clear … Railroad, River, Objective, Supply source |
| Allied Reinforcement | 4 arrivals (FA Gp, Eq, Pax, supply dump) placed at entry Hex 0102, a rail Hex; End phase → Movement → handoff |
| Axis Reinforcement | 4 arrivals placed at entry Hex 3202; End phase → Movement → First Player Phase of Game Turn 2 |
| Whole turn | reached `TURN 2` at driver step 17, 97.5 s, browser errors: none |

The first attempt stalled in the Allied Reinforcement Phase because the driver lacked the keyboard entry-hex
placement that `scripts/rail-acceptance.mjs` has. The UI showed "Every arriving reinforcement must be placed
before the phase ends", which is the expected guard. With the placement step added, the run passed. This was
a driver issue, not a product issue.

**Not exercised in this run:** no unit moved and no combat took place. The turn used arrivals, phase ends
and handoffs only, the same boundary as RAIL-01/02. Eastern terrain uses the existing terrain kinds and TEC,
so movement and combat rules are unchanged from the other themes.

## Screenshots

- `eastern/01-temperate-preview.jpg`, `eastern/02-eastern-preview.jpg`: the same seeds and the same size.
  The eastern map is visibly flatter and emptier: a thin road mesh, one trunk railway with spurs to the entry
  hexes, a forest mass and wooded riverbanks, a few hill hexes, and no mountains.
- `eastern/03-eastern-dialog.jpg`: the New Game dialog with the eastern preview.
- `eastern/04-eastern-game-start.jpg`: the mounted eastern map at the start of Game Turn 1.
- `eastern/05-eastern-turn-2.jpg`: Game Turn 2 reached.
