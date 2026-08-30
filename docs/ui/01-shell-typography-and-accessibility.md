# U1 — Shell, typography, and accessibility

## Study result

The command surface uses three regions: session controls, map workspace, and action/history details. At narrower widths, the detail rail moves below the map; at phone width all regions become a single document flow.

## Typography contract

- CSS root and body: 16px.
- Supporting text: 14px.
- Compact labels, coordinates, counter stats, and history metadata: 13px minimum.
- No rendered CSS text may be below 13px; `tests/ui/ui-contract.test.ts` enforces the floor.

Native buttons retain keyboard behavior. Interactive SVG hexes/counters expose roles, labels, `tabindex`, Enter/Space activation, visible 3px focus outlines, and reduced-motion support. Browser zoom is not disabled.
