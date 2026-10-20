# Map styles and calibration

## Scope

The per-style settings of the map generator (`MAP_STYLE_PROFILES` in `src/generation/map/styles.ts`) and the measurements
they were calibrated against. The pipeline that uses them is in [random-map.md](random-map.md).

## Current behavior

| Setting | Western Europe (`WESTERN_EUROPE`, BtR) | Eastern Europe (`EASTERN_EUROPE`, Case Blue / GBII) |
|---|---|---|
| Own sea | none | none |
| Terrain classifier | elevation, roughness, moisture, temperature | flatter: rough only where high and broken, no mountain, woods thicken northward |
| Riverbank woods (share of open hexes beside a river) | 0 | 0.35 |
| Settlements per land hex (default) | 0.10 | 0.05 |
| Land hexes per Major City | 450 | 900 |
| Minor City share of settlements | 0.42 | 0.30 |
| Main-road link range / detour limit | 10 / 1.4 | 6 / 2.0 |
| Track link range / detour limit | 5 / 1.7 | 4 / 2.5 |
| Border exits: spacing / one per border hexes | 5 / 6 | 8 / 12 |
| Road-gap limit, open / woods / hills | 2 / 3 / 3 | 4 / 5 / 5 |
| "Road density is low" warning below | 0.35 | 0.15 |
| Minor Cities with their own rail line | 40% | 10% |
| Rail loops | within 8 hexes when the detour exceeds 2.5× | none |
| Map rows per rail entry | 10 | 14 |

Measured means (30 seeds, `1000 + 37·i`, same seeds for both; 64×48 with 10 seeds):

| Per land hex | Western 32×24 | Eastern 32×24 | Western 64×48 | Eastern 64×48 |
|---|---|---|---|---|
| Clear / Woods / Rough / Mountain / Marsh | 61 / 22 / 17 / 0.6 / 0.3 % | 78 / 16 / 4.4 / 0 / 1.0 % | 61 / 23 / 16 / 0.3 / 0.3 % | 80 / 15 / 4.5 / 0 / 1.0 % |
| Road hexsides | 0.55 | 0.26 | 0.56 | 0.26 |
| Main-road hexsides | 0.41 | 0.16 | 0.39 | 0.13 |
| Rail hexsides | 0.159 | 0.108 | 0.129 | 0.062 |
| Settlements | 0.10 | 0.049 | 0.10 | 0.050 |
| Largest road gap (hexes) | 3 | 4–5 | 3 | 5 |

## Decisions

- **Western Europe follows Beyond the Rhine's density** at its 3.5-mile scale. Hand counts on the BtR VASSAL map
  (`docs/study/07-beyond-the-rhine-vassal-reference.md`; no art copied): Breda–Tilburg–Eindhoven about 0.55 road
  hexsides and 0.12 settlements per land hex with a largest road gap of 2; the Ardennes about 0.35–0.45 road hexsides
  and 0.04 settlements with gaps of 3. Almost every settlement is a 3–5-road junction, and Major Cities are multi-hex
  clusters. These are targets, not a requirement to copy BtR.
- **Railways deliberately sparser than BtR** (user, 2026-10-04), at about a quarter to a third of the road density on
  the default map.
- **Eastern Europe** (user, 2026-10-04: "增加新的map theme, eastern europe (aka russia) 參考 CaseBlue GBII 應該相比BTR
  鐵路道路密度都要更低 地形更平坦"): hand counts on Case Blue's Don bend sheet give about 0.2 road and 0.075 rail
  hexsides and 0.04 places per hex, nearly all open ground. Case Blue uses 5-mile hexes; the generator keeps its 3.5-mile
  hex and thins the BtR values toward that picture so a 32×24 map stays playable. Every entry stays on a road and each
  rail entry on a railway.
- **Western Europe was not changed by adding Eastern Europe**: its generated maps are byte-identical to before
  (30 seeds compared by hash).

## Known gaps

From `docs/quality/05-todo-inventory.md`: `case-blue-terrain` (Case Blue terrain and weather still use BtR's rules),
pending decision 6 (default Eastern maps have about two-thirds of the BtR rail density: 0.66× Western Europe on 32×24 versus a
target of 0.5×, because the trunk between the primary entries is the floor on small maps), `map-appearance` (Autobahn,
side-by-side roads).

## Verification

`tests/generation/random-map.test.ts` (Eastern Europe against Western Europe on the same seeds: no mountains, under half the
hills, under 0.7× the settlements, under 0.6× the roads, under 0.85× the rails, larger but bounded road gaps, one road and
one rail net); browser row MAP-06 with run record `docs/quality/evidence/map-theme-2026-10-04/`.
