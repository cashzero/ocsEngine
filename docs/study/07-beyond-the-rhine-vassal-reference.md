# Study 7: Beyond the Rhine VASSAL reference

## Scope and purpose

Read-only source reviewed: `E:/work/Beyond the Rhine_1_27_0`.

This study asks what the unpacked VASSAL module can contribute to OCS engine
planning. It does not authorize copying game art or treating module automation
as authoritative rules. The OCS v4.3 series rules and the official Beyond the
Rhine game-specific rules remain the authorities for behavior.

For the current product direction, the primary target is a reusable OOB catalog
for random scenario generation. `buildFile.xml` PieceSlots, prototypes and
container hierarchy are therefore the core source. Saved-game placement is a
separate optional overlay and is not required to generate random OOBs.

Reviewed artifacts:

- `moduledata` for module identity and tool version;
- `buildFile.xml` for boards, grids, piece palettes/prototypes, charts, maps,
  holding areas, and predefined setup declarations;
- all ten `.vsav` containers for archive structure, size, and provenance;
- the `images/` inventory and selected dimensions/filenames, without copying;
- `Keyboard Shortcuts.pdf` as evidence of VASSAL interaction only, not rules.

## Artifact identity and inventory

`moduledata` identifies:

- module: `OCS - Beyond the Rhine`;
- module version: `1.27.0`;
- VASSAL version: `3.7.24`;
- description: `OCS 4-14, 7-26 updates`.

The inspected artifact contains:

| Item | Observed count/details | Planning significance |
|---|---|---|
| `buildFile.xml` | 883,156 bytes; SHA-256 `686ECB3090F89AC3952E01C28B3E6446A2315424428652D22DCA3FB5F75212AD` | Stable source identity for extraction reports. |
| Piece slots | 1,320 | Candidate catalog for OOB/piece identity and marker-state discovery, not a normalized OCS data model. |
| Prototypes | 31 | Shows shared VASSAL trait families such as Unit, Supply, Air, Transport, Reserve, Breakdown, and multi-step units. |
| Maps | 15 public maps and 4 private maps | Includes main map, turn/weather, OOA/reinforcement, dead/offboard, division, weather forecast, and rail/sea-cap areas. |
| Boards | 21 | Includes merged A/B and C/D maps, a Bulge map, tracks, OOA boards, and holding areas. |
| Hex grids | 5 | Sideways grids at approximately `dx=94.9`, `dy=109.6`, with board-specific origins and numbering offsets. |
| Charts | 16 | Series charts plus game-specific terrain, weather, supply, replacement, bridge, and random-event charts. |
| Images | 2,602 files, 88,067,756 bytes: 2,591 PNG and 11 JPG | Copyrighted reference assets; inventory only. |

The two large merged map images are 7,574 x 5,936 and 7,577 x 5,890 pixels.
The module also names assets for the TEC, terrain key, weather, bridges, supply,
replacements, OOA, rail capacity, sea capacity, random events, and OCS v4.3
charts. Their presence identifies data dependencies; it does not grant reuse or
prove that an image transcription is correct.

## Predefined scenario evidence

`buildFile.xml` declares ten setups:

| Scenario | Container | SHA-256 |
|---|---|---|
| 6.1 Grand Campaign | `6_1f.vsav` | `94E656174FFCD99005C242DD0719734F80501B64E40E043311C8BC58563F0487` |
| 6.2 Fall of '44 Montgomery | `6_2c.vsav` | `AC2E02CB8CAC97CFD8B179E82B2C5F20ECF0DC6D94F0F6E8C8226D189CFDD874` |
| 6.3 Fall of '44 Patton | `6_3d.vsav` | `FAD65153FB2C0201428071AC9DA02CE0A29428FB37DC2E70E60F98A21B7A984B` |
| 6.4 Operation Queen | `6_4d.vsav` | `01CBC251350A888FE45B61113063F0F1513BE70A452EC4B7432E9FE10B053840` |
| 6.5 Bulge Campaign | `6_5u.vsav` | `D3229D37B2B3787079A60D9B1A95400CB35AEDAE8030A493989FFE70BABB08FB` |
| 6.6 A Time for Trumpets | `6_6c.vsav` | `78FCF7A54516BECD64E6FE06AFF5E85204DBA3A1BEAAAC655D0235B8E8ED9C92` |
| 6.7 Operation Nordwind | `6_7d.vsav` | `91351A6C54A2DE7A196ECA2F840FBB0EA7EDE6DB7969628AD5D14BC7E1966F54` |
| 6.8 EndKampf Campaign | `6_8d.vsav` | `1B3FFA5CFABA76201F896DFCF14CE80C863720B913B49B597870B7FAFB5AADBA` |
| 6.9 Spring '45 North | `6_9d.vsav` | `2041286A301B950833A14DFF815DA174D79B829FC8839DA4C3A390534DA03D69` |
| 6.10 Spring '45 South | `6_10c.vsav` | `58DB3D967D6AC208D8D96AF0CC0A5DF0755DBBE2E175AE9F0E2A63A9847FD452` |

