# Rule coverage and tables

## Scope

Which OCS v4.3 series rules the engine enforces, where each one's behavior and gaps are recorded, which charts it uses,
and how conformance is checked. The engine's interface is in [engine-contract.md](engine-contract.md).

## Current behavior

### The manifest is the source of truth

`RULE_FEATURE_MANIFEST` in `src/rules/manifest.ts` has one row per rule feature: id, rule citations, status, owning
module, public actions and queries, tests, and a note that states the enforced behavior. This document does not repeat
those notes; read the manifest for any rule's current behavior.

| Status | Meaning |
|---|---|
| `IMPLEMENTED` | Every cited rule is enforced and covered by the listed tests |
| `PARTIAL` | Usable; every known gap is listed after `GAP:` in the note |
| `DEFERRED` | Not available |
| `GAME_SPECIFIC` | Belongs to a particular game's data, not the series rules |
| `NOT_APPLICABLE` | Not used by this product |

`requireImplementedRuleFeature` accepts `IMPLEMENTED` and `PARTIAL` rows and returns `UNSUPPORTED_RULE_FEATURE` for every
other row or an unknown id. The engine never approximates a feature that is not available.

Feature areas and their manifest rows:

| Area | Manifest rows |
|---|---|
| Turn sequence and weather | `sequence.ground-turn`, `weather` |
| Modes, stacking, ZOC | `mode.transition`, `stacking.ground`, `zoc.purpose` |
| Ground movement, engineers | `movement.ground`, `engineering.bridging`, `breakdowns`, `hedgehogs` |
| Supply and transport | `supply.trace-and-draw`, `supply.fuel`, `transport.trucks` |
| Rail and sea | `supply.rail-trace`, `movement.rail-cap`, `supply.rail-front-control`, `movement.sea` |
| Combat | `combat.ground`, `overrun.ground`, `barrage.artillery` |
| Reinforcements and replacements | `lifecycle.ground`, `replacements-rebuilds` ([replacements.md](replacements.md)) |
| Air power | `air.bases-and-refit`, `air.missions`, `air.transport-and-drop`, `air.replacements-and-reinforcements` ([air-power.md](air-power.md)) |
| Not available | `naval-shipping` (18.0), `optional-rules` (21.x) |
| Victory | `victory.game-table` (a generic turn and objective adapter; scenario VP tables are data) |

### Charts and tables

`RULE_TABLE_PROVENANCE` records each table's source image, locator, SHA-256 and review status. Series charts have priority
100 and game-specific data 200.

- Series charts (OCS v4.3): Combat, Surprise and Combat Supply, Attrition, Capture and Dump Blowing, Barrage, Barrage vs
  Facility with Port Damage, and the air tables. Transcribed from the Beyond the Rhine VASSAL module 1.27.0 chart images in
  `docs/rules/ocs-4.3-charts.md` and `docs/rules/ocs-4.3-charts-full.md`; code in `src/rules/tables/ocs-4.3.ts`.
- Beyond the Rhine data: Weather Table, German Supply Table, Terrain Effects on Combat and on Movement
  (`docs/rules/btr-charts-full.md`, `docs/rules/btr-movement-tec.md`; code in `src/game-flow/combat-tec.ts` and
  `src/game-flow/movement-tec.ts`).
- Generator-defined, not printed: each side's Variable Replacement Table and Rebuild Table ([replacements.md](replacements.md)).

### Conformance checks

- `tests/rules/ocs-conformance.test.ts` and `tests/rules/ocs-logistics.test.ts` test the rules clause by clause; the other
  `tests/rules/` files cover one feature each (air, rail, ports, hedgehogs, bridging, breakdowns, replacements).
- `scripts/audit/rules-conformance-probe.mjs` (run after `npm run build`) builds a minimal state per row on the generated
  fixture scenario and compares the engine with the cited rule: 40 rows, all conforming. It refuses to run if a fixture unit
  it uses is missing.
- `tests/rules/manifest.test.ts` checks that unavailable and unknown features are refused.

### Gate status

The Rule Engine gate (R10 in `docs/roadmap/02-rule-engine-wbs.md`) is **IN PROGRESS**: several rows are `PARTIAL`, two
are `DEFERRED`, and the manifest does not yet list every clause of §1–21 (TODO-R1).

## Decisions

- **Passing tests do not prove the rules.** The 2026-09-30 audit found 28 of 30 probed rules violated while every test
  passed and the manifest said `IMPLEMENTED`; the original MVP claim was withdrawn. The rule layer was rebuilt clause by
  clause with conformance tests, and the manifest gained `PARTIAL` with explicit `GAP:` lists. A row becomes `IMPLEMENTED`
  only with citations, an owner, a public action or query, tests that pass and fail on the rule, and integration coverage.
- **Printed charts, not invented ones.** The early two-column combat and barrage tables were removed in favor of the
  transcribed v4.3 charts.
- **Choices that can only hurt the chooser are applied for them.** The defender's terrain choice for each attacking stack
  (9.4b) and the barrage terrain shift (10.0a) always take the option worst for the attacker, without asking.
- **One supply counter holds at most its printed capacity; the rest lies as a second dump.** Supply of one kind in a Hex
  is one dump (12.1), but the piece definition's `resource.capacity` is a hard state invariant. Unloading, Rail Cap and
  Sea Cap deliveries, air drops and arriving reinforcement dumps (`applyUnload`, `mergeSupplyAt` in
  `src/rules/supply/transport.ts`) fill the dump up to the capacity and leave the excess as a further dump in the Hex.
  Rejected alternative: refusing the move when it would overfill the dump, which blocks legal supply deliveries and was
  the way a long game could fail with `STATE_INVARIANT_VIOLATION` (19 of 36 bot games before the fix; 0 of 144 after).
- **Game-specific rules left out** (user decision): nationality rules for Hip Shoots and the Air
  Transport Success Table modifiers are not implemented; the manifest notes say where this shows.

## Known gaps

- `PARTIAL` rows: their `GAP:` notes in `src/rules/manifest.ts`.
- TODO-R1 (every §1–21 clause registered in the manifest), TODO-R11 (fractional MA tests) and TODO-R14:
  `docs/study/09-rules-vs-plan-gap-analysis.md` §4.
- `air-audit-probe` and the replacement TODOs: `docs/quality/05-todo-inventory.md`.

## Verification

`npm test` (the `tests/rules/` files above) and `node scripts/audit/rules-conformance-probe.mjs` after `npm run build`.
