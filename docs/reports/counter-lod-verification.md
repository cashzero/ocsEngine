# Counter LOD evidence — IN PROGRESS

The counter-alignment gate is not complete. This report covers the user's added
zoom-out requirement, not CF0–CF5 or the entire New Game acceptance workflow.

## Implemented behavior

- On-screen width >=58 CSS pixels: full identification, symbol and ratings.
- Width >=38 and <58: symbol and primary ratings; identification hidden.
- Width <38: symbol view; ratings and identification hidden.
- Camera zoom and window resize recalculate LOD. Preview and inspector are outside
  the map LOD scope and retain full detail. The counter-artwork typography exception
  does not relax the 13px floor for ordinary interface text.

## Recorded evidence

`node scripts/counter-lod-gate.mjs` operates the actual New Game preview/start
buttons, then mouse zoom controls at 1440x900 and 760x1000, and keyboard Enter to
select a friendly counter. It stores screenshots and measured rendered widths in
`tmp/counter-lod-gate/`. This is an isolated local Edge profile; the browser plugin
could not initialize its kernel assets in this environment.

Observed desktop widths: 37.64px at reset (symbol), 45.16px/54.19px (ratings),
65.03px and above (full), and 24.46px at minimum zoom (symbol). All three levels
were reached; zooming preserved revision 0 and produced no runtime exceptions.
Automated regression evidence: 160 tests pass, TypeScript build and smoke pass.
These checks support, but do not constitute, complete product acceptance.

The initial Enter run failed to open the stack inspector. The keyboard handler
selected the piece but not its hex. The narrowly scoped correction now mirrors
mouse selection, and the same real keyboard operation succeeds on rerun.

User-added layering requirement: SVG document paint order now explicitly separates
`hex-map-layer` below `counter-layer`. The latter paints ordinary counters first,
the selected counter next (including selection outside the usual first three), and
non-interactive stack badges last. This also keeps adjacent hex highlights below
all counters; CSS `z-index` is not relied upon inside SVG. The browser probe checks
that the selected counter is the actual hit target at its center above the selected
hex and other stack counters, and captures its hover state.

## Remaining acceptance / observed limitations

- TODO: finish reviewing full-detail reference fidelity. Current generated labels
  such as `command`/`recon` are crowded; displayed identity differs from historical
  source identity. Impact: printed identity is not yet reliably aligned. Close with
  the CF0 source corpus and side-by-side integrated preview/map/inspector evidence.
- TODO: verify status/step-loss/resource markers at all LOD levels in naturally
  reached game states. Impact: status text can become too small in symbol view.
  Close with visible state changes and readable markers/inspector screenshots.
- TODO: verify pointer selection and stack-count readability for overlapping
  three-or-more-counter stacks at minimum narrow-view zoom. Impact: tiny stacked
  hit targets/counts may be difficult to distinguish. Close with operated pointer
  selection and screenshots at 760x1000, not DOM visibility assertions alone.
- TODO: run the remaining workflow in `03-product-operation-verification-plan.md`,
  including a whole legal turn and required decisions/handoffs. Impact: this focused
  LOD test does not prove the updated counter model works through a complete turn.
  Close only with the named integrated operation evidence.
