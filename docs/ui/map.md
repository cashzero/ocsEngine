# Map and counters

## Scope

How the theater map and the New Game preview are drawn, how the camera works, what the map overlays show, and how counters
are rendered. Code: `src/ui/map-art.ts` (shared geometry and SVG), `src/ui/map-canvas.ts` (game map),
`src/ui/counter.ts` (counters). The printed-counter fidelity plan is `docs/roadmap/17-counter-fidelity-wbs.md`.

## Current behavior

### Rendering

- The game map is one canvas. Terrain is painted per zoom level (steps of √2) into cached tiles in two layers (ground and
  grid; numbers, rivers, roads, rail and settlements); panning only copies tiles. Reach, dimming, targets, the move path,
  counters and objective markers are drawn each frame from the current snapshot. Clicks resolve to hexes by axial
  arithmetic and to counters by their drawn rectangles.
- `map-art.ts` produces the geometry once; the New Game preview is SVG built from it, and the canvas rasterises the same
  patterns and counters, so the preview and the game map are the same picture.
- The map is pointy-top hexes in odd-row offset rectangles, with printed four-digit hex numbers (e.g. 0610).

### Appearance (VASSAL printed-map look)

Only the look of the Beyond the Rhine VASSAL map is borrowed; no asset is copied
(`docs/study/07-beyond-the-rhine-vassal-reference.md`).

- Flat khaki ground; same-terrain hexes merge into regions with no per-hex outline. A white hairline grid draws each
  hexside once. Hex corners are nudged deterministically so woods, rough ground and coasts get irregular edges.
- Woods: mid-green stipple with a dark fringe. Marsh: blue ditches on pale ground. Water: pale blue with sparse wave marks.
- Roads: golden-brown with black casing, primary roads heavier. Rivers: dark-edged pale channel on hexsides.
- Railways: a dark red track with cross-ties (double-tied for multi-track), kept to one side of the hex centre so it runs
  beside a road on the same hexside and may cross it, but does not lie on it.
- Roads and railways that reach a border hex or an entry hex are drawn on to the map edge.
- Settlements: dark building blocks sized by class; villages are houses among trees; towns and cities carry a bold serif
  name (cosmetic, see Known gaps).
- Hex numbers are always shown, small, at the top of the hex, stronger on hover and selection. Terrain names are never
  printed; the hover line and the keyboard announcement give them.

### Overlays

- **Reach**: the selected unit's reachable hexes, shaded in two steps by MP left; hexes where the move must end are dashed;
  ground out of reach is dimmed. Hovering a reachable hex shows its cost and MP left.
- **Targets**: attack and barrage targets, entry hexes for placement, retreat and decision hexes are outlined above the
  counters.
- **Objectives**: always drawn over the counters, as a dark disc at the hex's bottom point with the holder's mark (first
  player a white star, second player a black cross, neutral a gold diamond) ringed in the holder's colour, and its VP. The
  hover line names the holder.
- **Trace Supply** (toggle): the player's trace coverage and supply sources; while it is on, each rail hex carries a band
  for who controls it (green yours, red the enemy's, white dashed neutral).
- **Patrol Zones** (toggle): each side's fighter Patrol Zones; Trainbusting markers; AEP badges.

### Camera

- Pointer drag, wheel zoom anchored at the pointer, +/− buttons and keys, and Reset.
- The zoom readout is relative to a fixed framing of a 32×24-hex area (`ZOOM_REFERENCE` = 1.68 × 1.1), so a readout gives
  the same hex size on any map; the window size still scales it. Default and Reset read 100%; each step is 10 points,
  snapping to multiples of 10, from 20% to 150% (about 54% fits a 32×24 map, 27% a 64×48 one).
- The camera and selection never enter a save.

### Counters

- Counters are drawn from the projected stacks, never from the initial scenario. They show the printed face for the unit's
  current mode and step (BtR counter values), with mode and status marks (DG, Out of Supply, Low/Exhausted, fuel) separate
  from the printed values. Transport counters print their current points; a hidden quantity of an enemy dump or Eq prints
  "?".
- Enemy stacks show only what the projection gives (4.9a): the top unit and a hidden count.
- Stack order: dumps, trucks, HQs and artillery underneath, combat units on top; a selected counter is drawn above its
  stack.
- **Level of detail** on the game map, by the counter's on-screen width: 58 CSS px or more shows identification, symbol
  and ratings; 38–57 px the symbol and main ratings; below 38 px the symbol only. Zoom and window resizing recompute it;
  the preview, roster and selected-unit row always show full detail. Counter artwork is exempt from the interface text
  floor.

## Decisions

- **Canvas map** (2026-10-02): the earlier inline SVG of about 4,800 nodes was re-rasterised on every pan (about 3 fps)
  and rebuilt on every click.
- **Default zoom** (user, 2026-10-04): the default view keeps the on-screen size that used to read 110% and is labelled
  100%; the readout uses a fixed framing so it means the same on every map size.
- **Rail control shown only with Trace Supply** (user, 2026-10-05); control of open country is not drawn.
- **Objective markers after bcsEngine's victory markers** (user, 2026-10-05).
- **A railway may cross a road but must not lie on it** (user, 2026-10-04).
- **Counter LOD by on-screen size** (user request): the counter-artwork exception to the text floor applies only to
  counters.

## Supply inspection

With Trace Supply enabled, hover and keyboard announcements name RAIL/EXT supply sources,
friendly/enemy rail supply paths, and whether the shown trace coverage reaches the hex. These
use the same seat-specific data as the painted overlay; selecting an individual unit narrows
coverage to that unit.

## Stack inspection

Hovering a multi-counter hex or moving the keyboard cursor onto it shows a fixed-size stack
inspection beside the map, independent of zoom and counter offsets. It prints complete visible
faces and unit names. Clicking opens the selectable stack list. Both use the seat's redacted
projection, so hidden enemy identities remain hidden. Inspection is removed during handoff,
modal dialogs and move confirmation; the passive preview is inert and does not add Tab stops.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `map-appearance` (place names cosmetic, one terrain per hex, Autobahn,
integrated acceptance of the new look), `road-exit-edge`, `objective-marker-preview` (the New Game preview still draws the
plain gold star), `counter-fidelity` (remaining CF5 whole-turn/persistence evidence), `transport-art`, `pax-counter-art`, `TODO-CM1`, `TODO-CM2`, `enemy-zoc-display`, `landing-port-view`.

## Verification

- `tests/ui/map-art.test.ts`, `tests/ui/counter-*.test.ts` (LOD, states, hidden quantities, HQ, transport, aircraft).
- Browser rows MAP-01 to MAP-09 and CTR-01 to CTR-08 in `docs/quality/03-product-operation-verification-plan.md`; run
  records in `docs/quality/evidence/product-2026-10-14/` and `control-2026-10-05/`.

- Both desktop sizes, full stack inspection, LOD and rail overlay operations: [operations evidence](../quality/evidence/operations-2026-10-15/README.md).
