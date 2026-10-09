# Engineer bridging (13.8b): browser evidence

- New Game: Axis attack, 24×16, Compact, 3 divisions (1 armored), no air forces, 3 turns, September, seeds {"map":8911,"oob":8912,"deployment":8913,"rules":8914}
- PASS NG-14: At the start no bridge is drawn: the engineer at 2114 is in Move Mode — observed: no bridges
- PASS NG-14: Unbridged, the tank at 2113 cannot reach 1915 across the river — observed: Ge 506 Tgr Bn: Hex 1915 · woods · out of reach · no units
- PASS NG-14: After the switch to Combat Mode the map draws the engineer's bridges on the river hexsides of its hex — observed: Ge Pi Bde 508: 2114>2213, 2114>2014, 2114>2113
- PASS NG-14: The engineer's status shows a BRIDGE mark explaining Bridging — observed: Bridging: 3 river hexsides at this hex (13.8b). Your units moving into or out of this hex pay no extra MP for a Minor River and Minor River cost for a Major River. Ends if this unit leaves Combat Mode; never for overruns.
- screenshot 01-engineer-status.jpg
- PASS NG-14: The hover line of the engineer's hex says what the bridge does — observed: Hex 2114 · Antdorf · clear · town · your engineer bridges 3 river hexsides here (Minor River: no extra MP) for your units moving in or out; not for overruns · Ge Pi Bde 508, Ge HQ 12th Corps, Truck, Supply dump
- screenshot 02-bridges-on-map.jpg
- screenshot close-bridges.jpg
- PASS NG-14: With the bridge, the tank at 2113 reaches 1915 — observed: Hex 1915 · woods · 4 MP, 0 left · reachable · no units
- screenshot 03-move-across-bridge.jpg
- PASS NG-14: Confirming moves the tank across the bridge — observed: at 1915 now: Ge 506 Tgr Bn (535 ms)
- screenshot close-tank-across.jpg
- PASS NG-14: Game Turn 1 ends and Turn 2 begins — observed: Turn 2 / 3, Allied player turn, First Player Phase
- PASS NG-14: The bridges stay while the engineer stays in Combat Mode — observed: 2114>2213, 2114>2014, 2114>2113
- PASS NG-14: Switching the engineer back to Move Mode removes its bridges from the map — observed: no bridges
- screenshot 04-bridge-removed.jpg
- screenshot close-bridge-removed.jpg
- PASS NG-14: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 2 / 3, Axis player turn, Movement

Console/page errors: 0

