# Counter corpus

## Scope

Where the printed values of generated counters come from: the Beyond the Rhine VASSAL module, the reviewed archetype
catalog, the ground and air counter corpora, and the source evidence every generated definition carries. Generated
pieces cite this document as the source of their printed faces (`source.document` in each definition). How the
generator uses the corpus is in [random-oob.md](random-oob.md).

## Current behavior

### Source

- `E:\work\Beyond the Rhine_1_27_0\buildFile.xml`: VASSAL module `OCS - Beyond the Rhine` 1.27.0, SHA-256
  `686ECB3090F89AC3952E01C28B3E6446A2315424428652D22DCA3FB5F75212AD` (`BTR_BUILD_FILE_SHA256`), 1,320 PieceSlots.
- The module is a reference corpus only: the generator never opens it at runtime; reviewed locators and values are
  embedded in the code, so builds and tests are portable.
- VASSAL `entryName` and GPID identify a counter. Encoded trait strings are not used as a rules-data API; printed values
  are transcribed by hand from each counter's front and back images.

### Reviewed archetypes (`src/generation/oob/catalog.ts`)

`REVIEWED_OOB_ARCHETYPES` maps each side and role to one BTR counter: HQ, armored, infantry, mobile infantry (Axis) and
airborne divisions, organic artillery and reconnaissance, independent tanks and anti-tank (Axis heavy Tiger and
Jagdpanther battalions for balancing), engineer (pontoon), truck and supply dump, plus a generator-defined objective
garrison (1 step, 1-1-0, foot, with ZOC; not a BTR counter).

### Ground counter corpus (`src/generation/oob/counter-corpus.ts`)

`COUNTER_CORPUS` holds, per GPID, the symbol, kind, echelon, category, the Combat and Move faces (strength or barrage,
AR, MA, range), mobility per face, steps and RE. Examples:

- HQs print range-MA (13.1a): US corps 14-0 / 9-16, US 18th Airborne Corps 8-0 / 6-16, German panzer corps 10-0 / 7-14,
  other German corps 8-0 / 5-10 (Gruppe Hohne prints "Grp").
- Infantry divisions are single XX counters with 4 steps (US motorized 24-4-3 on the Combat face; German leg 16-3-3).
- The German Fallschirmjäger division (sheets 3F/3B) is 18-3-3 / 9-3-4. US airborne divisions are the sum of their printed
  regiments on sheet 2B, one step per regiment: 82.Abn 14-4-3 / 8-4-5, 101.Abn 18-4-3 / 10-4-5, 17.Abn and 13.Abn
  13-4-3 / 7-4-5.
- OOB 0.4.0 independents: US 745 Tank Bn, US 803 TD Bn, German 243 Assault Gun Bn, German 1 PJ Bn, and the balancing
  German 506 Tiger Bn (9-5-4) and 654 PJ Bn (6-5-6).
- Trucks (the five-point counter's faces; each generated truck prints its own size) and the Breakdown pools ([docs/rule-engine/breakdowns.md](../rule-engine/breakdowns.md),
  `breakdowns.ts`); the Pax and Eq replacement units (`replacements.ts`; Pax 5 Leg MP, Eq 10 Truck MP) and the hedgehog
  (`hedgehog.ts`, GPID 12) are defined beside the corpus.

### Air counter corpus (`src/generation/oob/air-corpus.ts`)

From the PieceSlots with the `AAir` / `XAir` prototypes; front and back images transcribed and hashed per counter. Format
(3.5, 14.1): type badge (F, T, Tpt), type, range in hexes, Air Combat Rating (parenthesized: cannot initiate air combat,
14.3a), barrage strength; the back is the reduced face.

| Side | Type | Kind | Range | Full | Reduced |
|---|---|---|---|---|---|
| US | P-38 | F | 186 | 5-10 | 4-5 |
| US | P-47 | F | 114 | 5-8 | 4-4 |
| US | P-51 | F | 136 | 6-4 | 5-2 |
| US | A-20 | T | 150 | (2)-10 | (1)-5 |
| US | A-26 | T | 200 | (3)-15 | (2)-8 |
| US | B-26 | T | 157 | (3)-10 | (2)-5 |
| German | Bf.109 | F | 76 | 4-1, 5-1 | 3-0, 4-0 |
| German | Fw-190a | F | 71 | 5-2, 4-2 | 4-1, 3-1 |
| German | Fw-190d | F | 74 | 6-2, 5-2 | 5-1, 4-1 |
| German | Fw-190f | F | 64 | 4-8, 3-7 | 3-4, 2-4 |
| German | Ju.88 | T | 106 | (2)-12, (2)-9 | (1)-6, (1)-5 |

Transports: C-47 (GPID 493), C-47 with glider (498), Ju.52 (1279). Transcribed but not generated: Me.262, He.162,
Ar.234.

### Source evidence on each definition

Every generated definition carries two evidence records: name and role (`HIGH`, `REVIEWED`, the BTR raw name), and
counter faces (`MEDIUM`, `REVIEWED`, pointing to this document and the GPID). The names, designations and affiliations
are the generator's; the printed values are BTR's.

## Decisions

- **Printed values, not invented ones**: earlier generator design values were replaced by transcribed BTR faces, so
  generated counters read like the printed game.
- **No exact historical OOB**: the official game-specific OOB and rating sources were not available, so the generator is
  OOB-inspired and traceable; an exact historical mode would need separately reviewed data.
- **BCS reuse was limited to the pipeline shape** (options, one seeded stream, reviewed templates, complete packages,
  validation, sweeps); BCS command, Combat Train, activation, SNAFU, AV and engagement-zone semantics were not imported
  (`docs/study/11-bcs-random-oob.md`).
- **Excluded air counters**: BTR interdiction and Luftflotte variants (game-specific rules left out by the user), jets
  (BTR-specific categories), and Commonwealth and French types (the generator fields only US against German).

## Known gaps

From `docs/quality/05-todo-inventory.md`: `airborne-gpid` (placeholder GPIDs for airborne divisions), `para-gpid`
(generator-made paratroop battalion), `transport-art`, `pax-counter-art`, `oob-name-import`, `counter-fidelity`.

## Verification

`tests/generation/random-oob.test.ts`, `tests/generation/oob-revision.test.ts`, `tests/rules/ocs-air.test.ts` (air
corpus); counter rendering rows CTR-01 to CTR-08 in `docs/quality/03-product-operation-verification-plan.md`.
