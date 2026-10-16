# Hedgehogs on half the objectives: browser evidence (NG-13)

Real Chromium (Playwright) on the built application at 1920×1080, driven by `scripts/hedgehog-acceptance.mjs` on the commit that
adds this folder. Every step is a click, key press or selection on the page; every check reads the page (`log.md`,
`results.json`). Result: **15/15 PASS, 0 page errors**. Screenshots are in the ignored `artifacts/hedgehog-share/` and were
reviewed; what they show is written below.

New Game: Situation **Axis attack**, 24×16, Compact, 3 divisions (1 armored), no air forces, 3 turns, seeds map 8801 / OOB
8802 / deployment 8803 / rules 8804 (the same inputs as `hedgehogs-2026-10-08`).

Expected: the help text and the map follow the current rule (half the defender's objectives dug in, the most valuable at
Level 2, the rest Level 1; every key point Level 1); digging in, building, reducing and attacking a hedgehog work as before.

| Step | Observed | Screenshot |
|---|---|---|
| New Game help | "…with garrisons on its objectives (half of them dug into hedgehogs, the most valuable at Level 2, the rest at Level 1) and on key rail towns and road junctions (hedgehogs at Level 1)" | `01-started.jpg` |
| Attacker's view, Turn 1 | 4 enemy hedgehogs: L2 at 0402 (Genheim, the 4 VP objective), L1 at 1308 (objective), 1305 and 0209 (key points). The objectives at 1608 and 1611, Level 2 in the 2026-10-08 run, have none | `02-attacker-sees-hedgehogs.jpg` |
| Defender's view | the same 4, as its own | |
| Dig in (crew) | Chmbln TF / 10.A: "Build a Level 1 hedgehog at 1613 (2 SP from the 12T dump at 1508; …)"; L1 at 1613 (543 ms); ledger "8T paid" | `03-dig-in-offered.jpg`, `04-dug-in.jpg` |
| Engineer build | US HQ 20th Corps: "Build a hedgehog… (30 hexes)"; at 1611 "Build a Level 1 hedgehog · 8T (2 SP)"; L1 at 1611 | `05-engineer-hedgehog-option.jpg` |
| Game Turn 1 → 2 | "Turn 2 / 3, Allied player turn, First Player Phase" | |
| Reduce | the HQ at 1308: "Reduce the hedgehog at 1308 (it is removed) (no SP; …)"; no hedgehog at 1308 | `06-reduce-offered.jpg`, `07-reduced.jpg` |
| Attack a hedgehog | Stephan KG / 116.Pz 2014 → 1405, next to the Level 1 hedgehog at 1305 (US Garrison Bn); attack sheet "Hedgehog Level 1: −1 combat roll, −1 Surprise, Heavy AT", odds 2:1, AR DRM 5 − 1 = 4 | `08-attack-sheet.jpg` |
| Attack resolved | Combat Result panel: "Axis commander attack on 1305 · 1.5 : 1 · 2:1 · DRM +3", Ae4/DL1o2, "US Garrison Bn eliminated" | `09-attack-resolved.jpg` |

Observations:

- The script first picked the hedgehog the HQ had built at 1611 as its attack target; that hex holds no unit, so no attack sheet
  opened (one FAIL). Before this change every hedgehog stood on a garrison. The script now attacks only opening hedgehogs, which
  stand on garrisons; the rerun above passed every check.
- The script's "attack resolved" note is empty: its selector no longer matches the Combat Result panel. The screenshot shows the
  result; the note is not one of the checks.
- The key points differ from the 2026-10-08 run (0209 instead of 1109): the attacker now fields twice the divisions, which moves
  its deployment and the hexes key points avoid.
