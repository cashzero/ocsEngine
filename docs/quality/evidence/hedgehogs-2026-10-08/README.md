# Hedgehogs: browser evidence (2026-10-08, NG-13)

Real Chromium (Playwright) on the built application at 1920×1080, driven by `scripts/hedgehog-acceptance.mjs`. Every step is a
click, key press or selection on the page; every check reads the page (`log.md`, `results.json`). Result: **15/15 PASS, 0 page errors**.

New Game: Situation **Axis attack**, 24×16, Compact, 3 divisions (1 armored), no air forces (the attacker's off-map air comes with
the situation), 3 turns, seeds map 8801 / OOB 8802 / deployment 8803 / rules 8804.

| Step | Observed | Screenshot |
|---|---|---|
| New Game help | "…with garrisons dug into hedgehogs on its objectives (Level 2) and on key rail towns and road junctions (Level 1)" | `01-started.jpg` |
| Attacker's view, Turn 1 | 6 enemy hedgehogs drawn with their Level: L2 at 0402, 1308, 1608, 1611; L1 at 1305, 1109 | `02-attacker-sees-hedgehogs.jpg` |
| Defender's view | the same 6, as its own | |
| Dig in (crew) | Chmbln TF / 10.A's Unit tab: "Build a Level 1 hedgehog at 1601 (2 SP from the 12T dump at 1409; crew Chmbln TF / 10.A cannot move this phase)"; pressed: L1 at 1601 on the map (545 ms); ledger "8T paid" | `03-dig-in-offered.jpg`, `04-dug-in.jpg` |
| Engineer build | US HQ 20th Corps in Combat Mode: "Build a hedgehog… (16 hexes)"; at 1102 "Build a Level 1 hedgehog · 8T (2 SP)"; L1 at 1102 on the map | `05-engineer-hedgehog-option.jpg` |
| Game Turn 1 → 2 | "Turn 2 / 3, Allied player turn, First Player Phase" | |
| Reduce | Turn 2, the same HQ: "Reduce the hedgehog at 1102 (it is removed) (engineer work, no SP; this unit cannot move)"; pressed: no hedgehog at 1102 | `06-reduce-offered.jpg`, `07-reduced.jpg` |
| Attack a hedgehog | I/16 Pz Bn / 116.Pz moved 2013 → 1612, next to the Level 2 hedgehog at 1611; attack sheet: "Hedgehog Level 2: −2 combat roll, −1 Surprise, Heavy AT", AR DRM 5 − 1 = 4 | `08-attack-sheet.jpg` |
| Attack resolved | "Axis commander attack on 1611 · 1.5 : 1 · 2:1 · DRM +2" (AR +4, hedgehog −2), surprise roll 7, combat roll 7, Ao1/DL1o1 | `09-attack-resolved.jpg` |

Observations recorded from this run:

- The first run drew the Level disc black, so the number could not be read. The map turns counters into bitmaps outside the
  page and copied only some CSS rules; `hedgehog-` styles were left out. Fixed in `src/ui/map-canvas.ts`, then this run was
  repeated; the screenshots show the white disc.
- The hedgehog marker sits on the lower-left corner of the hex's top counter. It slightly covers the garrison's small supply
  marker and touches the objective star. Both remain readable, and the counter's printed values are not covered. Not blocking.
- The first version of the script tried to reduce a Level 2 garrison hedgehog in the same phase. The game correctly offered
  nothing: the 0.5 RE garrison is not a full crew, and the HQ had already done its one construction. The script now reduces in
  Turn 2, as a player would.
