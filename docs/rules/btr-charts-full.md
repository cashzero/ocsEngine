# Beyond the Rhine charts — full text transcription

Every table image in the Beyond the Rhine VASSAL module, transcribed as printed, whether or not the engine applies it,
so nobody has to open the images again (user request 2026-10-10). Most of these are game-specific rules that
generated games leave out; what generated games use is listed under "Engine use" for each table, and the series
charts are in [ocs-4.3-charts-full.md](ocs-4.3-charts-full.md). Rule numbers like 1.8 or 3.7b refer to the Beyond
the Rhine game rules, not the series rules.

Source: the user-supplied Beyond the Rhine VASSAL module 1.27.0, `images/`.

| Image | SHA-256 | Section |
|---|---|---|
| `BTR TEC.jpg` | `70ca1a8564a6527db668fd5c347d423ec81384d45a7a7628162286b1b513a770` | Terrain Effects on Combat / Movement |
| `BTR Weather Table.jpg` | `3ba45897450e339c22557e526890e14288d540fe81f65d9db0db2373259ed52f` | Weather Table |
| `BTR Axis Supply.jpg` | `e4167413c9bd95cabf5fdca33a60ea1abad401e1144813d62f59ef66eb6865fd` | German Supply Table |
| `BTR Allied Supply RR & Sea Caps.jpg` | `385152328edf336a5b8dc4782d63ccd6bb8fab9eb46e0a8c55f924a9b71d4c43` | American / Commonwealth Supply, Allied Shipping |
| `BTR Axis Repl, RR & Sea Caps.jpg` | `833abc44cacdf9ddafaccf974f493afb782bb4be73f5ea1280154a6fada46ee7` | German Repl Table, German Shipping |
| `BTR Allied Repl.jpg` | `8beb042827bd3fdf9bf8090bc4732def4d8f6aa311aeac0303ab77e6a4e2a23a` | American / Commonwealth Repls |
| `BTR Rebuild Table 2.jpg` | `dc025e692df0b72571b2122249e0543b58c0c1e6e3ab479fe3353a278b144000` | Common Rebuild Table |
| `BTR-Bridge-Charts.jpg` | `872b4fbcf59fbfaaa2c2b839532d3274b4222737f26791217a44daa4421404c5` | Rhine River and Pontoon rolls |
| `BTR-Terrain-Key.jpg` | `8cb8db15e42faddd3bace6112e53108ab0cb88a4fd251c699eee24a6ca13bbb4` | Terrain Key |

Not tables, and not transcribed: `Rail-Sea-Cap.png` (a record track: boxes 1-10 and 0T-3T), `Turn Weather.png` and
`Future Weather.png` (the Weather Record display: Dry / Mud / Snow, Flight / Limited Flight / No Flight), and the
70 × 70 markers (`Supply A.png`, `US-Repl-Pax.png`, `Allied-Rail-Cap.png`, Victory markers and the like).

---

## Terrain Effects on Combat

| Type | Combat Line | Armor | Mech | Other |
|---|---|---|---|---|
| Open | Open | [x2] | [x2] | x1 |
| Hills | Close | x1 | x1 | x1 |
| Woods | Close | x1 | x1 | x1 |
| Heavy Woods | Very Close | x1/2 | x1 | x1 |
| Polder or Swamp | Very Close | x1/2\*\* | x1/2\*\* | x1 |
| Mountain | Extremely Close | x1/3\* | [x1/2]\* | x1 |
| Village | Close | x1 | x1 | x1 |
| Minor City | Very Close | x1/2 | [x1/2] | x1 |
| Major City | Extremely Close | x1/3 | [x1/2] | x1 |
| Minor River or Canal (Dry/Mud) | ot | [x1/2] | [x1/2] | [x1/2] |
| Minor River or Canal (Snow) | ot | [x1/2] | [x1/2] | x1 |
| Major River or Canal | ot | [x1/4]\* | [x1/3] | [x1/2] |
| Rhine River | ot | [x1/4]\* | [x1/3]\* | [x1/2]\* |
| Rhine ferry/blown bridge | ot | - | - | [x1/4] |
| Blocked (sea/lake/estuary) | ot | [x1/4]\* | [x1/4]\* | [x1/4]\* |
| West Wall | Close | x1 | x1 | x1 |

