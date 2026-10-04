# M6.11 — Beyond the Rhine scale: road and settlement density

## Why

A generated map is played at Beyond the Rhine scale: 3.5-mile (~5.6 km) Hexes and 3.5-day turns. At
that scale north-west Europe is densely built: a named place every couple of Hexes, a main road every
three to five. Generator 0.2.0 joined its settlements with a single spanning tree, so a 32×24 map had
about one road Hexside per five land Hexes, almost no main road, and districts more than ten Hexes
(55+ km) from any road. Movement and supply therefore felt like a roadless steppe, not the Low
Countries or the Rhineland.

## Reference measurements (BtR VASSAL module 1.27.0)

Read-only inspection of `E:/work/Beyond the Rhine_1_27_0/images/BTR Map AB Merged 1.jpg`
(7,574 × 5,936 px, ~95 × 110 px per Hex; see `docs/study/07-beyond-the-rhine-vassal-reference.md`).
No map art is copied into the repository; these are hand counts from cropped views.

| Sample | Area | Road Hexsides / land Hex | Settlements / land Hex | Largest road gap |
|---|---|---|---|---|
| Breda–Tilburg–Eindhoven (open, settled) | ~160 Hexes | ~0.55, nearly all Secondary Road | ~0.12, about half Minor Cities | 2 Hexes |
| Verviers–Malmedy–St. Vith (Ardennes forest/hills) | ~160 Hexes | ~0.35–0.45, more Track | ~0.04 | 3 Hexes |

Other observations: almost every settlement is a road junction with 3–5 roads; roads cross rivers at
few points and follow valleys through broken ground; Major Cities are multi-Hex built-up clusters;
railways are about as dense as roads.

These numbers are calibration targets, not a requirement to reproduce BtR exactly.

## Generator 0.3.0 results

Measured with 30–40 seeds per style at 32×24 (the New Game default):

| Metric | 0.2.0 | 0.3.0 |
|---|---|---|
| Road Hexsides / land Hex | 0.18 | 0.53 |
| Main road (Secondary Road) Hexsides / land Hex | 0.01 | 0.38 |
| Settlements / land Hex | 0.055 | 0.10 |
| Mean road links at a Minor City | – | 3.5 |
| Passable land ≥ 2 Hexes from a road | 47% | 14% |
| Passable land ≥ 3 Hexes from a road | 21% | 2% (woods/hills only) |
| Largest road gap | 11 Hexes | 3 Hexes |
| Mean generation time | ~28 ms | ~75 ms (64×48: ~0.9 s) |

`tests/generation/random-map.test.ts` holds the density, loop, junction and coverage floors; the
500-seed sweeps enforce `ROAD_COVERAGE_GAP` through validation.

Visual check: the New Game preview and the started game were opened in the real UI (Playwright,
Chromium) for a temperate and a coastal 32×24 map; both render the mesh, border exits and Major City
clusters with no browser errors.

## TODO

- **Railways — DONE in generator 0.4.0 (2026-10-04)**, except Rail Cap transport. The BtR calibration above
  ("railways about as dense as roads") is deliberately not followed: the user decided "rail不應該跟road一樣dense
  應該要少一點", so the generated net is a multi-track trunk, lines to every entry Hex and the larger Minor Cities,
  and few loops, at about a quarter to a third of the road density on the default map. Rules support is trace
  supply (12.6a, 13.3c, 13.3h, 13.8c, 12.7a) and road movement (6.2a). Rail Cap transport remains
  `TODO rail-cap`; see `docs/roadmap/10-rail-wbs.md` for the measurements, evidence and remaining TODOs.
- **Autobahn.** Missing behavior: no 1/3-MP road class. User-visible impact: German road movement
  cannot reproduce BtR autobahns. Close when the TEC models 1/3 MP (quarter-MP ticks cannot) and the
  generator emits it on a few long main routes, with a movement test.
- **Side-by-side roads.** Missing behavior: a few routes still run parallel one Hex apart for a short
  stretch. User-visible impact: cosmetic clutter only. Close when routing penalises running beside an
  existing road and a sweep shows no parallel runs longer than 2 Hexes.
- **Coverage-fill cost.** The coverage pass recomputes road distances after each added track; 64×48
  maps take ~0.9 s. Close if generation time becomes a UI latency issue, with a timing measurement.
