# Unit counter fidelity correction plan

Status: **IN PROGRESS**. Printed counter faces are rendered and CTR-01 to CTR-04 and CTR-07 pass at 1920×1080;
CF5 is open while CTR-05, CTR-06 and CTR-08 are not `PASS` and the screen-space LOD levels are unverified
(row status: `docs/quality/03-product-operation-verification-plan.md` section B1).

This plan reopens the unit-counter portion of U4. The existing implementation proves
viewer projection, selection, stacking, and redaction, but it does not reproduce the
printed information hierarchy of an OCS counter. A selectable rectangle containing a
role abbreviation plus `steps · mode` is not an acceptable substitute for a unit
counter.

The first delivery goal is counter fidelity. General visual polish, animation, theme
work, and optional inspection conveniences are deferred until this gate passes.

## Acceptance authority and reviewed evidence

Use these sources in this order:

1. OCS Series Rules v4.3, section 3.1 and the "OCS Unit Explanations" figure on PDF
   page 4, for the meaning and placement of printed fields.
2. The unpacked `OCS - Beyond the Rhine` VASSAL module v1.27.0 for representative
   game-counter faces, colors, formation bands, symbols, and front/back treatment.
3. Engine state for the values and face currently in play. VASSAL images are reference
   evidence, not runtime assets and must not be copied into the product.

Representative VASSAL evidence is the reviewed 18-GPID set already named in
`src/generation/oob/catalog.ts`: Allied 319/160/339/385/164/163/466/77/321 and Axis
1103/733/826/806/739/737/713/71/359. The review sheet must record each GPID's
`entryName`, front image, back image or state layers, printed fields, symbol, echelon,
mobility color, combat-category fill, formation marking, and any ambiguity. Ambiguous
marks stay `UNVERIFIED`; they must not be guessed into the model.

## Evidence that reopens U4

| Area | Rulebook / VASSAL reference | Current implementation | Judgment |
|---|---|---|---|
| Shape | Representative pieces are 70×70 square counters | 46×40 rounded rectangles | Not aligned |
| Basic combat unit | Designation, echelon, unit symbol, Combat Strength, Action Rating, MA, optional RE dot, affiliation | Role abbreviation plus remaining steps and mode | Required printed fields absent |
| Semantic color | Counter nationality/side, symbol background for combat category, MA color/box for mobility, formation stripe | Amber/blue owner fill | Meanings are collapsed into player color |
| Faces | Combat and Move faces have different printed values; orientation is separate from marker mode | One face named `front`; mode text substitutes for orientation | Data and presentation are incomplete |
| Artillery | Artillery layout uses Barrage Strength and Range | Generic `ART` role label | Wrong template |
| HQ | HQ layout uses throw range and MA with HQ identity | Generic `HQ` role label | Wrong template |
| Transport | Point value, loaded/full state, vehicle type, and MA | Generic `TRN` role label | Wrong template |
| Supply | Supply quantity/state has its own counter grammar | Generic `SUP` role label | Wrong template |
| Formation identity | Designation and formation color/affiliation are printed on the counter | Generic generated name only in accessible/detail text | Not visible on the counter |
| Dynamic state | Face, step profile, resource quantity, and applicable mode/status markers alter what the player sees | Only steps and a shortened mode string change | Insufficient |
| Preview continuity | A player can inspect the actual generated counters before starting and compare them after mount | New Game preview shows formation summaries, not unit counters | Cannot perform the requested comparison |

One concrete mismatch demonstrates why a CSS-only patch is forbidden: VASSAL GPID 160
(`US 2.A CCA`) has distinct 70×70 faces (`BTR S01 R01 C02.png` and
`BTR S01 R01 C02B.png`) with different printed strengths and movement allowances.
The current archetype instead creates one face with generator-designed values and never
models that orientation change.

## Corrected product contract

### Counter content

Every generated piece must select a counter template appropriate to its actual kind.

- Basic combat, reconnaissance, and combat-capable engineer counters show unit
  designation, echelon, unit symbol, formation affiliation, Combat Strength, Action
  Rating, Movement Allowance, mobility encoding, combat-category encoding, and RE when
  applicable.
- Artillery shows its artillery symbol plus Barrage Strength, Action Rating when
  applicable, Range, designation, echelon, and formation affiliation. Barrage Strength
  must not be mislabeled or stored as Combat Strength merely to reuse a renderer slot.
