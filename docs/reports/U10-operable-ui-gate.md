# U10 — Operable UI integration gate

## Delivered slice

- Responsive operational shell with a strict 13px minimum text size.
- Deterministic SVG Hex map with pan, zoom, reset, counter selection, and stack inspection.
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

## Decision

U0–U10 is complete. The UI is ready to consume the next Random Map/OOB milestone without moving generation or rule logic into the presentation layer.
