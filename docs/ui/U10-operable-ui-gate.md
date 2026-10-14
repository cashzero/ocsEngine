# U10 — Operable UI integration gate

Status: **IN PROGRESS (2026-09-04)**.

The map-first layout sub-gate and whole-turn interaction sub-gate now pass. They do not
prove OCS counter fidelity. The counter portion of U4 was reopened on 2026-09-04 after
comparison with the OCS v4.3 counter explanation and representative Beyond the Rhine
VASSAL faces. U10 remains open while counter fidelity, session persistence, Game End
downloads, full keyboard traversal, and the remaining product-operation rows are still
unverified; see
`docs/quality/03-product-operation-verification-plan.md` and
`docs/roadmap/17-counter-fidelity-wbs.md`.

## Delivered slice

- Responsive operational shell with a strict 13px minimum text size.
- Deterministic SVG Hex map with pan, zoom, reset, projected-piece selection, and stack inspection. The current piece glyph is not accepted as an OCS counter.
- Gameplay-owned lifecycle, legal action discovery, explanation, dispatch, and pending-decision flow.
- Timeline, checkpoints/undo, canonical save download/load, and hot-seat privacy handoff.
- Keyboard focus, SVG accessible names, ARIA status/dialog semantics, and reduced-motion handling.

## Boundaries retained

UI owns camera and selection only. Rule legality and state changes remain in Rule Engine through Gameplay. Random generation, AI, editor, networking, and desktop packaging are not part of U10.

## Gate evidence

- `npm run check`: passed.
- TypeScript typecheck and production build: passed.
- Vitest: 25 files and 127 tests passed, including a controller-driven full scenario to FINISHED with cross-seat pending decisions.
- Distribution smoke: passed and resolves the public UI map presenter export.
- Chrome headless visual smoke: passed at 1440×1000 and 760×1000.
- HTTP smoke: HTML and compiled browser entry served successfully.
- CSS contract scan: every explicit text size is at least 13px; body remains 16px.
- Replacement Edge CDP gate at 1440×900 and 760×1000: map-first shell, no horizontal overflow, minimum computed text 13px, and zero browser errors.
- Active generated map: 216 graphical terrain Hexes, 41 road edges, 6 river edges, 12 settlements, one objective and deployed counters; zero terrain-name labels.
- Narrow active map remains 745×640 CSS pixels before the command deck, preserving map priority instead of squeezing it between rails.

## Current decision

Graphical map, responsive layout, preview/mount equality and typography evidence remain valid. On 2026-09-03, `scripts/ui-flow-gate.mjs` completed whole turns for default and Large inputs and reached Turn 4 in a contact scenario while operating all exposed ground-action families, decisions, and visible privacy handoffs within the frozen latency budgets. `scripts/ui-cdp-gate.mjs` also passed desktop/narrow rendering with a 13 px minimum and zero browser errors.

U10 remains `IN PROGRESS`: those results do not substitute for the reopened printed
counter gate, real file save/load, terminal Game End downloads, full keyboard/focus
traversal, and all other open P0 rows in the product-operation plan.