- HQ shows its HQ identity/symbol, echelon or command level, throw range, Movement
  Allowance, mobility encoding, and affiliation. A missing Combat Strength remains not
  applicable, not numeric zero.
- Transport shows transport type, point/capacity value, Movement Allowance, mobility,
  affiliation, and loaded/full state when that state exists.
- Supply shows current quantity using the supply counter grammar and a numeric quantity.
  It does not use the combat-unit template.
- Fields that do not apply are omitted. `0`, `?`, or a role abbreviation must not be
  used as a generic visual filler.

The shared design coordinate system is a square counter. Map scale may transform that
square, but it may not change the field order or aspect ratio. The implementation must
use original SVG/CSS primitives and project-owned symbols; VASSAL PNG files remain
outside runtime/build output.

### Face, mode, and state

- A mode-capable ground unit has explicit printed Combat and Move faces when the two
  orientations differ. Each face owns its own printed ratings and mobility class.
- `currentFaceId` selects the printed face. `mode` remains a separate rules state, as
  required by the existing Foundation boundary and OCS 5.2.
- Reserve, Strategic Move, DG, Exploitation, OOS, internal-stock, and loss indications
  are overlays or adjacent markers according to their rule meaning; they do not rewrite
  the printed unit face.
- Remaining steps select the matching step profile on the current face. The rendered
  strength/RE must change with that profile.
- Owner-only state is resolved before rendering. Enemy counters retain the existing
  projection/redaction contract and cannot recover hidden face, step, or status data by
  inspecting DOM or accessible text.

### Data boundary

The renderer must consume one presentation view model assembled from the immutable
`PieceDefinition`, current `ProjectedPiece`, and reviewed counter metadata. The safe
projection must carry the current face ID and applicable public resource/state values;
redacted projection must omit them. The renderer
must not infer gameplay semantics from a display name or parse opaque Definition IDs in
the SVG template.

The current definition model needs explicit, validated printed-counter metadata for at
least:

- counter template/kind;
- unit designation and formation affiliation label/color key;
- echelon/size;
- unit symbol and combat category;
- nationality/side presentation key;
- per-face printed values, including distinct Combat Strength, Barrage Strength, Action
  Rating, MA, throw/barrage range, RE, transport point value, and resource quantity as
  applicable;
- flags such as parenthesized defensive strength and non-rebuildable AR dot when the
  source calls for them.

This is an intentional breaking schema correction. There is no compatibility
requirement for saves, replays, or generated scenarios created before this change.
Decoders must reject the removed shape rather than silently synthesize placeholder
counter metadata. Newly generated save/replay/scenario artifacts must round-trip the new
shape exactly.

## Work packages and stop gates

### CF0 — Freeze the comparison corpus

1. Create a reviewed field-by-field worksheet for the 18 representative GPIDs and both
   applicable faces.
2. Annotate the rulebook page-4 templates: basic combat, artillery, HQ, transport,
   extender, aircraft, formation marker, and ship; mark only the currently generated
   ground/logistics subset in scope.
3. Record every undecoded or conflicting mark as a TODO containing missing behavior,
   player impact, and evidence needed to close it.

Exit evidence: the worksheet has no unrecorded ambiguity for the seven generated roles.

### CF1 — Correct the definition/catalog schema

1. Add the structured printed-counter metadata and validation rules described above.
2. Replace the single generated `front` face with the required Combat/Move faces and
   per-step profiles.
3. Stop describing generator-designed ratings as decoded VASSAL ratings. Each value is
   either source-reviewed with a locator or explicitly synthetic with a separate design
   authority.
4. Update canonical serialization, strict decoding, fixtures, and public exports for the
   new schema. Old artifacts may fail with a clear schema/version error.

Exit evidence: representative definitions can express every printed field without name
parsing, renderer-only constants, or overload of Combat Strength for another rating.

### CF2 — Build one counter presentation resolver

1. Resolve definition + projected runtime state into a typed `CounterViewModel`.
2. Provide dedicated basic-combat, artillery, HQ, engineer, transport, supply, and
   redacted templates.
3. Unit-test face/step/resource/status selection and verify absent fields remain absent.
4. Keep selection/focus/stack offsets outside the printed counter model.

