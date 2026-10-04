# doc 03 §B: MAP-01 to MAP-05 on the NG-07 package

- screenshot 01-map01-mounted-100.jpg
- screenshot 02-map01-mounted-whole-map.jpg
- screenshot 03-map01-entry-hexes-for-arrival.jpg
- PASS MAP-01: Terrain uses visual fill/pattern; roads, rivers, settlements, entry areas and objectives are distinguishable without terrain-name labels on Hexes (judged on the screenshots) — observed: legend "Clear Woods Rough Mountain Marsh Water Road River Objective Move Move ends here Attack Barrage"; 19 settlement hexes and objective 1007 announced by the cursor; 2 entry hexes offered for the first arrival (0307, 0402…); screenshots map01-*
- screenshot 04-map02-after-reset.jpg
- PASS MAP-02: Camera changes after each input and Reset returns to 100% without selecting/moving a unit — observed: zoom 100% → drag (view changed true, zoom 100%, 397 ms) → wheel 110% (331 ms) → + 120% (198 ms) → −− 100% (324 ms) → Reset 100% (294 ms); no unit selected afterwards true; phase unchanged true
- screenshot 05-map03-click-empty-hex.jpg
- screenshot 06-map03-click-own-stack.jpg
- screenshot 07-map03-click-enemy-stack.jpg
- screenshot 08-map03-keyboard-enter-own.jpg
- FAIL MAP-03: Selection is visible; stack panel identifies the Hex and visible pieces (mouse and keyboard) — observed: empty hex 0701 click (64 ms): deck "Place every arriving unit: select it, then click a blue entry hex. / Hex 0701 / No unit of yours here. / Deselect / Arri" | own stack 0601 click (61 ms): deck "Place every arriving unit: select it, then click a blue entry hex. / III / 2 / F2 / 7 / 4 / 14 / Standish TF / 10.A"; stack panel "Hex 0601 · 2 units × III 2 F2 7 4 14 Standish TF / 10.A III 1 F2 7 4 14 Chmbln TF / 10.A" | enemy stack 1106 click (62 ms): deck "Place every arriving unit: select it, then click a blue entry hex. / Hex 1106 / No unit of yours here. / Deselect / Arri"; stack panel "Hex 1106 · 2 units × XXX 67 5-10 Enemy · Ge HQ 67th Corps 1 enemy unit hidden under the top counter." | keyboard Enter on 0601: "Hex 0601 · woods · Standish TF / 10.A, Chmbln TF / 10.A" → deck "Place every arriving unit: select it, then click a blue entry hex. / III / 2 / F2 / 7 / 4 / 14 / Standish TF / 10.A / 06"
- screenshot 09-map05-handoff-privacy.jpg
- screenshot 10-map05-axis-seat.jpg
- PASS MAP-05: Owner-visible data and enemy redaction follow the active seat; no private data leaks — observed: Allied seat sees 1106 as "Hex 1106 · clear · village · enemy Ge HQ 67th Corps, 1 hidden"; Axis owner sees "Hex 1106 · clear · village · Ge HQ 67th Corps, Ge HQ 81st Corps". Axis seat sees Allied 0601 as "Hex 0601 · woods · enemy Standish TF / 10.A, 1 hidden"; Allied owner sees "Hex 0601 · woods · Standish TF / 10.A, Chmbln TF / 10.A". Handoff screen hid the map: true. Hidden names found in the other seat's page DOM: {"alliedDomHasHiddenAxis":[],"axisDomHasHiddenAllied":[]}
- FAIL MAP-04: Both sides/formations and every generated unit remain traceable; projection/stack hiding explains any count difference — observed: preview 64 unit counters (64 units); Allied roster 28 rows, Axis roster 28 rows; preview names not found in either roster: Supply Dump, Supply Dump, Supply Dump, Supply Dump, Supply Dump, Supply Dump, Supply Dump, Supply Dump
- PASS UI-04(map): No browser console or page error during the MAP run — observed: 0 errors

Ended at: Turn 1 / 3, Axis player turn, Reinforcement

Console/page errors: 0

