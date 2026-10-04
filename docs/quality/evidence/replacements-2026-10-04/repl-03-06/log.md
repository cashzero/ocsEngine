# REPL-03 to REPL-06 on the replacement test position (Menu → Load save, then UI only)

- Position: {"rulesSeed":1,"axisHq":{"name":"Ge HQ 86th Corps","hex":"2708"},"division":{"name":"79.VG","hex":"2708"},"victim":{"name":"1+3/1/12 Pz Bn (-) / 12.SS","hex":"2508"},"attackers":[{"name":"9.Inf","hex":"2507"},{"name":"84.Inf","hex":"2408"},{"name":"83.Inf","hex":"2509"}],"truck":{"name":"Truck","hex":"2912"},"capturer":{"name":"17.Abn","hex":"2812"}}
- Loaded the test position: {"turn":"Turn 1 / 8","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Save loaded at revision 0.","handoff":false,"complete":false,"decision":[]}
- screenshot 01-position-loaded.jpg
- PASS REPL-06: The Allied Leg unit at 2812 moves into the lone Axis truck at 2912 and captures part of it — observed: Abn moved 2812 → 2912 Allied commander captured 3 of 5 transport points at 2912 (roll 4); the rest must displace.
- screenshot 02-truck-captured.jpg
- screenshot 03-attack-plan.jpg
- PASS REPL-03: The Allied attack on 2508 eliminates the one-step Axis Armor unit — observed: SS eliminated OK You chose the advance after combat Result Ao1/DL1o1: Attacker takes 1 option (each a step loss or a hex of retreat); defender loses 1 step and takes 1 option (each a step loss or a hex of retreat).
- screenshot 04-attack-result.jpg
- PASS REPL-02: Turn 1 Axis: Pax and Eq arrive — observed: Reinforcements arriving (4) Select a unit, then click a blue entry hex on the map (aircraft arrive at an Air Base; Pax and Eq at an entry hex or within 2 hexes of an HQ, where they rebuild units). III
- Turn 1 Axis: arrivals placed nearest the HQ at 2708
- PASS REPL-03: Turn 1 Axis: a Rebuild tab is offered once the Repls stand in the HQ hex — observed: Arrivals, Rebuild, Unit, Log
- screenshot 05-turn-1-rebuild-panel.jpg
- PASS REPL-03: The Rebuild tab lists the Dead Pile Armor unit at 1 Eq a step, with its placement mode — observed: All reinforcements are placed. 1 7 SP Supply dump 3207 · Supply · 28T (7 SP) Cannot move in this step Deselect Arrivals Rebuild Unit Log All units (22) Rebuild units Repls in a hex at or within 2 hexes of an HQ in Combat Mode, and not in an enemy ZOC, rebuild units: each step of an Armor, Mech or artillery unit costs 1 Eq, each step of any other unit 1 Pax. A Dead Pile unit returns in the Repls' hex; a reduced unit must be stacked with them. Units with the no-rebuild dot never return (13.5c). 1 
- PASS REPL-04: The Rebuild tab lists the reduced Axis division in the Repls' hex at 1 Pax a step — observed: All reinforcements are placed. 1 7 SP Supply dump 3207 · Supply · 28T (7 SP) Cannot move in this step Deselect Arrivals Rebuild Unit Log All units (22) Rebuild units Repls in a hex at or within 2 hexes of an HQ in Combat Mode, and not in an enemy ZOC, rebuild units: each step of an Armor, Mech or ar
- PASS REPL-06: The captured truck points can be rebuilt with Eq (13.5e) — observed: Truck points lost to the enemy to rebuild (1 Eq each, up to 1)
- PASS REPL-03: Asking for one truck point as well (2 Eq in all) is refused: the Eq in the hex are not enough — observed: This rebuild takes 2 Eq; the hex holds 1.; button disabled: true
- screenshot 06-turn-1-rebuild-refused.jpg
- PASS REPL-03: Rebuilding spends 1 Pax and 1 Eq (434 ms, budget 1,500 ms) — observed: placement mode COMBAT; notice "Rebuilt 2 units with 1 Pax and 1 Eq."
- PASS REPL-03: The Armor unit returns from the Dead Pile in the HQ hex — observed: SS returned from the Dead Pile with 1 step at 2708.
- PASS REPL-04: The reduced division regains a step in place — observed: VG regained with 1 step at 2708.
- Hex 2708 now: Hex 2708 · woods · 1+3/1/12 Pz Bn (-) / 12.SS, 79.VG, Ge HQ 86th Corps
- screenshot 07-turn-1-rebuilt.jpg
- PASS REPL-02: Turn 2 Axis: Pax and Eq arrive — observed: Reinforcements arriving (3) Select a unit, then click a blue entry hex on the map (aircraft arrive at an Air Base; Pax and Eq at an entry hex or within 2 hexes of an HQ, where they rebuild units). Eq 
- Turn 2 Axis: arrivals placed nearest the HQ at 2708
- PASS REPL-06: Turn 2 Axis: a Rebuild tab is offered once the Repls stand in the HQ hex — observed: Arrivals, Rebuild, Unit, Log
- screenshot 08-turn-2-rebuild-panel.jpg
- PASS REPL-06: Turn 2 Axis: one captured truck point is rebuilt for 1 Eq as a truck in the Eq hex — observed: Truck points lost to the enemy to rebuild (1 Eq each, up to 1); notice "Rebuilt 1 unit and 1 truck point with 1 Pax and 1 Eq."
- PASS REPL-06: The Log reports the rebuilt truck point — observed:  1 truck point rebuilt at 2708.
- screenshot 09-turn-2-truck-rebuilt.jpg
- PASS REPL-05: Game Turns 1 and 2 are completed through the deck with the rebuilds, including hot-seat handoffs — observed: now Turn 3 / 8 Allied player turn First Player Phase
- PASS REPL-05: Saving after the rebuilds and loading the file restores the same turn, phase and HQ hex (1038 ms) — observed: Turn 3 / 8 First Player Phase → Turn 3 / 8 First Player Phase; hex 2708: "Hex 2708 · woods · enemy 1+3/1/12 Pz Bn (-) / 12.SS, 3 hidden" → "Hex 2708 · woods · enemy 1+3/1/12 Pz Bn (-) / 12.SS, 3 hidden"
- screenshot 10-loaded-back.jpg
- PASS REPL-05: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 3 / 8, Allied player turn, First Player Phase

Console/page errors: 0

