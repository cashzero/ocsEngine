# Hex control acceptance run (13.3h), 2026-10-05

User requests (2026-10-05): only combat units change Hex control; a generated scenario sets initial control with neutral
ground in the middle ("也要有中立格 因為預設產生的劇本中間是沒有控制的"); objectives follow the same control (option A); rail
control is shown only while the Trace Supply overlay is on, along the track: own green, enemy red, neutral white dashed;
VP shown after bcsEngine (`E:\work\bcsEngine`, HexMap victory markers and TopBar score): each objective always shows its
holder's mark (Allied white star, Axis black cross, neutral gold diamond) and its VP, the hover line names the holder,
and the top bar shows the VP each side holds now.

Driver: `scripts/control-acceptance.mjs` (built UI, Edge through `OCS_CHROMIUM`, 1600×1000). Every step is a visible
control (menu, Generate, Start, Trace Supply toggle, roster, map keyboard cursor, Confirm move, End phase, hand-over
buttons, Arrivals). Control is read from the state the map is drawing (`window.ocsMap.state.railControl`) and from
the screenshots. Default New Game (32×24 Temperate inland, seeds `0x0c500001`–`0x0c500004`).

| Check | Observed | Result |
|---|---|---|
| CTL-1 rail control drawn only with the overlay on, all three kinds present | overlay off: 0 entries; on: 29 own, 56 neutral, 33 enemy rail Hexes ([03](03-trace-overlay-rail-control.jpg), [04](04-trace-overlay-whole-map.jpg)); legend lists Your rail / Enemy rail / Neutral rail | PASS |
| CTL-2 a truck entering a neutral rail Hex leaves it neutral | Allied Truck moved to 2506 (Marburg, village): NEUTRAL before and after ([05](05-truck-on-neutral-rail.jpg)) | PASS |
| CTL-3 a combat unit entering a neutral rail Hex takes it | 101.Abn moved to 0813: NEUTRAL → OWN ([06](06-combat-unit-takes-rail.jpg)); the Hexes it passed, 0612 and 0712, also became Allied (entering, 13.3h) | PASS |
| CTL-4 one whole Game Turn with hand-overs and Game Turn 2 arrivals | Turn 1 Allied and Axis player turns, hand-overs ([07](07-handoff-privacy.jpg)), 4 arrivals placed in Game Turn 2; ended at Turn 2 / 8, Axis player turn, Movement. From the Axis view the three Hexes above show as enemy rail ([08](08-turn-2-rail-control.jpg)); no other rail Hex changed control | PASS |
| CTL-5 objectives show VP and holder on the map, in the hover line and in a live top-bar score | At start the top bar reads "★ Allied 0 ✚ Axis 3 ◆ 9 neutral" (8 objectives; only 3113, 3 VP, starts held, by the Axis); the cursor on 1323 reads "objective, 1 VP, neutral" ([10](10-objective-neutral-marker.jpg)). In the Allied Movement Phase of Game Turn 2, 101.Abn entered 1516 (Wesmar, town, 1 VP): its marker turned to the Allied star above the counter, the line reads "objective, 1 VP, held by Allied", the top bar "★ Allied 1 ✚ Axis 3 ◆ 8 neutral" ([11](11-objective-taken.jpg)) | PASS |

Console/page errors: 0.

Observations recorded, not blocking these checks:

- The objective marks are about 1.4× the old printed star; at 60% zoom the Axis cross is readable but small (judged on 04).
- The New Game preview still draws objectives as the old gold star; it shows no holder.
- On the light green trace wash, the green "own rail" band contrasts less than the red and white ones (judged on 04).
- Most objectives start neutral on this map (default seed: Axis holds one 3 VP objective, Allied none), as decided
  with option A; the opening score is not level.
- These checks are agent-defined (CTL-1–5) and are not rows of doc 03; they need the user's approval before being
  added there.
