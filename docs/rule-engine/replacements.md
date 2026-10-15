# Replacements, rebuilds and consolidation

## Scope

Pax and Eq replacements, rebuilding ground units and trucks (13.5a-e), the generated replacement tables, and Unit
Consolidation (13.9). The rule behavior and gaps are the note of the manifest row `replacements-rebuilds`
(`src/rules/manifest.ts`); aircraft rebuilding (13.5f) is in [air-power.md](air-power.md). Code: `src/rules/replacement/`,
generator `src/generation/oob/replacements.ts`.

## Current behavior

### Arrival

- Every generated game gives each side a **Variable Replacement Table** (2d6, one row per total), built so its average is
  Compact 1 Pax / 1 Eq, Standard 2 / 1, Large 3 / 2 a turn. It is rolled in each friendly Reinforcement Phase and the roll
  and result are in that player's Log.
- Each Repl arrives as its own one-step unit, placed at an entry hex or within 2 hexes of a friendly HQ.

### Repls are combat units

- Pax: 5 Leg MP; Eq: 10 Truck MP; both 0 strength, AR 0, 1/4 RE, Attack-Capable (BtR counters).
- They move, use Move, Reserve and Strat modes (never Combat Mode), need fuel like other Truck units, take combat, barrage
  and attrition losses, count for stacking and use normal trace supply. They cannot negate an enemy ZOC for rebuilding
  (4.5a K).

### Rebuilding (`REBUILD_UNITS`)

- In the Reinforcement Phase, Repls in one hex within 2 hexes of a friendly HQ in Combat Mode (or DG oriented to Combat),
  not in an un-negated enemy ZOC, are spent together.
- Any number of steps (13.5b). A Dead Pile unit returns in the Repls' hex in a voluntary mode the player picks, with supply,
  internal-stock, involuntary-mode and Breakout markers cleared; a reduced unit must be in the Repls' hex and keeps its mode.
- Cost comes from the side's **Rebuild Table**:

| Row | Cost per step |
|---|---|
| HQ | 1 Pax and 1 Eq |
| Armor and Mech units (3.2a), anti-tank and assault guns | 1 Eq |
| Artillery | 1 Eq |
| Infantry and other units | 1 Pax |
| Infantry, airborne and engineer battalions of 1/2 RE or less (13.5d) | 1 Pax for two units |

  Units with the no-rebuild dot, Breakdowns, Repls and Transport Points are not on the table (13.5b-c).
- **Trucks (13.5e)**: 1 Eq rebuilds one Transport Point as a new truck in the Eq's hex. `replacements.lostTrucks` records
  the points each side lost by capture or displacement, so a side never gets back more than it lost. Captures are reported
  to both players (`TRANSPORT_CAPTURED`).

### Unit Consolidation (13.9)

- **Combine** (Rebuild tab): two reduced identical units in one hex become one; the other goes to the Dead Pile and can be
  rebuilt later.
- **Exchange** (the selected unit's Unit tab): a Dead Pile counter of another division takes the place of an identical
  counter on the map, with the same mode and steps, at any distance.
- An independent unit joining a division (13.9-3) is covered by rule tests.
- Consolidation never stops a step: it is optional and always available while an identical unit is dead.

### In the UI

The Rebuild tab shows Combine first, then one card per Repl hex (units, steps, placement mode for Dead Pile units, truck
points, cost and the reason a selection cannot be paid), and both tables even when nothing can be rebuilt. Counters print
"Repl PAX" and "Repl EQ".

### Saves

Both tables live in `RuleConfiguration` (`replacementArrivals`, `rebuildTables`), one per player and optional. A save
without them keeps the old fixed allotment and per-counter costs, so older games replay unchanged. Saves whose
REPLACEMENT definitions have no faces keep the old merged, immobile counters for the same reason.

## Decisions

- **Pax and Eq are built into every game** (user decision 2026-10-04): the earlier Air support option was removed.
- **Repls as movable units** (user request 2026-10-13), following the BtR counters.
- **Tables are generated, not printed**: generated games have no printed tables. The Variable Replacement Table keeps the
  earlier fixed allotment as its average (the user chose a per-turn Eq allotment on 2026-10-03). Rebuild costs follow the
  series rules' pattern (Eq for Armor/Mech, Pax for others); HQs cost Pax and Eq and small battalions use 13.5d.
- **Exchange kept as the series rule** (user decision 2026-10-14): after weighing removing it or a "reassign formation"
  house rule, the printed rule was kept. Its use is reorganising which division is whole and which carries the loss. The
  user also chose to start Exchange from the selected unit rather than from the Dead Pile.
- **Generated games have no Organic Trucks**, so the truck cases of 13.9-2/3 never arise.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `repl-tables-generated`, `repl-legacy-unit-migration`, `repl-natural-loss-ui`,
`consolidation-bot`, `pax-counter-art`. A Repl taking combat, barrage or attrition losses, and overstack elimination, are
covered by rule tests but not yet seen in the browser.

## Verification

- Rule tests: `tests/rules/ocs-replacements.test.ts`, `tests/rules/ocs-replacement-tables.test.ts`,
  `tests/rules/ocs-air-support.test.ts`.
- Browser rows REPL-01 to REPL-12 in `docs/quality/03-product-operation-verification-plan.md`; scripts in
  `scripts/replacement-acceptance/`; run records in `docs/quality/evidence/replacements-2026-10-04/`,
  `replacement-movement-2026-10-13/` and `replacement-tables-2026-10-14/`.
