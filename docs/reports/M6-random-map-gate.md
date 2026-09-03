# M6 Random Map gate

## Delivered

- Deterministic two-style terrain pipeline with coherent elevation, moisture, roughness, and temperature.
- Connected coastal sea, canonical river Hexsides, spaced settlements, opposing entry/supply regions, and a single least-cost road backbone.
- Foundation-compatible `MapDefinition`, canonical generator JSON, metrics, warnings, and fail-closed topology/quality validation.
- Historical M6 UI map laboratory with seed/style/size controls, preview, regenerate, validation summary, and JSON download; retired in M8/U10 in favor of the connected New Game preview.
- BCS reuse study, step-by-step M6 documentation, focused tests, and 1,000-seed sweep.

## Boundaries

No units, OOB catalog, deployment, objective placement, Scenario creation, Rule state, or AI behavior is generated. M7 produces Random OOB; M8 composes and validates a playable Scenario from both outputs.

## Gate evidence

- Reproducible seed sweep: 500 inland plus 500 coastal maps, zero invalid outputs and zero exceptions.
- Inland sweep: land ratio 1.0, maximum severe-terrain ratio 0.0556, road range 36–49 edges.
- Coastal sweep: minimum land ratio 0.8333, maximum severe-terrain ratio 0.0538, road range 34–47 edges.
- Chrome headless visual smoke passed at 1440×1000 and 760×1000 through the `#random-map` deep link.
- Both viewports showed readable controls/metrics, terrain legend, complete preview, road/river overlays, and no text below the UI's 13px floor.
- `npm run check` passed: TypeScript, 28 test files / 136 tests, production build, and distribution smoke.

## Decision

M6.0–M6.10 is complete. The generated-map contract is ready for M7 Random OOB and M8 Scenario composition.
