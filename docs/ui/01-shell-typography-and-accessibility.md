# U1 — Shell, typography, and accessibility

## Study result

The command surface uses two regions: one 330px command deck and one dominant theater map. Turn/phase/seat status overlays the top of the theater; zoom and the terrain legend overlay its bottom edge. Legal actions remain primary in the deck, while stack inspection, history, hot-seat, save, load, and checkpoints use compact or collapsible sections. There is no persistent right rail.

At 820px and below, the theater remains first and at least 60–64vh tall; the command deck follows in document flow. The interface must not preserve desktop rails by squeezing the map.

## Typography contract

- CSS root and body: 16px.
- Supporting text: 14px.
- Compact labels, coordinates, counter stats, and history metadata: 13px minimum.
- No rendered CSS text may be below 13px; `tests/ui/ui-contract.test.ts` enforces the floor.

Native buttons retain keyboard behavior. Interactive SVG hexes/counters expose roles, labels, `tabindex`, Enter/Space activation, visible 3px focus outlines, and reduced-motion support. Browser zoom is not disabled.
