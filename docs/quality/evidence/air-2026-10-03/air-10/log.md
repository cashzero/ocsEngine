# AIR-10 Air Base construction

- New Game: Standard scale, 3 divisions (1 armored), air forces + transports + support, seeds {"map":5101,"oob":5102,"deployment":5103,"rules":5104}
- PASS AIR-10: Construction is offered in the Movement Phase — observed: Turn 1 / 8, Allied player turn, Movement
- PASS AIR-10: A unit in Move Mode is not Engineer-Capable (13.8a): no Construction section — observed: no Construction section
- screenshot 01-engineer-combat-mode.jpg
- PASS AIR-10: The hexes within 2 Leg MP are listed and highlighted — observed: 18 hexes: 0103 0104 0205 0105 0106 0207 0101 0102 0203 0204 0201 0202 0303 0304 0301 0302 0403 0402
- screenshot 02-construction-hexes.jpg
- PASS AIR-10: Both ways to build in an empty hex are priced: Air Base Level 1 = 4T (1 SP), Air Strip = 1T — observed: Build a Level 1 Air Base · 4T (1 SP) | Build an Air Strip · 1T
- screenshot 03-build-options.jpg
- PASS AIR-10: Building an Air Strip costs 1T, paid at once, in the same phase — observed: notice "Build an Air Strip at 0103 (1T)." (341 ms)
- PASS AIR-10: The supply ledger shows the 1T paid — observed: Supply this turn 1T paid · 1 entry 1T drawn from a dump.
- PASS AIR-10: The Engineer constructs in one hex per phase (13.8d): no second Construction offer — observed: not offered
- screenshot 04-air-strip-built.jpg
- PASS AIR-10: Turn 2: Upgrade the Air Strip to a Level 1 Air Base for 3T, and nothing else at 0103 — observed: Upgrade the Air Strip to a Level 1 Air Base · 3T
- screenshot 05-turn-2-options.jpg
- PASS AIR-10: Turn 2: the ledger shows 3T paid — observed: 3T paid
- screenshot 06-turn-2-built.jpg
- PASS AIR-10: Turn 3: Improve the Air Base to Level 2 for 4T, and nothing else at 0103 — observed: Improve the Air Base to Level 2 · 4T (1 SP)
- screenshot 07-turn-3-options.jpg
- PASS AIR-10: Turn 3: the ledger shows 4T paid — observed: 4T paid
- screenshot 08-turn-3-built.jpg
- PASS AIR-10: Turn 4: Improve the Air Base to Level 3 for 4T, and nothing else at 0103 — observed: Improve the Air Base to Level 3 · 4T (1 SP)
- screenshot 09-turn-4-options.jpg
- PASS AIR-10: Turn 4: the ledger shows 4T paid — observed: 4T paid
- screenshot 10-turn-4-built.jpg
- PASS AIR-10: Turn 5: a Level-3 Air Base cannot be improved further (15.3) — observed: site 0103 not offered
- screenshot 11-turn-5-no-more.jpg
- PASS AIR-10: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 5 / 8, Allied player turn, Movement

Console/page errors: 0

