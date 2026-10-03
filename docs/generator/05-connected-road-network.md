# M6.5 — Connected road network

Generator 0.3.0 (`src/generation/map/roads.ts`) builds a looped road mesh instead of the earlier
spanning tree, which left roughly half of all open ground two or more Hexes from any road. Road
classes map to the BtR TEC: `edge:primary-road` is the main road (Secondary Road, ½ MP) and
`edge:road` is a Track (1 MP).

1. **Main-road tree**: Major City cores, Minor Cities and both entries are joined nearest-first, so the
   network starts as one component.
2. **Main-road loops**: every pair of those places up to 10 Hexes apart gets a direct main road unless
   the main network already joins them within 1.4× their Hex distance.
3. **Border exits**: about one main road per 6 border Hexes leaves each land edge (spaced ≥ 5), joined
   to the nearest town; the map is a window on a larger road network.
4. **Major City Hexes** all lie on a main road.
5. **Tracks**: villages join neighbouring places up to 5 Hexes away unless the network already joins
   them within 1.7×; any village still off the network takes the cheapest track to it.
6. **Coverage**: while an open Hex lies 3+ Hexes from a road (woods or hills 4+), a through track is
   run across that district, out to the road on each side.
7. **Connectivity**: any stray piece is joined to the main network by its cheapest track.

Routing is A*/Dijkstra over land. Step costs follow terrain (open 1, woods 1.7, hills 2.1, marsh 4.5,
mountain 7, water impassable), add a bridge cost at river (+1.6) and major-river (+4) Hexsides so roads
share crossings, are cheaper into settlements, discourage running along the map border, and are
discounted on existing road (×0.3) so roads merge into junctions. Shortcut links (steps 2 and 5) use a
weak discount (×0.85), because a shortcut that rejoined the existing detour would add nothing.

Edges merge by canonical Hexside ID, a main road overrides a track on the same Hexside, and river
crossings coexist with roads. The final graph must have exactly one component containing every
strategic node and settlement.
