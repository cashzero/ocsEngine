# Rail acceptance run — 2026-10-04

Driver: `scripts/rail-acceptance.mjs` (Playwright, Chromium, 1600×1000) against the built application
(`npm run build`, `scripts/serve-ui.mjs`), operating only visible controls: **Menu → New game → Generate
operation → Start**, the **Trace Supply** checkbox, the Arrivals list, the map's keyboard cursor (arrow keys, then Enter on
the hex announced as "entry hex"; the entry-hex chips were removed from the Arrivals panel by #53), **End … Phase**,
"Got it" on the away report, and the hot-seat handoff buttons. Re-run on 2026-10-04 after rebasing onto `main` at `bb1882b`.

## Input

- New Game defaults: `32×24 / TEMPERATE_INLAND / COMPACT / 6 divisions per side, 2 armored / 8 turns`, default seeds.
- Map generator 0.4.0 (rail network added in this change).

## Observed

| Step | Expected | Observed | Artifact |
|---|---|---|---|
| Generate operation | Preview shows rail lines, multi-track trunk distinguishable, much sparser than roads | 119 rail hexside segments (39 multi-track) against 387 road segments (31%); preview ready in 0.07–0.6 s | `01-preview-map.jpg` |
| Start | Game map draws rails as dark red track with cross-ties (VASSAL colour) over the roads; legend lists **Railroad** | As expected; the Halheim–Vaustad trunk is heavier and double-tied | `02-game-start.jpg` |
| Trace Supply on (Allied) | Direct (green) coverage from the seat's sources; map-edge sources keep #53's S disc; RAIL tags on detrainable stations | Wash shown; **RAIL** tags on Allied-controlled stations (e.g. Halheim); Vaustad (the objective, uncontrolled at start) untagged | `03-trace-overlay.jpg` |
| Axis Reinforcement Phase (after handoff) | Overlay shows only the Axis seat's sources | **RAIL** tags on Tulcourt, Montlay, Wesmont and the other Axis stations; no Allied tags | `05-axis-overlay.jpg` |
| Whole Game Turn | Both Player Turns complete through the required handoffs | Allied and Axis arrivals placed at 0102 / 3202 with the map cursor; every phase ended; both Supply Phases passed automatically (no unit out of trace); reached **Turn 2 / 8, Axis Player Turn, First Player Phase** (the First Player decision is pending) | `04-supply-phase.jpg` |

- Elapsed: 88.5 s for the whole run (after rebasing onto `main`, rails in the VASSAL dark red).
- Browser console errors: none.

## Explained observation

Vaustad (`10,11`) is the objective. It starts uncontrolled so that neither side scores at the start, and an
uncontrolled station cannot be traced into or through (13.3h). The central trunk is therefore cut at the
objective for both sides until one of them takes it. This is the intended reading of a contested front-line
station, not a defect.

## Not exercised here

- No unit moved, so this run did not show a unit that is in trace supply **only** because of a rail line, a rail
  path cut by an enemy ZOC, a captured station, an HQ-made detrainable hex, or an Extender joining two lines. Those
  rules are covered by `tests/rules/ocs-rail-supply.test.ts` (regression support only; see RAIL rows in
  `docs/quality/03-product-operation-verification-plan.md`, which stay `UNVERIFIED` for them).
