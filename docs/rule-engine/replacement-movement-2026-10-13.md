# Movable Pax / Eq replacements — 2026-10-13

Status: IN PROGRESS.

User request: make the replacement counters movable as OCS replacement units.

Acceptance steps (recorded before implementation):

1. Generate visibly different Map/OOB configurations in New Game, preview each, and start the same previewed package.
2. Place individual Pax and Eq replacements. Select Pax in the actual UI, move it to a different hex, and observe its new location and remaining MP.
3. Select Eq, observe the fuel requirement, pay fuel, then move it through the actual UI. Pax has 5 Leg MP; Eq has 10 Truck MP, based on the inspected BTR counter images.
4. Exercise legal modes (Move, Reserve, Strat) and reject Combat Mode. Replacements count as 1/4 RE each, are Attack-Capable, can take combat/barrage losses, and use normal trace/combat supply and fuel rules.
5. Move replacements to a reduced unit within two hexes of a Combat-oriented HQ; in a later Reinforcement Phase spend them to restore steps. Also rebuild an eliminated unit with replacements and verify spending.
6. Complete the game turn through legal actions, pending decisions and hot-seat handoffs. Save and load after movement/rebuilding; replay must preserve positions, quantities and expenditure.

Rules authority: OCS 4.3 §13.5 and the product operation plan §I. Original references inspected read-only: `/home/cashlin/Beyond the Rhine_1_27_0/images/US-Repl-Pax.png`, `US-Repl-EQ.png`, and `German Pax Replacement.png`. They print 0 strength, AR 0, Pax 5 Leg MP and Eq 10 Truck MP. No raster assets are copied.

The full replacements gate remains **IN PROGRESS**: fixed allotments, the generic Rebuild Table, natural losses/rebuilding from a fresh New Game, and upgrading historical face-less saves remain outside the verified boundaries below. No claim is made that all OCS replacement behavior is complete.

Implementation:

- Keep the REPLACEMENT family and reuse ground-unit rules through `isGroundUnitDefinition`. New definitions have a Move face, one step, 0 strength/AR, 1/4 RE, Pax 5 Leg MP and Eq 10 Truck MP.
- Each allotted replacement arrives as its own unit. Placement/shipping never merges modern replacements, so fuel, mode, movement and losses remain independent.
- Ground rebuilding totals and spends separate Move Mode replacements in the selected hex. Aircraft rebuilding likewise totals Eq in one hex, so several units can still pay for a single rebuild action.
- Reject Combat Mode in both mode actions and snapshot validation. Supply, attrition, combat/barrage losses, ZOC blocking/negation for ordinary movement/supply, and rail/sea eligibility use shared rules.
- Correct 4.5a K: replacement rebuilding cannot negate an enemy ZOC. Preserve the old calculation only for historical face-less scenarios so accepted old actions still replay under their recorded model.
- Pax now prints a plain white 5; Eq keeps the red 10 Truck MP box. Both show mode/OOS markers, actual modes and movement/fuel state in the UI. The Rebuild help specifies Move Mode.

Observed UI evidence: [run6/log.md](../quality/evidence/replacement-movement-2026-10-13/run6/log.md), [results.json](../quality/evidence/replacement-movement-2026-10-13/run6/results.json), and the downloaded [save](../quality/evidence/replacement-movement-2026-10-13/run6/moved-and-rebuilt-save.json).

