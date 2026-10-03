# U3 — Hex map, pan, and zoom

## Study result

Map geometry is deterministic pointy-top axial. `buildGeneratedMapPreview` lays out the active `GeneratedMap`; the renderer does not substitute a fixed Scenario map or independent laboratory output.

Terrain is communicated graphically with color plus texture. Rivers occupy shared Hexsides; roads connect Hex centers; settlements, strategic entry/supply regions, objectives, and counters are distinct marks. Terrain names must not be printed in every Hex. The terrain name is announced for the keyboard cursor and shown in the hover line, and coordinates appear at low visual priority (darker on hover/selection).

Since 2026-10-02 the theater map is one canvas (`src/ui/map-canvas.ts`). The printed terrain is painted once per zoom level into cached tiles and panning only copies tiles; highlights, targets, the move path and counters are drawn over them from the snapshot. The artwork still comes from `src/ui/map-art.ts` and `src/ui/counter.ts` (pattern tiles and counters are rasterized from their SVG), so the canvas map and the SVG New Game preview draw the same map. Clicks resolve to hexes by axial arithmetic and to counters by their drawn rectangles.

The map supports pointer drag, wheel zoom, explicit zoom in/out, and reset. The readout is relative to a reference framing (internal render scale 1.68, `ZOOM_REFERENCE` in `src/ui/map-canvas.ts`; since 2026-10-03 this is the framing that previously read 120%). The default view, the Reset button, and a newly started game read 110% (`DEFAULT_ZOOM_PERCENT`), because that is the smallest zoom at which counter text shows. Each wheel notch and each +/− press moves the readout by 10 percentage points, snapping to multiples of 10. Zoom is bounded from 30% to 150% of the reference framing: the range favours zooming out, and about 60% fits the whole map. Camera position and selection are interaction state only and never enter Gameplay saves or Rule state.