- `*` = Road only. `[#]` = affects attackers only, defending units are x1. `ot` = Use Other Terrain.
- Features not listed have no effect on Combat; use other terrain to determine any combat terrain effects.
- `**` = Road only for some Mobility Types during some ground conditions (per chart below).

Engine use: `src/game-flow/combat-tec.ts`, mapping in [ocs-4.3-charts.md](ocs-4.3-charts.md).

## Terrain Effects on Movement

| Terrain | Dry Track | Dry Truck | Dry Leg | Mud Track | Mud Truck | Mud Leg | Snow Track | Snow Truck | Snow Leg |
|---|---|---|---|---|---|---|---|---|---|
| Open | 1 | 1 | 1 | 4 | 8 | 2 | 2 | 2 | 2 |
| Hills | 2 | 3 | 1 | 4 | 6 | 2 | 3 | 6 | 2 |
| Light Woods | 2 | 3 | 1 | 6 | All | 2 | 4 | 5 | 3 |
| Heavy Woods | 3 | 5 | 2 | All | All | 2 | 4 | 6 | 3 |
| Polder | P | P | 2 | P | P | 3 | P | P | 2 |
| Swamp | P | P | 3 | P | P | 4 | 5 | 6 | 3 |
| Mountain | P | P | All | P | P | All | P | P | All |
| Village | ot | ot | ot | ot | ot | ot | ot | ot | ot |
| City (Major or Minor) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| Minor River/Canals | +3 | +5 | +1 | +4 | +6 | +2 | +3 | +5 | +1 |
| Major River/Canals | P | P | All | P | P | All | P | P | All |
| Rhine River | P | P | P | P | P | P | P | P | P |
| Rhine ferry/blown bridge\* | P | P | All | P | P | All | P | P | P |
| Blocked (sea/lake/estuary) | P | P | P | P | P | P | P | P | P |
| Roads | 1/2\*\* | 1/2\*\* | 1/2\*\* | 1 | 2 | 1 | 1 | 1 | 1 |
| Autobahns | 1/3\*\* | 1/3\*\* | 1/3\*\* | 1 | 1 | 1 | 1/2\*\* | 1/2\*\* | 1/2\*\* |
| Railroads or Tracks | 1 | 1 | 1 | 1 | 4 | 1 | 1 | 1 | 1 |

- `*` A repaired Rhine Bridge reverts to normal road/track/railroad costs. `ot` = Use Other Terrain.
- `**` Increase the cost to 1 MP for **Axis** movement during Normal Flight conditions *unless* Interdiction is
  suspended (3.7b).
- `P` = Prohibited. If a weather change leaves a Track/Truck MA unit in prohibited terrain, such as a swamp that
  unfreezes, it is stuck there until the ground freezes again (assuming no road). So be careful!

Engine use: `src/game-flow/movement-tec.ts`, from the Japanese edition in [btr-movement-tec.md](btr-movement-tec.md)
(same values; that edition lists Lake, Ocean and Secondary Road / Track separately). The Axis Normal Flight `**`
increase is not applied (Interdiction, 3.7b, is not implemented).

## Weather Table

Roll 1 die for Ground Conditions and then 2 dice for Flight Conditions.

| Date | Dry | Mud | Snow | Flight: None | Flight: Limited | Flight: Normal |
|---|---|---|---|---|---|---|
| September | Auto | — | — | 2-3 | 4-6 | 7-12 |
| October 1-12 | Auto | — | — | 2-3 | 4-6 | 7-12 |
| October 15-29 | 1-4 | 5-6 | — | 2-4 | 5-7 | 8-12 |
| November 1-15 | 1-2 | 3-6 | — | 2-4 | 5-7 | 8-12 |
| November 19-29 | 1-2 | 3-6 | — | 2-4 | 5-8 | 9-12 |
| December 1-19 | 1-3 | 4 | 5-6 | 2-5 | 6-8 | 9-12 |
| December 22-29 | 1-2 | — | 3-6 | 2-5 | 6-8 | 9-12 |
| January 1-19 | — | — | Auto | 2-5 | 6-8 | 9-12 |
| January 22-29 | 1 | — | 2-6 | 2-4 | 5-8 | 9-12 |
| February 1-15 | 1-2 | 3 | 4-6 | 2-4 | 5-7 | 8-12 |
| February 19-26 | 1-2 | 3-4 | 5-6 | 2-4 | 5-7 | 8-12 |
| March 1-8 | 1-3 | 4-5 | 6 | 2-3 | 4-7 | 8-12 |
| March 12-19 | 1-2 | 3-6 | — | 2-3 | 4-6 | 7-12 |
| March 22-29 | 1-3 | 4-6 | — | 2-3 | 4-6 | 7-12 |
| April | 1-3 | 4-6 | — | 2-3 | 4-6 | 7-12 |

