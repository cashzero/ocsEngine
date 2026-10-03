# M6.4 — Settlements and strategic regions

Generator 0.3.0 (`src/generation/map/settlements.ts`) places a settlement hierarchy at Beyond the
Rhine scale; the measurements behind the numbers are in `10-btr-scale-density.md`.

- **Major Cities** (`settlement:city`): one per ~450 land Hexes (at least one), on open interior
  ground at least 9 Hexes apart. Each grows onto one or two adjacent open or wooded Hexes, so a Major
  City is a 2–3 Hex built-up cluster as on the printed map.
- **Minor Cities** (`settlement:town`): about 42% of all settlements, interior Hexes, at least 3 Hexes
  from any other settlement.
- **Villages** (`settlement:village`): the rest, never adjacent to another settlement.

The total is `settlementDensity` × land Hexes (default 0.10, allowed 0.02–0.16). Suitability combines
terrain habitability (open ground ≫ hills, woods ≫ marsh; never mountain), a low-frequency population
field that makes settled and empty districts, river frontage (urban places favour major-river
crossings), low elevation, and a seeded tie breaker.

First and second entry/supply regions each start from a central land Hex at opposing horizontal
extremes (the side's deployment anchor), then add further entry Hexes along the same map edge: one per
six map rows, at least two and at most eight per side, spread by farthest-point sampling at least three
Hexes apart (two on a short edge), on non-mountain, non-marsh land joined to the central entry. Every
entry Hex is also a Supply Source, so a reinforcement arriving at any of them starts in trace supply
(13.6, 12.6a). They are neutral generator metadata and typed Hex features; faction/player ownership is
deferred to Scenario composition.
