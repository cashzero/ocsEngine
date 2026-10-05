# Hex control acceptance (13.3h) 2026-10-05

- screenshot 01-preview.jpg
- opened: Turn 1 / 8 · Allied player turn · Movement
- screenshot 02-game-start-no-overlay.jpg
- rail control with the overlay off: 0 entries; on: {"OWN":29,"NEUTRAL":56,"ENEMY":33}
- screenshot 03-trace-overlay-rail-control.jpg
- screenshot 04-trace-overlay-whole-map.jpg
- PASS CTL-1: Rail control is drawn only while the Trace Supply overlay is on, with own, enemy and neutral rail hexes — observed: off: 0; on: {"OWN":29,"NEUTRAL":56,"ENEMY":33}
- truck move: {"id":"generated-oob:206569474:allied:independent-transport-1:unit","name":"Truck","hex":"2506","before":"NEUTRAL","after":"NEUTRAL","announced":"Hex 2506 · Marburg · clear · village · Truck"}
- screenshot 05-truck-on-neutral-rail.jpg
- PASS CTL-2: A truck entering a neutral rail hex leaves it neutral (13.3h) — observed: {"id":"generated-oob:206569474:allied:independent-transport-1:unit","name":"Truck","hex":"2506","before":"NEUTRAL","after":"NEUTRAL","announced":"Hex 2506 · Marburg · clear · village · Truck"}
- combat unit move: {"id":"generated-oob:206569474:allied:f3-combat-1:unit","name":"101.Abn","hex":"0813","before":"NEUTRAL","after":"OWN","announced":"Hex 0813 · clear · 101.Abn"}
- screenshot 06-combat-unit-takes-rail.jpg
- PASS CTL-3: A combat unit entering a neutral rail hex takes control of it (13.3h) — observed: {"id":"generated-oob:206569474:allied:f3-combat-1:unit","name":"101.Abn","hex":"0813","before":"NEUTRAL","after":"OWN","announced":"Hex 0813 · clear · 101.Abn"}
- screenshot 07-handoff-privacy.jpg
- reached Turn 2 / 8 · Axis player turn · Movement; arrivals placed on the way: 4
- rail control at Game Turn 2 (Axis player turn): {"ENEMY":32,"NEUTRAL":53,"OWN":33}
- rail hexes whose control changed since the start (start view Allied, now Axis player turn): 0612 NEUTRAL→ENEMY, 0712 NEUTRAL→ENEMY, 0813 NEUTRAL→ENEMY
- screenshot 08-turn-2-rail-control.jpg
- hex 0813 at Game Turn 2: Hex 0813 · clear · enemy 101.Abn
- PASS CTL-4: One whole Game Turn completes with handoffs and Game Turn 2 arrivals placed — observed: Turn 2 / 8 · Movement; arrivals 4
- screenshot 09-handoff-privacy.jpg
- screenshot 10-objective-neutral-marker.jpg
- objectives at start: 1323 1 VP neutral, 1612 1 VP neutral, 1302 1 VP neutral, 1602 1 VP neutral, 2405 3 VP neutral, 3113 3 VP player 2, 1313 1 VP neutral, 1516 1 VP neutral; top bar "VP HELD ★ Allied 0 ✚ Axis 3 ◆ 9 neutral"; cursor "Hex 1323 · Berburg · clear · town · objective, 1 VP, neutral · no units"
- screenshot 11-objective-taken.jpg
- objective move: {"id":"generated-oob:206569474:allied:f3-combat-1:unit","name":"101.Abn","hex":"1516","before":"not a rail hex","after":"not a rail hex","announced":"Hex 1516 · Wesmar · clear · town · objective, 1 VP, held by Allied · 101.Abn"}; marker holder now 0; top bar "VP HELD ★ Allied 1 ✚ Axis 3 ◆ 8 neutral"
- PASS CTL-5: Objectives show VP and holder on the map, in the hover line and in a live top-bar VP score; a combat unit taking a neutral objective updates all three — observed: start "VP HELD ★ Allied 0 ✚ Axis 3 ◆ 9 neutral", neutral objective line "Hex 1323 · Berburg · clear · town · objective, 1 VP, neutral · no units"; after 101.Abn → 1516: holder 0, line "Hex 1516 · Wesmar · clear · town · objective, 1 VP, held by Allied · 101.Abn", top bar "VP HELD ★ Allied 1 ✚ Axis 3 ◆ 8 neutral"
- console/page errors: 0

Ended at: Turn 2 / 8, Allied player turn, Movement

Console/page errors: 0

