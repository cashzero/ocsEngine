# UI 12: Map appearance (VASSAL printed-map reference)

Status: **IN PROGRESS** — visual restyle landed; no product-operation gate is claimed or promoted.

## Scope

Restyle the theater map and the New Game map preview so they read like the printed
Beyond the Rhine map shown in the VASSAL module (`docs/study/07-beyond-the-rhine-vassal-reference.md`).
Only the *look* is borrowed: palette, line weights, grid, and how terrain, roads,
rivers and towns are drawn. No raster or other asset from the module is copied; all art
is generated in `src/ui/map-art.ts` (SVG for the New Game preview; the same geometry painted on the theater canvas by `src/ui/map-canvas.ts`). Rules, map data, and the OOB are untouched.

## What changed

| Element | Before | Now (VASSAL-style) |
|---|---|---|
| Ground | Per-hex tiles with a dark outline each | Flat khaki ground; fills carry no outline and are stroked with their own pattern so same-terrain hexes merge into one region |
| Hex grid | Dark per-hex outline | One hairline white path, each hexside drawn once (`hexGridHtml`) |
| Boundaries | Straight hex edges | Hex corners are nudged deterministically (same corner → same offset), so fills still tile but woods, rough ground and coasts have irregular edges (`terrainFillHtml`); rivers use the same corners |
| Woods | Dark tree-crown canopy | Mid-green stipple (`terrain-woods`) with a thin dark-green fringe (`regionEdgesHtml`) |
| Marsh | Reed glyphs | Network of thin blue ditches over pale wet ground |
| Water | Dark blue with waves | Pale sea blue, sparse wave marks, thin coast line |
| Roads | Cream on dark casing | Golden-brown surface with black casing; primary roads heavier |
| Rivers | Mid blue | Dark blue edge with pale blue channel |
| Settlements | Pale footprint with red blocks | Dense dark building blocks sized by class; villages are houses among trees; cities and towns get a bold serif name |
| Hex number | Hover only, bottom of hex | Always shown, small, at the top of the hex (a counter leaves it covered when present); stronger on hover/selection |
| Selection / range | Brightness filter on the hex polygon | Hex polygons are transparent hit targets; range and hover use a light tint plus outline, out-of-range ground is dimmed via `.terrain-fill.is-dimmed` |

## TODO / known limitations

- **TODO — railways.** The VASSAL map prints railways (dark red with ties). The engine's map
  model has no rail hexside feature (`GeneratedMapPreviewEdge.kind` is river/road only), so
  none are drawn. Missing behavior: rail lines. User-visible impact: the map shows fewer
  line features than the printed map. Close when a rail feature exists in the map domain and
  is rendered, with a screenshot of a generated map that contains rail.
- **TODO — place names are cosmetic.** Names come from `placeNameFor(hexId)`, a deterministic
  syllable generator, not from scenario or map data. They carry no rules meaning and do not
  appear in the roster, log or OOB. Close when the map model carries real names, or the user
  decides to drop the labels.
- **TODO — terrain is still one terrain per hex.** Printed-map features such as hills inside a
  clear hex or partial forests are not representable. Corner jitter only roughens the edges.
- **TODO — integrated acceptance.** Evidence so far: unit tests (`tests/ui/map-art.test.ts`),
  typecheck/build, and screenshots of the theater map and of generated previews (both
  generator styles, including marsh and mountain). The full New Game → one-turn flow
  (`docs/quality/03-product-operation-verification-plan.md`) has **not** been re-run with the
  new look, so no operation is promoted from `UNVERIFIED`.
