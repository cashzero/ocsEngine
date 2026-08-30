# U3 — Hex map, pan, and zoom

## Study result

Map geometry is deterministic pointy-top axial SVG. `layoutHexMap` converts each canonical Hex ID to a center and six polygon vertices without importing DOM APIs, so layout is unit-testable.

The SVG supports pointer drag, wheel zoom, explicit zoom in/out, and reset. Zoom is bounded from 65% to 240%. Camera position and selection are interaction state only and never enter Gameplay saves or Rule state.