Each `.vsav` is a ZIP archive with one compressed `savedGame` entry. The entry
starts with VASSAL's `!VCSK` encoded save format rather than plain XML or JSON.
Consequently, unzipping and applying regular expressions is not a valid setup
extractor. A supported VASSAL save-game codec/API, or a deterministic VASSAL
export procedure, is required before claiming piece counts, positions, current
faces, layers, ownership, or global state.

`6_4d.vsav` has the smallest compressed and expanded payload, so it remains a
useful future codec/extraction fixture. It is not on the critical path for the
random OOB generator, and its size says nothing about rules scope or balance.

## What the module can and cannot establish

| Evidence | Valid use | Invalid use |
|---|---|---|
| Board/grid configuration | Calibrate pixel-to-hex transforms and verify printed hex numbering per board. | Reuse the raster map or assume BCS hex orientation matches. |
| Piece slots and prototypes | Discover candidate counter identities, faces, marker types, common traits, and OOB groupings. | Execute VASSAL trait strings as OCS domain rules. |
| Decoded predefined setup | Cross-check initial/offboard positions, faces, layers, markers, turn/weather state, and holding areas. | Treat setup state as proof of all scenario-rule text or victory conditions. |
| Chart/image names | Build a required-data manifest and locate material for licensed/manual verification. | Copy images into the product or OCR tables without human/rulebook verification. |
| OOA/reinforcement boards | Cross-check reinforcement groups, timing tracks, and holding-box semantics. | Infer an arrival rule solely from a board layout. |
| VASSAL menus/hotkeys | Identify player workflows and frequent state changes. | Preserve the VASSAL UI or make a hotkey-defined operation automatically legal. |

The palette confirms that the candidate game uses OCS concepts including
supply levels, DG, Exploit, Fueled, OOS, hedgehogs, trucks/wagons, Reserve,
rail capacity, sea capacity, bridges, weather, airbases, air-related markers,
and multi-step units. This is a dependency warning, not a complete list of what
every scenario uses.

The core extraction boundary is:

```text
moduledata + buildFile.xml
  -> raw prototypes and PieceSlots
  -> unit/resource/marker classification
  -> formation and support correlation
  -> reviewed exact OOB records
  -> separate generator archetypes

images/ -> optional printed-rating verification
.vsav   -> optional historical placement overlay
```

Historical OOB records must remain exact. Random-generator archetypes may vary
optional/support slots only through reviewed distributions and must preserve
their derivation and source metadata.

## OCS, BCS, and VASSAL roles

| Source | Role in `ocsEngine` | Authority |
|---|---|---|
| OCS v4.3 series rules | Defines shared domain behavior and rule tests. | Normative, subject to game-specific overrides. |
| Beyond the Rhine official rules/tables | Defines title/scenario exceptions, setup, charts, and victory. | Normative for the selected game; still required. |
| Beyond the Rhine VASSAL module | Reference implementation and setup/data cross-check. | Secondary evidence; provenance must say `module-only` until verified. |
| `bcsEngine` | Source of a few generic non-UI algorithms and engineering lessons. | No authority over OCS rules or content. |

This separation prevents two common failures: implementing OCS by renaming BCS
concepts, and implementing a game rule merely because a VASSAL counter exposes
a particular command.

## Consequences for implementation

### Domain state and data

- Give normalized pieces/scenarios engine-owned IDs. Retain `sourceArtifact`,
  `sourceScenario`, and VASSAL `gpid` only as provenance/cross-check fields.
- Model maps in logical hex coordinates; store board-specific image/grid
  calibration in an import manifest, outside core geometry.
- Represent OOA, reinforcement, dead pile, offboard boxes, division displays,
  tracks, and private information as typed locations or viewer projections, not
  as generic VASSAL maps.
- Keep game-specific records separate from OCS series data and calculations.
- Never make a raster filename the stable identity of a unit or terrain type.

### Actions and rules