Ground Effects:
- Dry: None.
- Mud: Move using Mud Column. Refit at airbases is halved.
- Snow: Move using Snow Column. Refit at airbases is halved. No Seaborne Assaults. No Pontoon rolls (1.10).

Flight Effects:
- Normal: Air missions in all phases.
- Limited: Air missions allowed in the player's Regular Movement Phase only. Hip Shoots not allowed. Interdiction
  suspended (3.7b).
- None: Air missions not allowed. Refit + air reinforcement arrival are allowed.

Engine use: the Ground Conditions columns (`BTR_WEATHER_TABLE` in `src/game-flow/weather-supply-tables.ts`, checked
against this table). Flight Conditions are rolled and restrict air missions as above (`flight` ranges of the same
table rows). The Mud/Snow refit halving, the Snow Seaborne Assault and Pontoon restrictions, and Interdiction are not
applied (series rule 17.0d forbids weather limiting Refit).

## German Supply Table

Two dice, by Supply Status column. Base column to be used is noted to the right of the table. (Apply all negative
shifts before applying positive ones.)

| Two Dice | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2-3 | 1 | 2 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 10 |
| 4-5 | 2 | 2 | 3 | 4 | 5 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
| 6-8 | 2 | 3 | 4 | 5 | 6 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| 9-10 | 2 | 3 | 4 | 6 | 7 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
| 11-12 | 3 | 4 | 5 | 7 | 7 | 8 | 9 | 9 | 10 | 11 | 12 | 13 |

German Supply Status: Sept and Oct 9; Nov 8; Dec 9; Jan to May 8; After Clarion Event 6.

Column Modifiers to Supply Status:
- −1 All Ruhr hexes out of trace or captured
- −1 All Saar hexes out of trace or captured
- −1 Allied Broadfront restriction lifted
- +1 No-Flight conditions
- −1 Normal Flight conditions
- ? shifts from Random Events

Engine use: both sides of a generated game roll this table, with the column equal to their number of divisions
(`BTR_SUPPLY_TABLE`, checked against this table 2026-10-10); the status dates and modifiers are not applied.

## American Supply Table

Two dice, by Supply Status column. Base column to be used is noted to the right of the table.

| Two Dice | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2-3 | 1 | 2 | 2 | 3 | 4 | 4 | 5 | 5 | 6 | 7 | 8 | 9 |
| 4-5 | 2 | 3 | 3 | 4 | 5 | 5 | 6 | 6 | 7 | 8 | 10 | 11 |
| 6-8 | 3 | 4 | 5 | 6 | 7 | 8 | 8 | 9 | 10 | 11 | 12 | 13 |
| 9-10 | 3 | 5 | 6 | 6 | 7 | 8 | 9 | 9 | 10 | 11 | 12 | 14 |
| 11-12 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 10 | 11 | 12 | 14 | 15 |

American Supply Status: 5 Sept: 5; 8 Sept to 12 Sept: 6; 15 Sept to 22 Sept: 7; 26 Sept to 5 Oct: 8; 8 Oct to
22 Oct: 9; 26 Oct on: 10.

## Commonwealth Supply Table

Two dice, by Supply Status column. Base column to be used is noted to the right of the table.

