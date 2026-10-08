# Rail Cap through the page (RAIL-11 to RAIL-14)

- PASS RAIL-11: The form shows each side's default Rail Cap (0.4 per division: Allied 2, Axis 2) and what it is for — observed: Allied 2, Axis 2; help: "SP or RE each side can move by rail every Movement Phase (13.3b), from the map edge to its railhead; trucks carry supply on to the front. Default: 0.4 point per division."
- screenshot 01-preview.jpg
- PASS RAIL-11: The preview shows the Rail Cap the player set (Allied 5, Axis 1) — observed: Allied 5 · Axis 1
- New Game: Allied attack, 32×24, Compact, 4 divisions (1 armored), no air forces, 4 turns, Rail Cap Allied 5 / Axis 1, seeds {"map":9111,"oob":9112,"deployment":9113,"rules":9114}
- Rail panel for Alanis TF / 4.A, 0720: Rail from 0720 Rail Cap 5 of 5 left this Movement Phase 13.3b Oden TF / 4.A 1 Rail Cap Alanis TF / 4.A 1 Rail Cap Detrain at Choose a station (or click a highlighted hex) 0223 · 9 hexes 0412 · 9 hexes 0207 · 16 hexes 0208 · 15 hexes 0515 · 6 hexes 0211 · 12 hexes 0320 · 6 hexes 0202 · 26 hexes 0507 
- PASS RAIL-12: Selecting a unit at a station shows Rail from <hex> with the Rail Cap left (5 of 5) — observed: Rail from 0720 Rail Cap 5 of 5 left this Movement Phase 13.3b Oden TF / 4.A 1 Rail Cap Alanis TF / 4.A 1 Rail Cap Detrain at Choose a station (or click a highli
- PASS RAIL-12: The stations the cargo can reach are highlighted on the map — observed: 12 highlighted: 0223, 0412, 0207, 0208, 0515, 0211
- screenshot 02-rail-unit-ready.jpg
- PASS RAIL-12: Clicking a highlighted station picks it and the panel prices the move — observed: Costs 1 of 5 Rail Cap left
- screenshot 03-rail-unit-done.jpg
- PASS RAIL-12: Move by rail: the unit detrains at the station and the notice names the cost — observed: Moved 1 unit by rail from 0720 to 0202 for 1 Rail Cap. (1251 ms from map click to result)
- PASS RAIL-12: The unit is drawn at the destination station — observed: generated-oob:9112:allied:f2-combat-1:unit at 0202
- PASS RAIL-13: Game Turn 1 is played to its end through both players' phases and hand-offs — observed: 6 steps seen; now Turn 2 / 4
- PASS RAIL-14: The new SP at the rail entry show the rail panel, saying this turn's arrivals may entrain there (13.6b) — observed: Rail Cap 5 of 5 left this Movement Phase 13.3b · this turn's arrivals may entrain here (20T) 13.6b
- screenshot 04-rail-sp-ready.jpg
- screenshot 05-rail-sp-done.jpg
- PASS RAIL-14: 8T of the new SP go by rail from the entry to 0907 — observed: Costs 2 of 5 Rail Cap left → Moved 8T by rail from 0123 to 0907 for 2 Rail Cap.
- Final position: {"turn":"Turn 2 / 4","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Moved 8T by rail from 0123 to 0907 for 2 Rail Cap.","handoff":false,"complete":false,"decision":[]}

Ended at: Turn 2 / 4, Allied player turn, Movement

Console/page errors: 0

