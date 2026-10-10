# Rail entries: lines leave the map edge apart (2026-10-10)

**Defect (user report):** on Eastern Europe maps the railway always followed both side map edges, plus one
line through the middle. The same edge lines appear on Temperate maps. Cause: each entry Hex (8 per side on a
40-row map) had to be a rail Hex, and each one's spur joined the nearest track, which was usually the next
entry's spur along the edge.

**Decision (user, 2026-10-10):** fewer rail entries. A side keeps all its entry Hexes and Supply Sources. Only
one entry per `rowsPerRailEntry` map rows (Eastern 14, Temperate/Mediterranean 10) is a rail Hex. The primary
entry is always one of them, and the others are picked near evenly spaced rows. The other entries are road-only
and remain Supply Sources (12.6a map-edge sources are scenario-declared). A rail entry's line runs inland: new
track stays inside a cone around the entry row and joins the network away from the side edges.

**Measured** (rail Hexes in the two outermost columns of either side, 8 seeds, 64×40):

| | Before | After |
|---|---|---|
| Eastern Europe | 58–70 | 13–23 |
| Temperate inland | 49–70 | 22–35 |

**UI run:** built UI (`npm run build`, `OCS_UI_PORT=4431 node scripts/serve-ui.mjs`) in Playwright Chromium,
1600×1000. Menu → New Game → Generate operation. No browser errors in either run.

- `01-default-preview.jpg`: New Game defaults (32×24 Temperate). 112 rail segments (41 multi-track) and
  406 road segments; one connected net; the trunk joins the two primary entries; two rail exits per side.
- `02-eastern-64x40-preview.jpg`: Eastern Europe (Russia), 64×40. Three rail exits per side, each line heading
  inland; no line along either side edge.

**Not exercised:** the game was not started from these previews. Supply tracing from road-only entries is
covered by `tests/rules/rail-supply-flow.test.ts`, not by a UI turn.