| Two Dice | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2-3 | 0 | 1 | 1 | 1 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 |
| 4-5 | 1 | 2 | 2 | 2 | 3 | 3 | 4 | 4 | 5 | 6 | 6 | 7 |
| 6-8 | 2 | 2 | 3 | 3 | 3 | 4 | 4 | 5 | 6 | 7 | 7 | 8 |
| 9-10 | 2 | 3 | 3 | 4 | 4 | 4 | 5 | 5 | 6 | 7 | 8 | 9 |
| 11-12 | 2 | 3 | 4 | 4 | 4 | 5 | 5 | 6 | 7 | 8 | 9 | 10 |

Commonwealth Supply Status: 5 Sept to 12 Oct: 6; 15 Oct to 15 Nov: 7; 19 Nov on: 8.

Column Modifiers to Supply Status (both American and Commonwealth):
- Only one Antwerpen port controlled/repaired (1.11): US gets +1, CW gets +1
- Both Antwerpen ports controlled/repaired (1.11): US gets +2, CW gets +2
- Rotterdam port controlled/repaired (1.11): US gets +1; CW gets +1
- Amsterdam port controlled/repaired (1.11): US gets +1; CW gets +1
- Random Events: ?
- Collapse of the North Flank (4.3c): only Commonwealth gets −2
- Alpine Redoubt (4.4c): only US gets −2
- Mud Turn: −2
- Snow Turn: −1

Important Note: Apply negative shifts before applying positive ones.

Engine use: none (generated games give both sides the German Supply Table).

## Allied Shipping

| Month | Rail | Sea |
|---|---|---|
| Sept | 0 | 1 |
| Oct | 2 | 2 |
| Nov | 4 | 4 |
| Dec | 6 | 5 |
| 1945 | 10 | 6 |

In non-campaign scenarios use the scenario-specific shipping caps.

## German Shipping

- Rail Cap 10\*
- Sea Cap 1\*\*

`*` Rail Cap is reduced by events. `**` Sea Cap begins in October. In non-campaign scenarios use the
scenario-specific shipping caps.

Engine use: none; generated games set Rail Cap and Sea Cap from the force size (`docs/roadmap/15-rail-cap-wbs.md`,
`docs/generator/random-map.md`).

## German Repl Table

| Two Dice | Ftr | Jet | Pax | Eq | Misc | FP | HH | Alarm | EP | FA | WaR | LR | WW |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 or less | - | - | - | - | - | 1 | 1 | - | Y | Y | - | - | - |
| 4-5 | - | - | 1 | - | - | - | - | Y | - | - | - | - | - |
| 6 | - | - | 1 | - | - | - | - | Y | - | - | - | - | Y |
| 7 | 1 | - | 2 | 1 | - | - | - | Y | - | - | - | - | Y |
| 8 | 1 | - | 2 | 1 | - | - | - | Y | - | Y | Y | - | Y |
| 9 | 1 | - | 2 | 1 | - | - | 1 | Y | - | Y | Y | - | Y |
| 10 | 2 | 1 | 2 | 1 | 1 | - | 1 | Y | Y | Y | Y | Y | Y |
| 11 | 2 | 1 | 3 | 1 | 1 | 1 | 1 | Y | Y | Y | Y | Y | Y |
| 12 | 2 | 1 | 3 | 2 | 1 | 1 | 1 | Y | Y | Y | Y | Y | Y |

Die Roll Modifiers:
- −1 The Ruhr (all hexes) out of trace supply or captured **and** it is 1945
- −1 The Saar (all hexes) out of trace supply or captured **and** it is 1945
- −1 Allied Broadfront restriction have been *permanently* lifted (3.10a)
- −1 If 1945

Notes: Y = Yes.

Air Repls (Ftr and Jet): Eq cannot be used to rebuild aircraft. Result is the number of on-map aircraft that can be
flipped to full strength and/or taken from the dead pool at full strength. Air Repls must be used the instant they
are awarded. If no such aircraft exists to make use of the repl, it is wasted.
- Ftr: Me 109, Fw 190 (all types)
- Jet: Me 262, Arado 264, He 162
- Cannot be rebuilt: Ju 52, Ju 88

Misc: Rebuild one dead Artillery, Nebelwerfer, Mortar, HQ, or Pontoon unit. Alternately, one dead Truck or Wagon point
can be rebuilt, coming back unloaded. In no case can a Misc repl be saved: use it immediately or lose it.