| Boundary exercised | Observation |
|---|---|
| Fresh New Game | Preview/start 18×12 / Standard / 3 divisions, 1 armored per side (43 units), then visibly different 32×24 / Compact / 6 divisions, 2 armored (57 units). Both start using the visible Start-previewed-game control. |
| Fresh game Turn 2 | Pax 1406 → 1306, 5 → 4.5 MP; Reserve, Strat and Move operated; no Combat option. Eq initially blocked for fuel, pays 1T, then 1406 → 1306, 10 → 9.5 MP. Whole Game Turns 1 and 2 finish, including decisions and required handoffs. Screenshots 03–09 inspected, including printed Pax 5. |
| Loaded training position | Preparation is explicit in `make-movement-position.mjs`: move existing units into a controlled training position, reduce 79.VG to one step, and add two local trace sources so the HQ/attackers can survive while waiting for arrivals. This is not a natural-loss New Game claim. After loading, every operation is through actual UI controls. |
| Actual UI combat | Allied attack eliminates the Axis armor unit at 2512, with supply, defending-terrain and advance decisions/handoffs. |
| Moving to rebuild | Turn 2 Pax/Eq placed at 2612, moved to 2712; Eq paid 1T. Turn 3 new arrivals placed back at 2612. The rebuild button for **2712** spends the moved units: 79.VG regains one step and the eliminated armor returns there. Actual UI Log and downloaded snapshot agree: 79.VG now has 2 steps, both `repl-arrival:player:axis:2` and `:2:pax` are eliminated with quantity 0. Screenshots 18/19 inspected. |
| Complete turn / save-load | Game Turn 3 finishes; at Turn 4 First Player Phase the save is downloaded and loaded through Menu. Action replay succeeds at revision 41, with the same phase, decision and expenditure. No browser console/page errors. |

Issues and evidence corrections:

- Initial harness run incorrectly read the Map's reachable Map entries as hex strings. Corrected to keys; root evidence retained.
- run2 expected Menu to remain open after loading, but the product closes it. Corrected the harness; source behavior was unchanged.
- run3's training HQ lost supply; the fixture's earlier placement helper also depended on an HQ deployment that now sits at the map edge. Training position now uses a fixed interior HQ and documented local trace sources. This does not relax natural-New-Game acceptance.
- run4 chose the first ordinary arrival's entry as the replacement origin. Corrected the harness to choose an adjacent HQ hex only when that arrival offers it.
- **run5's apparent rebuild PASS was disproved by the saved action/snapshot**: the first Rebuild card was for new arrivals at 2612, not the moved counters at 2712. The row was immediately reopened as FAIL; the original notice, log and save remain, and `run5/review-correction.md` plus `previousStatus` in results.json preserve the correction. run6 targets 2712 explicitly and corroborates recovered steps and spending; no status relies only on the generic notice.
- No new UI dead end observed in the corrected run. The initial actual small-map movement is visible; the large-map rebuilding result is visible in the Log and corroborated by the saved state.

Verification:

- Replacement/air-rebuild/gameplay focused tests: 54 passed, covering movement through public actions, fuel expenditure, modes/reserve release, stacking, combat/barrage losses, trace/attrition, aggregate rebuilding and historical arrival/merge serialization.
- Final full suite: 579 passed, 8 skipped, 2 failed. The air integration assertion expects REFIT_AIRCRAFT but the scenario never supplies that action. **The identical assertion fails on unchanged HEAD**, independently tested from an archived checkout of `51b2fcd05defe12f66ed2f0c17f1e0c4da08c128` in `/tmp/ocs-repl-baseline`; no air-test expectations were weakened.
- The other full-suite failure was a 5-second deployment-plan timeout while Chromium and the full suite ran concurrently. Isolated recheck passed all 5 deployment-plan tests. The full-suite failure remains recorded, not relabeled as a PASS.
- Final typecheck, build and dist smoke all passed (exit 0). `git diff --check` passed. Full-suite and isolated deployment logs are retained under `docs/quality/evidence/replacement-movement-2026-10-13/`.

Remaining technical debt:

- **TODO(repl-legacy-unit-migration)**: old saves whose REPLACEMENT definitions have no faces keep their historical quantity-counter rules for replay compatibility. User-visible impact: those counters remain immobile; a new game is required for movable replacements. Close with an explicit save migration that preserves/verifies historical actions before converting quantities to independent units, then an actual UI load, movement, rebuild and save/replay run on a pre-change save.
- **TODO(repl-natural-loss-ui)** remains open: the rebuild acceptance uses a loaded training position. Close only with an actual fresh New Game, natural ground combat loss, movement of replacements to the reduced/eliminated unit, rebuilding and completion of that turn.
- Existing **TODO(repl-variable-table)** and **TODO(repl-rebuild-table)** remain unchanged. Their missing behavior, impact and closing evidence are in the 2026-10-04 report.
- The new combat-unit behavior is covered by rule actions/tests; visual UI acceptance of a replacement itself taking combat/barrage/attrition losses and overstack elimination is **UNVERIFIED**, and must not be inferred from those tests.