Exit evidence: a deterministic representative plate covers Allied and Axis instances,
all generated roles, both faces where applicable, reduced steps, resource quantities,
and redacted counters.

### CF3 — Replace the integrated renderers

1. Replace the map's role/steps/mode rectangle in `src/ui/browser.ts` with the shared
   square counter renderer.
2. Render the same counter model in New Game OOB preview and stack inspection; do not
   maintain three independent interpretations.
3. Preserve keyboard activation, visible selection/focus, stack ordering, hit targets,
   and pan/zoom behavior without drawing selection over printed data.
4. Keep the counter readable through supported map zoom; if the map view cannot show all
   microtext, stack inspection must show the same counter at inspection size rather than
   replacing it with prose alone.

Exit evidence: the exact previewed generated unit identities and printed data can be
traced to the mounted map and stack inspector.

### CF4 — Integrate rules-visible state

1. Add a public rules/gameplay operation for printed-face orientation, or revise the
   existing action contract to carry it explicitly. Do not treat a `CHANGE_MODE` label
   as proof that `currentFaceId` changed.
2. Operate face changes, step loss, transport/resource changes, and each supported mode
   through public Gameplay actions.
3. Render applicable mode/status markers without changing the underlying printed face.
4. Verify hot-seat handoff and enemy stack projection disclose only rule-allowed data.
5. Save and replay the new-schema game and confirm the same visible counter state after
   reload/reproduction.

Exit evidence: screenshots before/after each state change plus revision/history evidence
from the same built application.

### CF5 — Product-operation acceptance

Run the built UI, beginning with the fixed NG-07 request from
`docs/quality/03-product-operation-verification-plan.md`.

1. In New Game, inspect both sides and locate at least one HQ, combat unit, artillery,
   reconnaissance unit, engineer, transport, and supply counter.
2. Compare each rendered template against its worksheet and the rulebook field grammar;
   record expected and observed fields and capture screenshots.
3. Start that same preview and trace every sampled counter to the mounted map/stack view.
4. Select and keyboard-activate the counters; verify focus/selection does not obscure
   printed identity or ratings.
5. Complete at least one whole turn with a unit action, a legal face/mode transition,
   required pending decisions, and hot-seat handoffs. Exercise a step/resource state in
   a naturally reachable scenario; if it cannot be reached, the row is `BLOCKED`, not
   inferred from tests.
6. Repeat counter inspection at 1920×1080 and 1680×1050, including map zoom and a stack of
   at least three counters. Record latency, clipping, overlaps, console errors, and all
   usability defects.

Only after those operations pass may automated typecheck, unit/integration tests,
build, smoke, and screenshot comparison be recorded as regression evidence. U4 counter
fidelity remains `IN PROGRESS` while any required template uses a placeholder, guessed
field, generic fallback, or unreachable acceptance state.

## Explicitly deferred improvement backlog

### User-directed screen-space LOD (in scope, IN PROGRESS)

The user explicitly exempts counter artwork from the general 13px text floor and
requests simplified rendering when zoomed out. Ordinary interface text retains its
13px floor. Initial thresholds use the actual on-screen counter width: at least
58 CSS pixels shows full detail, 38–57 shows the primary ratings and symbol, below
38 shows the symbol. The map camera owns LOD; preview and selected-stack counters
remain full detail. Resizing and zooming must both recompute the level.

TODO: verify all three levels in the integrated browser at 1920×1080 and
1680×1050, including a three-unit stack, keyboard selection, state indicators,
and return to full detail without changing game state. Until recorded screenshots
and operated selection prove legibility and no clipping/overlap, these thresholds
are provisional and counter visual acceptance remains IN PROGRESS.

The following are not part of the fidelity-first gate and must not delay or substitute
for it:

- decorative texture, aging, shadows, or more expressive national art;
- animated flips or stack fan-out;
- hover magnifiers, compare mode, tooltip teaching, or a counter encyclopedia;
- alternative density modes and user-selected counter themes;
- extra mobile conveniences beyond keeping the accepted flow operable;
- air, naval, facility, and marker families not emitted by the current generator.

If any deferred item is implemented as a reduced placeholder, its TODO must state the
missing behavior, player impact, and acceptance evidence required by `AGENTS.md`.