FP (FesterPlatz): German Player may place one FP unit + 1 SP (bonus). See rule 2.2.

HH (Hedgehog): Place a Level-1 Hedgehog in any hex in trace supply that is both west of and not touching a
Rhine-Class river. (No adding to existing hogs, including printed fortifications and West Wall.)

Alarm: One Alarm Pool unit can arrive (random pick). See rule 2.2.

EP (Emergency Pool): German Player may "Ready" up to two units in the Emergency Box. See rule 2.3.

FA (Fortress Artillery): Germans get one free 15-point barrage (before any pertinent shifts) within 2 hexes of any
German-controlled major or minor city. Resolve immediately. Note no actual arty is needed!

WaR (Wacht am Rhein prep): One panzer division moves from Unready to Ready (starting 19 Oct). See rule 2.9b.

LR (Luftflotte Reich): These fighters are released. See rule 2.2.

WW (West Wall): Upgrade a West Wall hex. See rule 1.5a.

Engine use: none; generated games give a fixed Pax/Eq allotment (`replacements-rebuilds`).

## American and Commonwealth Repls

Make separate rolls for the Americans and the Commonwealth. American Repls can be used by French as well as US forces.
Commonwealth Repls can be used by any Allied forces that are not US or FR.

| Two Dice | US Ftr | US Other | US Pax | US Eq | US Misc | CW Ftr | CW Other | CW Pax | CW Eq | CW Misc |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 or less | - | - | - | - | - | - | - | - | - | - |
| 3 | - | - | - | - | - | - | - | - | - | - |
| 4-5 | - | - | - | - | - | - | - | - | - | - |
| 6 | - | - | 1 | - | - | - | - | - | - | - |
| 7 | - | - | 1 | 1 | - | - | - | - | 1 | - |
| 8-9 | 1 | 1 | 2\* | 1 | - | 1 | 1 | 1 | 1 | - |
| 10 | 2 | 2 | 2\* | 2 | 1 | 1 | 1 | 1 | 1 | 1 |
| 11 | 2 | 2 | 2\* | 3 | 1 | 1 | 1 | 2 | 2 | 1 |
| 12 or more | 2 | 2 | 3\* | 3 | 1+ | 1 | 1 | 2 | 2 | 1+ |

Modifier: +1 to American rolls if 1945.

Misc: The player can rebuild a lost independent combat unit (OCS 3.2f), or recover a step on a reduced arty division
in trace supply that is not in a ZOC. Alternately, one dead Truck or Mule/Weasel point can be rebuilt, coming back
unloaded. The "+" indicates a Bridge Check Marker (1.8b) is also received. In no case can a Misc repl be saved: use it
immediately (to rebuild and possibly gain a Bridge Check Marker marker) or lose it.

Pax: The "\*" results are reduced by 1 from 1 Nov thru 29 March to reflect Pax covering American trench-foot losses
(3.2a).

Air Repls (Ftr and Other): Eq Repls cannot be used to rebuild aircraft in this game. Result is the number of aircraft
that can be flipped to full strength and/or taken from the dead pool at full strength. Air Repls must be used the
instant they are awarded. If no such aircraft exists to make use of the repl, it is wasted.
- Ftr: P-38, P-47, P-51, Spitfire, Tempest, Typhoon
- Other: A-20, A-26, B-25, B-26, C-47, Mosquito

Engine use: none (fixed allotment, see German Repl Table). Note that generated games let Eq rebuild aircraft
(13.5f), which this game's rule forbids.

## Common Rebuild Table

Unless otherwise noted, use the basic unit type. For example, Motorized Infantry rebuilds the same as regular
Infantry.

