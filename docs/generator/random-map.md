# Random map

## Scope

How `generateRandomMap` (`src/generation/map/`, generator version 0.5.0) builds a map: options and output, determinism,
terrain, sea and ports, rivers, settlements, entry and supply regions, roads, railways, validation and the seed sweep.
Per-style settings and their calibration are in [map-styles.md](map-styles.md). Units, deployment, objectives and the
scenario are made later ([docs/game-flow/overview.md](../game-flow/overview.md)).

## Current behavior

### Options and output

- Options: width and height 8–256 (New Game offers 16×12 to 256×256; smaller maps are for rule-test fixtures), a uint32
  seed, a style (`WESTERN_EUROPE`, `EASTERN_EUROPE`), an optional sea (`NONE`, `NORTH`, `WEST`,
  `EAST`), optional landing edges, and an optional settlement density. Invalid options return typed errors and no output.
- Output: generator version and normalized options, an immutable Foundation `MapDefinition`, neutral first and second
  entry and supply regions, settlement and port hexes, metrics and warnings. `serializeGeneratedMap` emits canonical
  JSON (schema 1). `src/generation` imports only Foundation and serialization.

### Determinism

A private Mulberry32 stream with integer mixing; salts split the elevation, moisture, roughness, temperature, coast and
hydrology fields while one public seed drives them all. Nothing reads `Math.random`, time or process state. Collections
are emitted in coordinate or canonical hexside order, so equal options give byte-identical output.

### Terrain

Four-octave value noise gives elevation, moisture, roughness and temperature; a per-style classifier maps them to open,
woods, rough, mountain, marsh or water. A two-hex central belt suppresses impassable terrain. Validation caps mountain
plus marsh at 40% of land.

### Sea and ports

- A sea follows a low-frequency shoreline along its edge: one connected body of 6–35% water; a map without a sea may hold
  at most 2% water. Without a `sea` option a map has no sea (`NONE`); another
  sea adds `:sea-<edge>` to the map ID. New Game offers **No sea** or **Along the flank** (the north edge).
- `landingEdges` gives a side landing by sea (no inland entry) a port within a fifth of the width (at least 3 columns) of
  its edge: the best coastal place there, or a new port town on the shore nearest the edge; otherwise the map fails with
  `LANDING_PORT_MISSING`. The map ID gains `:landing-<edge>`.
- Ports are fixed map features (`facility:port`): one per ten coastal land hexes, at most four, at least two on a flank
  sea, else one. They go to coastal Major Cities, then towns, then villages, spread along the coast; with too few places
  a coastal open or wooded hex becomes a port town. Capacity by place: Major City 4 SP, town 2 SP, village 1 SP. Every
  port is a coastal settlement on the road network.
- Ports in play (capacity, damage, capture, supply, shipping) are rules: manifest `movement.sea`.

### Rivers

Rivers start from separated high interior hexes and descend toward water or a map edge; each segment is one canonical
hexside with `edge:river` or `edge:major-river`.

### Settlements and regions

- Major Cities (`settlement:city`) on open interior ground, spaced apart, each growing onto one or two neighbors into a
  2–3 hex cluster; Minor Cities (`settlement:town`) at least 3 hexes from other settlements; villages never adjacent to
  another settlement. Counts come from the style's density. Suitability weighs terrain, a low-frequency population
  field, river frontage, low elevation and a seeded tie-breaker; never mountains.
- Each side's entry and supply region starts at a central land hex on its horizontal edge (its deployment anchor) and
  adds entries along that edge: one per six rows, two to eight per side, at least three apart, on non-mountain,
  non-marsh land joined to the central entry. Every entry is also a Supply Source. Regions are neutral; owners are set at
  scenario composition.

### Roads

1. A main-road tree joins Major City cores, Minor Cities and every entry hex, nearest first.
2. Main-road loops join places within the style's link range unless the network already joins them within its detour
   limit.
3. Border exits: main roads leave each land edge at the style's spacing, joined to the nearest town.
4. Every Major City hex lies on a main road.
5. Tracks join villages to neighbors within range unless already joined within the detour limit; a village still off
   the network takes the cheapest track.
6. Coverage: while an open hex lies beyond the style's road-gap limit, a through track is run across the district.
7. Any stray piece is joined to the main network.

Routing is A*/Dijkstra over land with terrain step costs (open 1, woods 1.7, hills 2.1, marsh 4.5, mountain 7, water
impassable), bridge costs at rivers (+1.6) and major rivers (+4) so roads share crossings, cheaper settlement entry, a
border penalty and a discount on existing road so roads merge. `edge:primary-road` is the BtR Secondary Road (½ MP),
`edge:road` a Track (1 MP). The result is one component containing every strategic node and settlement.

### Railways

`src/generation/map/rails.ts`: a multi-track trunk joining the two primary entries and every Major City nearest-first;
single-track lines to each side's rail entries (the primary first, then one per the style's rows per rail entry; the
other entries are road-only Supply Sources) and to the larger Minor Cities; loops only where the style allows. Routes
prefer open lowland, avoid hills and mountains, cross few rivers and are cheap along existing rail. The rail net must be
one connected network reaching each side's rail entries.

### Validation

Foundation map validation plus: exact bounds and hex count; canonical adjacent hexsides; at least four settlements and
one river; strategic nodes on land and on the single road component; road coverage within the style's gaps
(`ROAD_COVERAGE_GAP`); a land corridor between the opposing entries; severe-terrain and water ratios; ports; one rail
network (`DISCONNECTED_RAIL_NETWORK`) with every rail entry on it (`ENTRY_OFF_RAIL`). Failures return issue codes; no
invalid map is retried silently or downgraded. Low road density is a warning.

### Seed sweep

`sweepRandomMapSeeds` runs 500 seeds per style at 18×12 and counts invalid maps, exceptions and failures separately;
`tests/generation/seed-sweep.test.ts` requires zero of each. It is slow and opt-in (`npm run test:sweep`).

## Decisions

- **A looped road mesh, not a spanning tree**: the tree left about half the open ground two or more hexes from a road;
  the mesh matches the measured BtR density ([map-styles.md](map-styles.md)).
- **Railways sparser than roads** (user, 2026-10-04: "rail不應該跟road一樣dense 應該要少一點"), although BtR draws them
  about as dense; only a few entries per side are rail entries (user, 2026-10-10).
- **The sea is an option, not a style** (user, 2026-10-13); landing sides are set per side in New Game.
- **No standalone map laboratory**: the map is previewed only inside New Game, with the rest of the package.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `map-appearance`, `road-exit-edge`, `case-blue-terrain`, `PERF-7`,
`sea-landing-balance`, `reinforcement-options`, `naval-shipping`.
The requested per-side reinforcement settings and the force-timing/capacity assessment are owned by
[Reinforcement balance](../game-flow/reinforcement-balance.md); no automatic enemy force adjustment is implemented.

## Verification

`tests/generation/random-map.test.ts`, `tests/generation/seed-sweep.test.ts`, `tests/generation/generation-contract.test.ts`;
browser rows MAP-01 to MAP-09 and RAIL-01 in `docs/quality/03-product-operation-verification-plan.md`.
