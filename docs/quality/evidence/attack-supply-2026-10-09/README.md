# Attack supply declared with the attack: browser evidence (2026-10-09, ACT-07a)

Real Chromium (Playwright) on the built application at 1920×1080, driven by `scripts/attack-supply/acceptance.mjs`. Every step is
a click, key press or file chosen on the page; every check reads the page (`log.md`, `results.json`). Result: **17/17 PASS,
0 page errors**. Re-run after `attackerSupply` became required on every declaration (the AI's included): again 17/17,
0 page errors; the screenshots and `results.json` are from that run.

Rule (user correction 2026-10-08): each attacking unit's combat supply is declared before it takes part in the attack (9.5,
12.4). A unit may use its internal stocks only when it cannot get the SP it needs from dumps in reach (12.10a); the 9.5 example
(three units, 1T) does not let the player keep SP back by choosing internal stocks. In the attack plan each unit therefore
declares its source as it is ticked, in that order, and the attacker is not asked again after Declare.

## Part A: a fresh New Game

New Game: Situation **Axis attack**, 20×14, Compact, 3 divisions (1 armored), no air forces, 3 turns, seeds map 9101 / OOB 9102 /
deployment 9103 / rules 9104.

| Step | Observed | Screenshot |
|---|---|---|
| Axis Movement | I/3 Pz Bn, II/3 Pz Bn and vBohm Recon KG (2.Pz) moved to 1509, next to the Allied unit in 1409 (single-unit fuel paid) | |
| Attack plan 1409 (976 ms) | "1. I/3 Pz Bn … Supply: 1T from the dump at 2008 (25T there)", "2. II/3 Pz Bn … (24T there)", "3. vBohm Recon KG … (23T there)"; no internal option offered | `01-fresh-game-attack-plan.jpg` |
| Declare | prompts after Declare: Allied (after hand-over) defender supply, Allied terrain, Axis (after hand-over) attacker option, Allied (after hand-over) defender option; none asks the attacker for supply | `02-fresh-game-attack-resolved.jpg` |
| Game Turn 1 → 2 | "Turn 2 / 3, Axis player turn, First Player Phase" | |

## Part B: test positions

`scripts/attack-supply/make-saves.mjs` writes two saves of the default New Game (the scenario the page boots, so the page accepts
them) in the Allied Combat Segment: Oden TF and Alanis TF (4.A, one step each, 1T each) in 1612 with the only Allied SP, a 1T dump;
I/33 Pz Bn / 9.Pz in 1712. Every other Allied dump is emptied (the "0 SP" marker on the map comes from that). In the second save
Alanis TF's internal stocks are Exhausted. The dice seed is chosen so both attackers survive, so the marker can be seen afterwards.

| Step | Observed | Screenshot |
|---|---|---|
| Tick Oden TF | "1. Oden TF … Supply: 1T from the dump at 1612 (1T there)", no internal option; unticked Alanis TF: "Would use: Internal stocks (marked Low)" | |
| Tick Alanis TF | "2. Alanis TF … Supply: Internal stocks (marked Low)"; sheet "Your supply cost 2T · 1 on internal stocks" | `03-short-first-dump-second-internal.jpg` |
| Untick Oden TF | Alanis TF becomes 1. and draws the 1T; its internal option is gone; boxes agree with the order | |
| Tick Oden TF again | "1. Alanis TF … dump", "2. Oden TF … Internal stocks (marked Low)"; both boxes ticked | `04-short-reordered.jpg` |
| Declare (441 ms) | Axis (after hand-over): "Defending 1712: 1T of combat supply still to pay"; Allied (after hand-over): advance after combat; the attacker was not asked for supply | `05-short-resolved.jpg` |
| Unit cards (Allied seat) | Oden TF: "Internal stocks Low"; Alanis TF: no marker | `06-short-low-marker.jpg` |
| Exhausted: tick Oden TF | Alanis TF's box is disabled: "Needs 1T but no SP is in reach after the units above, and its internal stocks are Exhausted (12.10c)." | `07-exhausted-blocked.jpg` |
| Exhausted: tick Alanis TF first | "1. Alanis TF … dump", "2. Oden TF … Internal stocks"; Declare resolves without asking the attacker | `08-exhausted-first.jpg` |
| Game Turn 1 → 2 | "Turn 2 / 8, Axis player turn, First Player Phase"; 0 console or page errors | |

## Issues found during these runs

- **Fixed:** the first run showed every unit a choice between two identical-looking options, "1T from the dump at 2008 (13T
  there)" and "… (12T there)": two dumps in one hex. The map shows them as one marker, so the plan now offers one source per hex
  (25T there), drawing from the largest dump first.
- **Fixed:** after unticking and re-ticking, a ticked attacker's box showed unticked. Ticking re-sorts the rows (paying order first)
  and the renderer reused the clicked box for another unit. The box, the lead radio and the source choice are now bound with
  `live()`; the script checks that every box agrees with the paying order.
- Script fixes, not product issues: the first runs never reached contact (the generic "advance" helper does not move units), a
  save of the default scenario was loaded into a different scenario ("This UI currently accepts saves for the loaded scenario
  only", correct), and the first dice seed eliminated both attackers.

## Not exercised here

- A choice between dumps in different hexes, and the combined "dumps at A, B" option (only one hex was in reach in both parts).
- A multi-step attacker on internal stocks with some SP in reach (12.10h: that SP is still spent); covered by rules tests only.
- 21.3 (independents cannot use internal stocks when attacking, double supply cost) is an optional rule (21.0); it is not in
  play, with the other optional rules (`optional-rules`, DEFERRED in the rules manifest).