- VASSAL commands such as flip, change strength, fill level, reserve, or marker
  placement identify required transitions, but legality and effects must be
  implemented from cited OCS/game rules through `applyAction`.
- Setup import creates a validated initial snapshot; it must not create hidden
  rule handlers from trait text.
- Any discrepancy among series rules, game rules, and module behavior becomes a
  documented adjudication, not an implicit module override.

### UI

- Build the OCS UI from a new view model and interaction design.
- Do not reuse VASSAL widgets, menus, toolbar layout, keyboard scheme, images,
  or BCS React components.
- The module may inform workflow requirements such as viewing OOA areas,
  inspecting stacks, changing a counter's declared state, and recording
  capacity tracks. Those requirements must be redesigned and must dispatch the
  same headless engine actions as all other clients.

### Tests

- Create an artifact identity test for module version and source checksums.
- Test pixel/hex calibration against several known printed hexes on every board,
  including seams, before importing positions.
- After decoding, compare extracted piece counts/locations/state with an
  independent VASSAL inspection sample and produce a discrepancy report.
- Validate every imported piece and location against the normalized schema;
  quarantine unknown prototypes, markers, and coordinates.
- Build scenario tests only from rulebook-verified normalized data. Keep module
  cross-check tests separate so a VASSAL update cannot silently change rules.
- Do not place original raster assets into automated test fixtures; use IDs,
  hashes, tiny synthetic fixtures, or user-provided imports.

## Reuse classification

| Classification | Decision |
|---|---|
| Direct | None. The module is not application source code, and its assets/configuration are game-specific. |
| Adapt | A read-only import/report tool may adapt VASSAL archive/XML decoding into a neutral manifest, with no runtime dependency on VASSAL UI. |
| Reference | Board calibration, setup/OOB cross-checks, piece/marker inventory, offboard workflows, and required-table discovery. |
| None | Raster/PDF assets, VASSAL UI configuration, keyboard shortcuts, trait automation as rules, and any BCS-style UI component. |

## Recommended generator-study outputs

Each extraction step must create a reviewable document or report:

1. `btr-artifact-manifest`: file version, path, size, checksum, extractor version,
   and extraction timestamp;
2. `btr-build-model-report`: prototypes, PieceSlots, containers, images,
   warnings, and unknown traits;
3. `btr-raw-oob-report`: unmodified counter, formation, support, logistics and
   source identifiers;
4. `btr-normalized-oob-report`: reviewed OCS roles, exact values, confidence and
   all normalization decisions;
5. `btr-generator-archetypes`: required/optional slots, formation-size and
   role/resource distributions, source sample sizes and outliers;
6. `btr-oob-validation`: deterministic output, unassigned pieces, ambiguous
   formations, missing ratings and catalog coverage;
7. optional `btr-scenario-overlay-6-x` reports only if historical placement or
   setup validation is later requested.

These are generator-study evidence outputs. They do not require or authorize
runtime engine implementation or inclusion of VASSAL artwork.

## Unresolved questions and dependencies

- The official Beyond the Rhine game-specific rules and table provenance are
  not present in the inspected directory; they are required to verify ratings,
  capabilities and OCS-specific exceptions used by generator templates.
- Formation membership and support/logistics relationships must be derived and
  reviewed from PieceSlot traits and container hierarchy.
- A supported VASSAL 3.7 save codec/export path is required only for the
  optional scenario-placement overlay, not for the base OOB catalog.
- Piece palette membership is not the same as a historical scenario setup; the
  random generator must consume curated catalog/archetype data, not assume all
  pieces belong in one generated OOB.
- Legal permission is required before redistributing any map, counter, chart,
  PDF, or derived dataset that may reproduce protected game content.
- Coordinate seams among the A/B, C/D, and Bulge boards require calibration and
  printed-hex sampling.
- Module version changes need a fresh manifest and explicit diff review.

## Completion checklist

- [x] Module identity, version, source scope, and checksums are recorded.
- [x] Build configuration, image inventory, maps, grids, charts, pieces, and
  predefined setups are inventoried.
- [x] The `.vsav` container and codec boundary is identified without claiming
  unparsed scenario facts.
- [x] OCS rules, game rules, VASSAL evidence, and BCS reuse have distinct roles.
- [x] Domain, action/rule, UI, and test consequences are documented.
- [x] Reuse is classified as direct, adapt, reference, or none.
- [x] Every next generator study/extraction step has its own required output.
- [x] UI reimplementation and copyrighted-asset boundaries are explicit.
- [x] Core OOB extraction is separated from optional `.vsav` placement.
