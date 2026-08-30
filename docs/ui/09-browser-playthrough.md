# U9 — Browser playthrough protocol

## Local run

Run `npm run ui:serve`, then open `http://127.0.0.1:4173`.

## Playthrough checklist

1. Confirm the 5×5 map, six visible counters, turn/phase/seat strip, and readable labels.
2. Start, advance sequence, inspect history and revision, then pause/resume.
3. Select a friendly counter; inspect legal families, candidates, and explanation; execute a candidate.
4. Reach a combat/barrage transaction and complete every pending option shown by the modal.
5. Create a checkpoint, dispatch, restore it, resume, download a save, and load it.
6. Begin hot-seat handoff; verify no projected information remains visible until confirmation.
7. Drag, wheel-zoom, use zoom buttons, keyboard-focus Hex/counter controls, and inspect narrow layout.

U10 records the executed browser evidence and final automated counts.

## Executed evidence — 2026-08-30

- Chrome headless rendered the built app at 1440×1000 and 760×1000 without a boot failure.
- The wide capture showed the complete session rail, 5×5 SVG map, six projected counters, action/explanation rail, and timeline.
- The narrow capture showed the single-flow breakpoint, readable command controls, map toolbar, and counters with no text below the 13px contract.
- HTTP checks returned the HTML entry and compiled `dist/ui/browser.js` with their expected content types.
- The in-app Browser runtime could not initialize because its environment lacked kernel assets; Chrome headless supplied the visual smoke evidence, while deterministic controller tests exercised the interactions.
