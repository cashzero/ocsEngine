# heuristic@79 force concentration: why the attacker does not mass

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`), replayed for measurement.
This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. It is research evidence for the
known gap `bot-force-concentration` (`docs/quality/05-todo-inventory.md`); no policy changed.

## Inputs

- Source: `50eff97` (heuristic@79, the standard), built `dist`.
- Opponent: frozen heuristic@78 (`artifacts/ai-logistics/candidate-78/dist`, from `affa01a`).
- The 16 AXIS_ATTACKS games of the v79h batch ([ai-supply-chain-v79-draw-reach-2026-10-16](../ai-supply-chain-v79-draw-reach-2026-10-16/))
  played again with `--debug`: 32×24, six divisions per side before the attacker's ratio, eight turns, no aircraft,
  TEMPERATE_INLAND 1300200–1300207 and EASTERN_EUROPE 1300300–1300307, `--swap --trace --debug`; heuristic@79 attacks in 8.
- The same 16 games once more with [move-diagnostics.patch](move-diagnostics.patch) applied to a copy of the compiled policy:
  it only adds one debug line per combat unit (the stay score's terms, the three best moves, the best move closer to the target,
  and how many improving moves the supply check refused). Every game's accepted actions matched the unpatched run exactly.

```sh
B=artifacts/ai-logistics/candidate-78/dist
common="--matches 8 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE \
  --engagement AXIS_ATTACKS --allied heuristic --axis heuristic@$B --swap --trace --debug"
node scripts/ai-match.mjs $common --start 1300200 --style TEMPERATE_INLAND --out <dir>/attack-temperate
node scripts/ai-match.mjs $common --start 1300300 --style EASTERN_EUROPE --out <dir>/attack-eastern
node scripts/ai-concentration-study.mjs <dir>/attack-temperate <dir>/attack-eastern --out <dir>
```

## Observed

All 16 games FINISHED, replay ok. Figures are heuristic@79 as the attacker, per Combat Phase from Turn 2 (55 phases), from
[concentration.json](concentration.json) unless named otherwise.

- **Enough strength, spread thin.** Attacker combat strength 297 against about 157 for the defender. About 35 combat units a
  turn go to some 9 targets: assault 1.8, capture 2.2, hunt 3.1 targets. Strength by task: assault 44, capture 56, hunt 62,
  units that did not move 122.
- **Strong stacks are not attacked.** 1.4 regular attacks a phase, against defenders of 4.2 strength on average (the hexes the
  attacker could attack averaged 15.6). 69 of the attackable objective hexes stood in Very Close (47) or Extremely Close (10)
  terrain, where Open 3:1's column (index 6) needs 6:1 or 12:1.
- **Assault groups are sized on raw strength.** A group stops growing at 2.5× the target's estimated strength: 2.6 units with
  24.4 strength against 10. At combat 1.2 of them stood next to the target (11.2 strength). Of 37 assault targets, 20 were
  ever attacked and 18 were held at the end. Seed 1300301: all 6 units next to 10,21 (Very Close) reached only column index 3,
  did not attack, and the effort moved elsewhere the next turn.
- **Units stop 2–3 hexes out** ([move-diagnostics.json](move-diagnostics.json), 1,790 unit decisions). 303 times a unit with an
  assault, capture or hunt target 2–3 hexes from the enemy stayed: 68 had a better move the supply check refused, 235 scored no
  move above staying although a hex closer to the target was in reach. There the closer hex lost on `exposure` (−32.0 on
  average where it applied, 205 cases) and `contact` (−7.2, 206) against `progress` +18.5. Both terms judge the unit with only
  the friendly units already in that hex, and `crowding` charges for stacking.
- **The supply term ends the Combat Segment** ([combat-diagnostics.json](combat-diagnostics.json)). 50 of 61 Combat Segments
  ended with the best attack under the threshold of 4: defender steps +7.9 and attacker steps −8.0 cancel, combat supply −9.8
  decides; 19 of the 50 would pass without the supply term. 21 of the 50 were 1:1.
- **Artillery fires from its Move side.** 363 of 375 attacker guns at the Combat Phase were in Move Mode (the policy changes
  modes only for combat units and HQs). The Move side's Barrage Strength is about half the Combat side's (13 against 25 for an
  Axis division's guns), and both reach 2 hexes. 0.4 barrages a phase; 11 of 76 attacks hit a hex barraged that phase.

Saves, traces and debug logs: the ignored `artifacts/` and job folders of the `ai-truck-shuttle` worktree; the summary JSON is here.
