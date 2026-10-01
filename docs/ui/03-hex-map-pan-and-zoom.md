# U3 — Hex map, pan, and zoom

## Study result

Map geometry is deterministic pointy-top axial SVG. `buildGeneratedMapPreview` lays out the active `GeneratedMap`; the renderer does not substitute a fixed Scenario map or independent laboratory output.

Terrain is communicated graphically with color plus SVG texture. Rivers occupy shared Hexsides; roads connect Hex centers; settlements, strategic entry/supply regions, objectives, and counters are distinct vector marks. Terrain names must not be printed in every Hex. The terrain name remains in each Hex's accessible label, and coordinates appear at low visual priority on hover/selection.

The SVG supports pointer drag, wheel zoom, explicit zoom in/out, and reset. The readout is relative to the default framing: the default view, the Reset button, and a newly started game all read 100% (an internal render scale of 1.4 centred on the map, `DEFAULT_ZOOM` in `src/ui/browser.ts`). Zoom is bounded from 60% to 260% of that framing. Camera position and selection are interaction state only and never enter Gameplay saves or Rule state.
