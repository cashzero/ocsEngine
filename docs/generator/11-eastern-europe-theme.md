# M6.12: Eastern Europe (Russia) map theme

## Why

The user asked (2026-10-04) for a new map theme: "增加新的map theme, eastern europe (aka russia) 參考
E:\work\CaseBlue GBII v6_24_0 應該相比BTR 鐵路道路密度都要更低 地形更平坦". Requirements, as acceptance steps:

1. New Game offers an Eastern Europe (Russia) style next to Temperate inland and Mediterranean coast.
2. Compared with the BtR-calibrated themes on the same seeds, the generated map has a lower road density and a
   lower railway density.
3. Its terrain is flatter: mostly open ground, low hills in patches, no mountains.
4. The preview can be started and played like any other generated map: one whole Game Turn, with arrivals,
   phase ends and hot-seat handoffs.

## Reference measurements (Case Blue / GBII VASSAL module 6.24.0)

I inspected `E:/work/CaseBlue GBII v6_24_0/images/Map-CB1..CB4.jpg` and `Map-GBIIa.jpg` read-only (about 8,540 px
wide; about 92 px per Hex column and 107 px per row). I counted by hand from cropped views, as in
`10-btr-scale-density.md`. No map art is copied into the repository.

| Sample | Area | Road Hexsides / Hex | Rail Hexsides / Hex | Places / Hex | Largest road gap |
|---|---|---|---|---|---|
| Don bend, Serafimovich–Surovikino–Kalach (CB2) | ~400 Hexes | ~0.2, mostly Track | ~0.075 | ~0.04, almost all villages | 4–5 Hexes |

Other observations:

- **Case Blue (CB1–CB4, the Ukraine and the steppe).** Nearly all Open ground. Hills are brown blobs on
  uplands, a few percent of the map. River valleys are wooded or swampy. There are no mountains outside the
  Caucasus and the Crimean Yaila.
- **GBII sheet A (Moscow axis).** Forest and swamp patches, thicker toward the north.
- **Railways** are a few long lines. Stations are at the larger towns, and most villages are off the rail
  net. Railways are sparse in absolute terms, but because roads are sparse too, the rail-to-road ratio
  (~0.35–0.45) is higher than in BtR.

Case Blue uses 5-mile Hexes, and BtR (and this generator) 3.5-mile Hexes. Drawn at 3.5 miles, the same
landscape would have about 0.7× the per-Hex line density (road ~0.14, rail ~0.05). The theme keeps the
generator's Hex scale and thins the BtR values toward this picture, so a 32×24 map stays playable. Every
entry Hex must stay on a road, each side's rail entries on a railway (12.6a), and settlements need roads.

## Implementation (generator 0.4.0, additive)

`src/generation/map/styles.ts` holds every per-theme setting. Before this change they were BtR constants
spread over `terrain.ts`, `settlements.ts`, `roads.ts`, `rails.ts` and `validation.ts`. The two western
themes keep their exact values, and their generated maps are byte-identical to `main` (30 seeds per style at
32×24, serialized-map hash compared). The Eastern Europe profile:

| Setting | BtR themes | Eastern Europe |
|---|---|---|
| Terrain classifier | elevation/roughness/moisture/temperature | flatter: ROUGH only where high *and* broken, no MOUNTAIN, woods thicken northward |
| Riverbank woods (share of open Hexes beside a river) | 0 | 0.35 |
| Settlements per land Hex (default) | 0.10 | 0.05 |
| Land Hexes per Major City | 450 | 900 |
| Minor City share of settlements | 0.42 | 0.30 |
| Main-road link range / detour limit | 10 / 1.4 | 6 / 2.0 |
| Track link range / detour limit | 5 / 1.7 | 4 / 2.5 |
| Border exits: spacing / one per border Hexes | 5 / 6 | 8 / 12 |
| Road-gap limit, open / woods / hills | 2 / 3 / 3 | 4 / 5 / 5 |
| Minor Cities with their own rail line | 40% | 10% |
| Rail loop lines | within 8 Hexes, detour > 2.5× | none |
| "Road density is low" warning below | 0.35 | 0.15 |

## Results

These are means over 30 seeds, using the same seeds for both themes (`1000 + 37·i`):

| Metric (per land Hex) | Temperate 32×24 | Eastern 32×24 | Temperate 64×48 | Eastern 64×48 |
|---|---|---|---|---|
| Clear / Woods / Rough / Mountain / Marsh | 61 / 22 / 17 / 0.6 / 0.3 % | 78 / 16 / 4.4 / 0 / 1.0 % | 61 / 23 / 16 / 0.3 / 0.3 % | 80 / 15 / 4.5 / 0 / 1.0 % |
| Road Hexsides | 0.55 | 0.26 (−53%) | 0.56 | 0.26 (−54%) |
| Main road Hexsides | 0.41 | 0.16 (−61%) | 0.39 | 0.13 (−67%) |
| Rail Hexsides | 0.159 | 0.108 (−32%) | 0.129 | 0.062 (−52%) |
| Settlements | 0.10 | 0.049 | 0.10 | 0.050 |
| Largest road gap (Hexes) | 3 | 4–5 | 3 | 5 |
| Mean generation time | ~95 ms | ~65 ms | ~840 ms | ~495 ms |

The 64×48 row used 10 seeds.

On the 32×24 default map, the railway cut is smaller than the road cut. The two primary entries are joined by
a trunk line across the map, and each side's rail entries (one per 14 rows on Eastern, the primary first,
enforced by `ENTRY_OFF_RAIL`) each need a line to the rail net. A side's other entries are road-only Supply
Sources (user decision, 2026-10-10). Before that decision every entry was a rail Hex, and the spurs chained
along both side edges. On larger maps, town lines dominate and the full reduction shows.

Tests: `tests/generation/random-map.test.ts` checks Eastern Europe validity and compares it with Temperate on
the same seeds:

- no mountains;
- under half the hills;
- under 0.7× the settlements;
- under 0.6× the roads and main roads;
- under 0.85× the rails;
- a larger road gap, still within the style's limits;
- one road net reaching every place;
- one rail net reaching each side's rail entries.

`tests/generation/seed-sweep.test.ts` runs 500 Eastern Europe seeds at 18×12 with no invalid map.

UI acceptance: MAP-06 in `docs/quality/03-product-operation-verification-plan.md`, evidence
`docs/quality/evidence/map-theme-2026-10-04/`.

## Not in scope / TODO

- **Thinner railways on the default map.** The user decided on 2026-10-10 that only a few entries per side are
  rail Hexes (`rowsPerRailEntry`, styles.ts); the rest stay Supply Sources. Evidence:
  `docs/quality/evidence/rail-entries-2026-10-10/`. The missing behavior: the 30-seed measurement
  (seeds 1–30, rail Hexsides per land Hex) is 0.66× Temperate on 32×24 (worst seed 0.88×). On 64×40 it is
  0.47× (worst seed 0.56×). On the small map the trunk between the primary entries is the floor. The
  user-visible impact: the default-size eastern map still has about two-thirds of the BtR rail density. To
  close it, a 30-seed measurement must show default-map rail ≤ 0.5× Temperate, with all entries still Supply
  Sources.
- **Case Blue terrain and weather.** These are not part of this request and are recorded so they are not
  mistaken for done. The terrain and weather rules are still BtR's:
  - Case Blue Hills are drawn as ROUGH.
  - Light and heavy woods are not distinguished.
  - There are no dry lakes, steppe-specific movement or Volga-class rivers.
  - Mud and freeze weather follows the BtR weather table.

  A Russian TEC/weather set would need its own request and rules work.
