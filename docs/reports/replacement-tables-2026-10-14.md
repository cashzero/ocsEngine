# Variable Replacement Table, Rebuild Table and Unit Consolidation — 2026-10-14

Status: **IN PROGRESS** (see §6). Browser rows REPL-09 to REPL-12 PASS (run3), part of them on a training position.

## 1. User request

> 實作rebuild unit功能

Rebuilding ground units with Pax/Eq (13.5a-e) already existed (#57), and main's 671cafc had since made Pax/Eq movable
combat units. Asked which open part to do, the user chose all four remaining items of
`docs/reports/replacements-2026-10-04.md` §6: Repls as combat units, a real Rebuild Table, a rolled Variable Replacement
Table and Unit Consolidation (13.9). Repls as combat units had meanwhile landed on main (671cafc, report
`replacement-movement-2026-10-13.md`), so this work keeps that design and adds the other three.

## 2. Acceptance steps (recorded before the browser run)

1. From New Game, play to the Game Turn 2 Reinforcement Phase. The Log shows the side's Variable Replacement Table roll and
   what it brought; exactly that many Pax and Eq arrive as separate units and can be placed.
2. In that phase the Rebuild tab shows the side's Rebuild Table (rows and costs, 13.5d pair row) and its Variable
   Replacement Table, even with nothing to rebuild.
3. On a position with dead and reduced units (a loaded training position, prepared by a documented script; every step after
   loading through visible controls): two reduced identical infantry divisions in one hex are offered **Combine**; doing it
   moves the steps to one division and the other to the Dead Pile, reported in the Log (13.9-1).
4. A unit on the map is offered **Exchange** for an identical unit of another division in the Dead Pile; doing it puts the
   Dead Pile unit in its place with the same mode and steps (13.9-2), reported in the Log.
5. The Rebuild tab prices units by the Rebuild Table: two dead garrisons (13.5d row) cost 1 Pax together; a dead HQ costs
   1 Pax and 1 Eq, and a selection the hex cannot pay is refused with the reason; a paid rebuild spends the Repls.
6. Finish that whole Game Turn through every decision and hot-seat handoff, then save and load: same turn, phase and units,
   no console error.

## 3. Design decisions (defaults, no user decision needed)

| Item | Decision | Reason |
|---|---|---|
| Where the tables live | `RuleConfiguration.replacementArrivals` and `rebuildTables`, one per player, optional | Like the Supply Table; a save without them decodes unchanged and keeps the old fixed allotment and per-counter costs, so older saves replay identically and no save version bump is needed |
| Variable Replacement Table | 2d6, one row per total, per scale; averages within 0.1 of the old allotment (Compact 1 Pax/1 Eq, Standard 2/1, Large 3/2) | Same expected supply of Repls as before, now with variation; the user chose a per-turn Eq allotment on 2026-10-03, so the averages are kept |
| Rebuild Table rows | HQ 1 Pax + 1 Eq a step; Armor/Mech (3.2a), anti-tank, assault guns 1 Eq; artillery 1 Eq; infantry and other 1 Pax; one-step infantry/airborne/engineer of ≤ 1/2 RE two for 1 Pax (13.5d) | Generated games print no table; costs stay close to the old rule except HQs (now Pax + Eq) and small battalions (13.5d now applies: garrisons, paratroop battalions) |
| Not on the table | No-rebuild dot, Breakdowns, Repls, Transport Points | 13.5b-c; trucks are 13.5e |
| Consolidated unit | Goes to the Dead Pile (can be rebuilt later) | 13.9 says "remove"; the Dead Pile keeps it rebuildable |
| Consolidation never stops a step | `CONSOLIDATE_UNITS` is non-stopping, like `COMBINE_AIRCRAFT` | An exchange is open whenever an identical unit of another division is dead, which would otherwise stop every Reinforcement Phase |
| Transport Points | Never consolidated | Generated games have no Organic Trucks (13.9-2/3 truck cases) |
| Exchange (13.9-2/3) | Kept exactly as the series rule: the Dead Pile counter takes the place of the identical counter on the map, no distance limit | User decision 2026-10-14, after weighing removal and a direct "reassign formation" house rule (a unit changing division only into a same-type vacancy, the dead unit taking its old place): the result is the same as swapping counters, so the rule is kept as printed. Its use is reorganising divisions: which division is whole and which one carries the loss to rebuild. The reassign draft is not in the repository |

## 4. Implementation

| Area | Files |
|---|---|
| Generator tables | `src/generation/oob/replacements.ts` (`variableReplacementTable`, `REBUILD_TABLE_ROWS`, `buildRebuildTable`), `src/game-flow/configuration.ts` |
| Configuration, action, events | `src/rules/kernel/model.ts` (`ReplacementArrivalConfiguration`, `RebuildTableConfiguration`, `CONSOLIDATE_UNITS`, `REPLACEMENT_TABLE_ROLLED`, `UNITS_CONSOLIDATED`), `snapshot.ts`, `state.ts` (`INVALID_REPLACEMENT_TABLE`, `INVALID_REBUILD_TABLE`) |
| Roll and pricing | `src/rules/replacement/replacement.ts` (`arriveReplacements` rolls; `rebuildPriceOf`, `priceRebuild`, `allocateRebuild`) |
| Consolidation | `src/rules/replacement/consolidation.ts`; wired in `validate.ts`, `reducer.ts`, `candidates.ts`, `persistence.ts` |
| Projection and UI | `projection.ts` (prices, both tables, consolidations), `controller.ts`, `command-deck.ts` (Rebuild tab), `narrative.ts`, `presenter.ts`, `browser.ts` |
| Bot | `heuristic.ts` rebuild allocator uses table prices and 13.5d pairs; `random-legal.ts` weight |

Tests: `tests/rules/ocs-replacement-tables.test.ts` (20), plus `ocs-replacements.test.ts` adjusted (the arrival test now
pins the fixed-allotment path it was written for; a projection assertion reads `price`) and `tests/ui/command-deck.test.ts`
(the Reinforcement Phase now has a Rebuild tab, for the tables). Final `npm run check`: typecheck, 672 tests passed / 8
skipped, build and dist smoke, exit 0. One earlier full run timed out `tests/ai/movement-trace-gain.test.ts` (67 s against
its 60 s limit under full-suite load); alone it passes in 22 s, and it passed in both other full runs.

## 5. Browser acceptance

Chromium (Playwright, 1920×1080) on the built app, visible controls only: `scripts/replacement-acceptance/run-tables.mjs`.
The training position is made by `scripts/replacement-acceptance/make-tables-position.mjs` (default New Game, seeds
7101-7104, Allied units arranged as its header says, set to the Allied Aircraft Refit Phase of Game Turn 2). Evidence:
`docs/quality/evidence/replacement-tables-2026-10-14/` (run1-run3; run3 is the final run, every row PASS, 0 console errors).

| Row | Boundary | Observation (run3) |
|---|---|---|
| REPL-09 | Fresh New Game 18×12 / Standard / 3 div, 1 armored (43 units), Turn 2 Allied Reinforcement | Log: "Variable Replacement Table roll 6: 2 Pax and 1 Eq."; Arrivals list exactly 2 Personnel and 1 Equipment rows. The loaded position also rolls on entering its Reinforcement Phase ("roll 8: 1 Pax and 1 Eq") |
| REPL-10 | Same fresh game, nothing to rebuild | Rebuild tab present; Rebuild Table (HQ 1 Pax and 1 Eq a step … small infantry 1 Pax for two units) and the 2d6 Variable Replacement Table shown (screenshot 04) |
| REPL-11 | Training position (32×24 / Compact / 6 div, 2 armored New Game started first, then the position loaded through Menu) | Combine: "80.Inf joined 84.Inf at 1119: 1 step regained; 80.Inf went to the Dead Pile." Exchange: "Div Arty I / 4.A took the place of Div Arty I / 7.A at 1019" |
| REPL-10 | Same | Two dead garrisons selected alone: "this rebuild costs 1 Pax and 0 Eq"; adding the dead HQ: "costs 2 Pax and 1 Eq", "This rebuild takes 2 Pax; the hex holds 1." and the button disabled; without the HQ both garrisons return for 1 Pax |
| REPL-12 | Both games | The fresh game finishes Game Turn 2; the position finishes Game Turn 2 and is saved and loaded at Turn 3 First Player Phase; the downloaded snapshot holds 84.Inf at 3 steps, 80.Inf and Div Arty 7.A in the Dead Pile, Div Arty 4.A at 1019, both garrisons on the map and the Pax spent |

Issues observed during the runs:

| Issue | Handling |
|---|---|
| run1 stopped in the Reinforcement Phase: the harness read the Log tab and then looked for arrival rows, which exist only while the Arrivals tab is open, so nothing was placed and End stayed disabled | Harness bug, not a product defect: run2 opens Arrivals first. run1 kept as evidence |
| run2 screenshot 06: the Unit Consolidation panel was below two long rebuild cards, out of view, while the default rebuild already spent a Pax on a step a free Combine would restore | **Fixed**: consolidation comes first in the Rebuild tab (run3 screenshot 06) |
| run2 screenshot 04: the Variable Replacement Table caption wrapped word by word in a narrow column | **Fixed**: the tables span the panel with left captions (run3 screenshot 04) |
| One Dead Pile unit appears in an Exchange offer for every identical unit on the map (three offers for Div Arty 4.A in run3) | Not blocking; recorded as TODO(consolidation-offer-list) |

## 6. Remaining gaps (TODO; not complete)

- **TODO(repl-tables-generated)**: both tables are generator-defined, not transcribed from a printed game. Impact: costs and
  arrival odds are this generator's, not BTR's. Close with a transcribed BTR Variable Replacement Table and Rebuild Table and
  a source record per row.
- **TODO(consolidation-bot)**: the heuristic bot never consolidates. Impact: bot sides keep two reduced identical divisions
  apart. Close with a bot step that combines them and a bot-game test showing it.
- **TODO(consolidation-offer-list)**: every identical pair is a separate Exchange offer, so the list grows with dead units
  × identical units on the map. Impact: a long list late in a big game. Close with offers grouped per Dead Pile unit (choose
  which unit it replaces) and a browser run with several dead units.
- **TODO(repl-natural-loss-ui)**: Consolidation and table pricing were exercised on a loaded training position, not after
  losses from ordinary play in a fresh New Game (as for the rebuild rows of 2026-10-04 and 2026-10-13). Close with a fresh New
  Game in which natural losses lead to a Combine or a table-priced rebuild, and that turn completed.
- **TODO(repl-legacy-unit-migration)** and **TODO(pax-counter-art)** stay open as recorded in
  `replacement-movement-2026-10-13.md` and `replacements-2026-10-04.md`.

The replacements gate therefore stays **IN PROGRESS**. Closed with UI evidence in this report: TODO(repl-variable-table)
(REPL-09), TODO(repl-rebuild-table) (REPL-10, on the training position for pricing), Unit Consolidation 13.9-1/2 (REPL-11, on
the training position); 13.9-3 (an independent unit joining a division) is covered by rule tests only.