| Unit | Cost |
|---|---|
| Air step | Per Repl Table |
| Alert Bn | Return to Pool |
| Armor (or Pz) unit | 1x Eq (per step) |
| AT or PJ Bn (truck/track in Move) | 1x Eq |
| AT or PJ Bn (leg in Move) | 1x Pax |
| Arm Recon Bn | 1x Eq |
| Artillery (truck/track in Move) | 2x Eq (per RE) |
| Railroad Arty ("rr" in Move) | No Rebuild |
| Assault Engineer Bn | 2x Pax |
| Assault Engineer Rgt | 3x Pax |
| Assault Gun (AG) Bn | 1x Eq |
| Armor unit | 1x Eq (per step) |
| Bicycle unit | 1x Pax (per RE) |
| Breakdown Rgt | No Rebuild |
| Cavalry Recon Grp | 1x Eq |
| Commando Bde | 3x Pax |
| Flak (Antiaircraft) Bn | 1x Eq |
| Fkl or Flm or FT tank unit | 1x Eq |
| HQ or Pontoon | 1x Eq + 1 Pax |
| Fester Platz | Return to Pool |
| Glider Inf Rgt | 2x Pax |
| Glider Inf Bde | 3x Pax |
| Infantry unit | 2x Pax (per RE) |
| Lt Tank Bn | 1x Eq |
| Luftwaffe (LW) Bn | 1x Pax |
| Marine or Naval unit | 2x Pax (per RE) |
| Mountain unit | 2x Pax (per RE) |
| Mech Inf Bn, Bde or Rgt (Allied) | 1x Eq (per step) |
| MG Bn (all types) | 1x Pax |
| Mortar Bn | 1x Eq |
| Motorcycle Bn | 1x Pax |
| Mule point | Per Repl Table |
| Ost or Penal Bn | No Rebuild |
| Panzer or Arm unit | 1x Eq (per step) |
| PJ or AT Bn (truck/track in Move) | 1x Eq |
| PJ or AT Bn (leg in Move) | 1x Pax |
| Para Inf Bn | 1x Pax |
| Para Inf Rgt or Div (Allied) | 3x Pax (per RE) |
| Para Inf (German) | 2x Pax (per RE) |
| Pio Bn | 2x Pax |
| Police Rgt | 2x Pax |
| PzGr Rgt (German) | 1x Eq + 1x Pax |
| Recon Bn | 1x Eq |
| Rocket or Werfer unit | 2x Eq (per RE) |
| Remnant Bn | No Rebuild |
| Tank or Pz unit | 1x Eq (per step) |
| Tiger unit | 1x Eq (per step) |
| Truck point | Per Repl Table |
| VG Inf unit | 2x Pax (per RE) |
| Volksturm Bn | Return to Pool |
| Wagon point | Per Repl Table |
| Werfer or Rocket unit | 2x Eq (per RE) |

Engine use: none; generated games derive one generic rule from each counter (Armor, Mech and artillery steps 1 Eq,
all others 1 Pax; `replacements-rebuilds`). This table is the printed one the manifest gap refers to.

## Rhine River (1.8) and Pontoon Units (1.10)

All two dice.

| Roll | Result |
|---|---|
| **Bridge Check Markers (1.8b)** | |
| 2-4 | Bridge is not blown |
| 5-12 | Bridge is blown |
| **Optional Bridge Checks (5.6)** | |
| 2 | Failure (Bridge is not blown) |
| 3-11 | Success (Bridge is blown) |
| 12 | Success (*Unless* a Bridge Check Marker was spent) |
| **Emplace Pontoon Marker (A)** | |
| 2-7 | Pontoon Fails |
| 8-12 | Pontoon Succeeds |
| **Repair Rhine Bridge (B)** | |
| 2-7 | Repair Fails |
| 8-12 | Repair Succeeds |
| **Upgrade Pontoon to Bridge (C)** | |
| 2-7 | Upgrade Fails |
| 8-12 | Upgrade Succeeds |

Engine use: none (generated maps have no Rhine; engineers bridge per series rule 13.8b, `engineering.bridging`).

## Terrain Key

Open; Autobahn; Secondary Road; Track; Railroad; Polder; Woods; Hills; Mountain; Swamp; Major City; Minor City;
Village; Heavy Woods; Rhein River; Major River or Canal; Minor River or Canal; Lake; Ocean; Blocked; Ruhr (1.12a) and
Saar (1.12b); West Wall; Maginot Fort; Major Port; Port; Hex associated with a Major Port (1.11a); National Border;
Air Entry Point.
