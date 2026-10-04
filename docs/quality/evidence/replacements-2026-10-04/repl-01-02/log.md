# REPL-01 / REPL-02 ground duel with built-in Pax and Eq (rules seed 6104)

- PASS REPL-01: The New Game form has no Air support option and says both sides receive Pax and Eq every turn — observed: air-support select present: false; help: "Each side receives Pax and Eq replacements every turn."
- screenshot 01-new-game-form.jpg
- New Game: Standard scale, Air forces None (ground duel), seeds {"map":6101,"oob":6102,"deployment":6103,"rules":6104}
- PASS REPL-02: Turn 1 (Allied): Pax and Eq are listed among the arrivals in a game without air forces — observed: Reinforcements arriving (4) Select a unit, then click a blue entry hex on the map (aircraft arrive at an Air Base; Pax and Eq at an entry hex or within 2 hexes of an HQ, where they rebuild units). III 208 9 3 2 14 US 208 FA Gp off map · Move mode · arriving A 
- PASS REPL-02: Turn 1 (Allied): the replacement counters print "Repl PAX" and "Repl EQ" with their quantity — observed: printed: EQ, PAX
- screenshot 02-turn-1-Allied-arrivals.jpg
- PASS REPL-02: Turn 1 (Allied): the Pax and Eq stand in 0107 as separate counters — observed: Hex 0107 · clear · Allied Supply Source · Allied Personnel replacements, Allied Equipment replacements, Brown TF / 6.A, Kenndy TF / 6.A, US 208 FA Gp, Supply dump
- Turn 1 Allied: HQ at 0608 put in Combat Mode (13.5a)
- PASS REPL-02: Turn 1 (Axis): Pax and Eq are listed among the arrivals in a game without air forces — observed: Reinforcements arriving (4) Select a unit, then click a blue entry hex on the map (aircraft arrive at an Air Base; Pax and Eq at an entry hex or within 2 hexes of an HQ, where they rebuild units). III 682 13 3 2 14 Ge Arty Rgt 682 off map · Move mode · arrivin
- PASS REPL-02: Turn 1 (Axis): the replacement counters print "Repl PAX" and "Repl EQ" with their quantity — observed: printed: EQ, PAX
- screenshot 03-turn-1-Axis-arrivals.jpg
- PASS REPL-02: Turn 1 (Axis): the Pax and Eq stand in 1807 as separate counters — observed: Hex 1807 · clear · Axis Supply Source · Axis Personnel replacements, Axis Equipment replacements, 5+6/I/12 Pz Bn (-) / 12.SS, 1+3/1/12 Pz Bn (-) / 12.SS, Ge Arty Rgt 682, Supply dump
- Turn 1 Axis: HQ at 1505 put in Combat Mode (13.5a)
- PASS REPL-02: A whole game turn of the ground duel is completed with Pax and Eq arriving — observed: now Turn 2 / 4 Axis player turn First Player Phase; arrival phases with Repls: 2
- PASS REPL-02: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 2 / 4, Axis player turn, First Player Phase

Console/page errors: 0

