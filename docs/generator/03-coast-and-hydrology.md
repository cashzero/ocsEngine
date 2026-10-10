# M6.3 — Coast and hydrology

The sea is a generation option (`sea`: `NONE`, `NORTH`, `WEST`, `EAST`), independent of the style. A sea uses a low-frequency shoreline varying along its map edge, producing one connected sea rather than water speckles or inland lakes; its accepted water range is 6–35%, and a map without a sea may hold at most 2% water. When the options name no sea, a style keeps its own: `WEST` for Mediterranean coast, `NONE` for the others, so those maps (and their IDs) are unchanged. A sea that is not the style's own adds `:sea-<edge>` to the map ID.

New Game offers the sea as **No sea**, **Along the flank** (the north edge: both sides advance west–east along the coast) or **Behind the attacker** (the attacker's entry edge: west for Allied, east for Axis; a meeting engagement has no attacker, so the sea goes behind Allied on the west). With the sea on the north edge the open corridor that joins the two entry edges runs at 60% of the map height, inside the land.

Ports (19.0) are a fixed map feature (`FACILITY` `facility:port`), not pieces. A sea gets one port per ten coastal land Hexes, at most four, at least two on a flank sea (so the coast on both sides of the front has one) and one otherwise. Ports go to coastal Major Cities, then towns, then villages, spread along the coast (the first nearest the map's middle, each later one farthest from those chosen, preferring six Hexes apart); when the coast has too few places a coastal open or wooded Hex becomes a town with the port, so roads and railways reach it. Validation requires every port to be a coastal settlement on the road network, at least one port on a map with a sea and none without.

Each port has a printed capacity (19.0a) by the place it is in: a Major City 4 SP, a town 2 SP, a village 1 SP (`PORT_CAPACITY_TOKENS`, in Tokens).

## Ports in play (19.0)

A port is a map feature, not a piece; what changes in play lives in its map feature state: who holds it (`controllerId`), its printed capacity in Tokens (`level`) and its hits (`damage`). Each port starts held by the side whose deployment zone it lies in.

- **Capacity (19.0a):** the SP or RE a port loads plus unloads in a phase, 1T of capacity per Token or quarter RE. A port holding an enemy combat unit or in an enemy ZOC (never negated for shipping) is shut. A single combat unit larger than an unused port may use its whole capacity.
- **Damage (19.0b-d):** an air barrage against an enemy port on the Facility Table gives it the numbered result as hits (at most 4). The side holding a port may inflict 1 hit a turn on it with 1 RE of Combat Mode units in the port that do not move, or an Engineer-Capable unit (19.0c), and an Engineer-Capable unit repairs 1 hit a turn for 1 SP (19.0d). Each hit takes a quarter of the printed capacity, rounded to the nearest Token.
- **Capture (9.14h, 4.4c):** a port is a non-combat unit of whoever holds it: only an Attack-Capable unit may enter an enemy port, and entering captures it (moving, retreating or advancing).
- **Supply (19.0e):** every port is declared a Supply Source; it serves only the side holding it, while it has 1 SP of capacity and no enemy combat unit or un-negated enemy ZOC is in it. Behind the attacker the declaration names the attacker's side, so a defender who captures one of those ports denies it but cannot draw from it; along a flank either side draws from the ports it holds. Port sources also start rail cargo paths, as map-edge sources do.
- **Shipping (19.0f):** Sea Cap points per friendly Movement Phase ship Move Mode combat units that have not moved, Transport Points (their points; loads ride free), Repls (a quarter RE each) and SP between friendly ports, paying Sea Cap and both ports' capacity. Shipped units do not move afterwards and use no other transport that phase.
- **Sea behind the attacker:** that side has no land entry edge. Its map-edge entries and edge sources are not declared, its ports are its only Supply Sources, and everything it receives except aircraft (units, Supply Table SP, Repls, returning units) waits in its reinforcement Box until shipped to a port it holds; only the unloading port's capacity counts. It gets Sea Cap (default 0.6 per division); the defender gets none. Along a flank both sides keep their land entries and get a little Sea Cap (0.25 per division) for port-to-port shipping.

Calibration observed in bot-against-bot games (2026-10-10, 32×24, Allied attack, sea behind Allied, 3 ports of 1, 1 and 2 SP): the three ports land 16T a turn against about 36T of Supply Table income, so port capacity, not the 5-point Sea Cap, is the binding limit and SP pile up in the Box (56–86T by turn 4–5). This matches the requested "port capacity and shipping are the main limit" but has not been tuned; the capacities and the Sea Cap default are the knobs.

TODO (port damage chart): the generic hit effects printed beside the Barrage vs Facility Table (chart page 4) are not transcribed in `docs/rules/ocs-4.3-charts.md`; a quarter of capacity per hit is the reading used. User-visible impact: a damaged port may load more or less than the printed chart allows. Closing evidence: the chart note transcribed and `portCapacityTokens` checked against it in a test.

TODO (artillery against ports): artillery cannot barrage a port (nor an Air Base) because the Facility Table's artillery supply costs are not transcribed. User-visible impact: only aircraft and the holder's own units can damage a port. Closing evidence: the costs transcribed, DECLARE_BARRAGE given a facility target, and a played artillery barrage against a port.

TODO (naval power): no ships, Landing Craft, amphibious landings or Beach Assaults (18.0, `naval-shipping`). User-visible impact: a side can only land at a port it already holds. Closing evidence: 18.0 implemented and exercised in a played game.

Rivers start from separated high interior Hexes and descend toward water or a map edge. Every segment is stored once as a canonical Hexside with `edge:river` or `edge:major-river`; Foundation validation proves both endpoints exist and are adjacent.

