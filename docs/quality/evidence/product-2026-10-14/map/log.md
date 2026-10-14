# doc 03 §B: MAP-01 to MAP-05 on the NG-07 package

- screenshot 01-map01-mounted-100.jpg
- screenshot 02-map01-mounted-whole-map.jpg
- PASS MAP-01: Terrain uses visual fill/pattern; roads, rivers, settlements, entry areas and objectives are distinguishable without terrain-name labels on Hexes (judged on the screenshots) — observed: legend "✈ AEP Clear Woods Rough Mountain Marsh Water Road Railroad River Objective Supply source"; 22 settlement hexes and objective 0204,1106,1706,0807,0408,1411 announced by the cursor; entry-area marks on the Preview: 2 first-side, 2 second-side (judged on the mounted-map screenshots; no Game Turn 1 arrivals to select); screenshots map01-*
- screenshot 03-map02-after-reset.jpg
- PASS MAP-02: Camera changes after each input and Reset returns to 100% without selecting/moving a unit — observed: zoom 100% → drag (view changed true, zoom 100%, 357 ms) → wheel 110% (316 ms) → + 120% (186 ms) → −− 100% (315 ms) → Reset 100% (281 ms); no unit selected afterwards true; phase unchanged true
- screenshot 04-map03-click-empty-hex.jpg
- screenshot 05-map03-click-own-stack.jpg
- screenshot 06-map03-click-enemy-stack.jpg
- screenshot 07-map03-keyboard-enter-own.jpg
- PASS MAP-03: Selection is visible; stack panel identifies the Hex and visible pieces (mouse and keyboard) — observed: empty hex 0401 click (56 ms): deck "Move units one at a time: select a unit to see its range. Red rings mark overrun targets. / Hex 0401 / No unit of yours " | own stack 0402 click (54 ms): deck "Move units one at a time: select a unit to see its range. Red rings mark overrun targets. / X / 749 / (0) / 0 / 12 / US "; stack panel "Hex 0402 · 2 units × X 749 (0) 0 12 US 749 Engr Gp XXX 21 9-16 US HQ 21st Corps" | enemy stack 1304 click (54 ms): deck "Move units one at a time: select a unit to see its range. Red rings mark overrun targets. / Hex 1304 / No unit of yours "; stack panel "Hex 1304 · 2 units × III 115 15.PG 7 4 3 Enemy · 115 Pz Rgt / 15.PG 1 enemy unit hidden under the top counter." | keyboard Enter on 0402: "Hex 0402 · Genheim · clear · town · US 749 Engr Gp, US HQ 21st Corps" → deck "Move units one at a time: select a unit to see its range. Red rings mark overrun targets. / X / 749 / (0) / 0 / 12 / US "; stack panel "Hex 0402 · 2 units × X 749 (0) 0 12 US 749 Engr Gp XXX 21 9-16 US HQ 21st Corps"
- screenshot 08-map05-handoff-privacy.jpg
- screenshot 09-map05-axis-seat.jpg
- PASS MAP-05: Owner-visible data and enemy redaction follow the active seat; no private data leaks — observed: Allied seat sees 1304 as "Hex 1304 · clear · enemy 115 Pz Rgt / 15.PG, 1 hidden"; Axis owner sees "Hex 1304 · clear · 115 Pz Rgt / 15.PG, 104 Mot Inf Rgt / 15.PG". Axis seat sees Allied 0402 as "Hex 0402 · Genheim · clear · town · enemy US 749 Engr Gp, 1 hidden"; Allied owner sees "Hex 0402 · Genheim · clear · town · US 749 Engr Gp, US HQ 21st Corps". Handoff screen hid the map: true. Hidden names found in the other seat's page DOM: {"alliedDomHasHiddenAxis":[],"axisDomHasHiddenAllied":[]}
- FAIL MAP-04: Both sides/formations and every generated unit remain traceable; projection/stack hiding explains any count difference — observed: Preview: 70 counters, of which 8 supply dumps, and "62 units"; Allied roster 29 rows, Axis roster 35 rows (64); menu line after Start "Meeting engagement · 62 units · 8 formations · 3 turns · seeds map 91001, OOB 91002, deployment 91003, rules 91004"; Preview unit counters not found in either roster: US 748 FA Gp, Ge Arty Rgt 303; roster rows with no Preview counter: II 1 1 0 US Garrison Bn, II 1 1 0 US Garrison Bn, II 1 1 0 US Garrison Bn, II 1 1 0 Ge Landesschützen Bn, II 1 1 0 Ge Landesschützen Bn, II 1 1 0 Ge Landesschützen Bn. Any difference must be explained on screen (the Preview and rosters carry no such note in this run)
- PASS UI-04(map): No browser console or page error during the MAP run — observed: 0 errors

Ended at: Turn 1 / 3, Axis player turn, Movement

Console/page errors: 0

