# Phase A acceptance record (SUP-A rows), 2026-10-02

Build under test: commit `a037f9b` plus the three fixes made during this run (see "Defects found"), built with `npm run build` and served with
`node scripts/serve-ui.mjs` at `http://127.0.0.1:4173`. Browser: the built-in browser pane, viewport emulated at 1680×1050.
Default New Game (`32×24 / COMPACT / 2 per side / 8 turns`, seeds 206569473/74/75/76), Allied seat, Turn 1 Movement.

## How the evidence was gathered

- Every operation below was a real click (or a real field edit) on a visible control, located with the accessibility tree. JavaScript was used
  only to **read** the page (text, classes, counts) and to time interactions. The "trace" columns are those reads.
- **Elapsed** is measured from `pointerdown` to the last DOM mutation of the first burst (a 500 ms quiet gap ends the burst), with a
  `MutationObserver` installed in the page. An earlier version of the timer overcounted (it reported 3883 ms for a roster pick that
  settled in 83 ms); only the settled-burst figures are used.
- **Revision** is the count of accepted actions. Two points were read from the Session dialog and agree with that count
  (R3 at the start of Movement, R10 after the fuel payment).
- **Console errors:** none in any run (`read_console_messages` with errors only returned nothing).
- Screenshots in this folder are the only ones the browser could draw during the run; the pane often timed out on screenshots, so the other
  rows use the text trace. The screenshots are JPEGs exactly as captured.

| Screenshot | Shows |
|---|---|
| `A01-A05-after-partial-load.jpg` | The truck area after loading 3T: "carrying 3/20T · 38 MP left", the mid-move warning, the dump row (1T left), the unload row, the split row |
| `A03-A05-full-truck-unload-blocked.jpg` | A 1-point truck carrying 4/4T (full gauge) with Unload greyed out and the reason "…13.2f" |
| `A02-A05-stack-list-carries-and-dump.jpg` | The stack list of hex 0313: "US 255 QM Truck Co · carries 2T" and "Supply dump · 2T" |
| `A02-rerun-dump-marker.jpg` | Re-run: truck at 0207 after "Unloaded 2T", dump row "Dump here · 2T (0.5 SP)" with Load blocked by 12.2a, dump drawn as a corner marker |
| `A09-combat-supply-in-ledger.jpg` | Ledger after a real combat: "Combat or barrage supply …T from the dump at …" |

## Results

Status vocabulary is doc 03's. A row passes only if its expectation, as written in doc 03 §G, was observed.

| Row | Status | Input | Observed | Elapsed | Revision / phase |
|---|---|---|---|---|---|
| SUP-A01 | **PASS** | Truck at 0316 (4T dump). Set Tokens to 3, press Load | Preview read "1–4T · costs 5 MP, 38 MP left afterwards"; after Load: "carrying 3/20T · 38 MP left" (43 → 38 = the preview), dump row "1T (0.25 SP)", status "Loaded 3T onto the truck at 0316." | Load 517 ms | R5, T1 Movement |
| SUP-A02 | **FAIL, then PASS on re-run (see "Re-run after user feedback")** | Truck (1 point, 4/4T) moved to 0313 (friendly combat units), Tokens 2, Unload | "Unloaded 2T at 0313.", truck "carrying 2/4T", dump row "Dump here · 2T", stack list shows "Supply dump · 2T". **But the map draws only the top three counters of the hex; the new dump is the "+1" badge, not a counter**, so "the map and the selection card agree" is not met | Unload 526 ms | R9, T1 Movement |
| SUP-A03 | **PASS** | 1-point truck carrying 4T at 0316, no dump left and no combat unit | Unload row disabled with "SP can be unloaded only with a friendly combat unit or an existing unloaded dump. 13.2f" (screenshot) | — | R8 |
| SUP-A04 | **PASS** | After unloading 2T at 0313, look at the Load row for that dump | Load disabled with "SP unloaded this phase cannot be loaded again this phase. 12.2a" | — | R9 |
| SUP-A05 | **PASS** | Empty, part-loaded and full trucks | Counters: `load-empty` (5 pts), `load-part` with "3T", `load-full` with "4T"; stack list "carries 2T" (screenshot) | — | R5–R9 |
| SUP-A06 | **PASS** | Select the dump at 0313 from the stack list, press the truck under "Carry with a truck" | Dump card "Supply dump 0313 · 2T (0.5 SP)" with "Carry with a truck" listing the truck; pressing it opens the same truck area | pick 74 ms, open 82 ms | R9 |
| SUP-A07 | **PASS** | Truck loaded (3T, 38 MP left), then select 501 Abn Regt and preview a move to 0412 | Popup: "This ends the move of US 255 QM Truck Co: its 38 MP left and 3T aboard cannot be used again this phase 6.1g", button "Confirm anyway"; Confirm was not pressed (Cancel) | preview 231 ms | R5 |
| SUP-A08 | **PASS** (after fix, see D1) | Truck moved to 0316, loaded 3T, split off 4 points, press "Combine the trucks…" | Combined: "5 truck points · carrying 3/20T · 38 MP left" (load kept, MP unchanged), All units 16 → 15. Counter-mix limit (13.2c) is covered by the headless tests only | Combine 519 ms | R7 (second run) |
| SUP-A09 | **BLOCKED, then PASS on re-run** | Fuel from the 12T dump at 0113 for Alanis TF | Ledger: "Supply this step · 1T paid · 2 entries … Fuel 1T for Alanis TF … (this unit) from the dump at 0113 (11T there now)" — matches the deduction (12T → 11T). **The combat half cannot be reached from New Game within this run (no contact), and the ledger does not list combat payments at all (TODO-A5a)** | fuel 484 ms | R10 |
| SUP-A10 | **UNAVAILABLE** | Checkpoint route: create "Revision 9", combine (state changes), press the checkpoint. File route: real "Download save" (1,472,233 bytes, 8 actions, state hash `sha256:eef0bf3e992e0…`), reload the page, load that file | Checkpoint route: "Restored Revision 9. Resume to continue.", All units back to 16 — **pass**. File route: after the load the truck was at 0316, 5 points, `load-part` 3T and the ledger text was identical to before the download. **But this environment has no file chooser, so the load step injected the downloaded file into the hidden input with a script; per doc 03 that is not a valid player operation** | restore < 1.5 s | R8 / R9 |
| SUP-A11 | **PASS** | Split off 4 points | Counters read `4` (empty) and `1` (`3T`), selection card "1 truck point · load 3/4T"; after Combine the single counter reads `5` | Split 482–489 ms | R6 |
| SUP-A12 | **PASS** (after fix, see D1) | Two same-type trucks in hex 0316, either selected | "Combine the trucks in this Hex into one counter" offered and works | 519 ms | R7 |
| SUP-A13 | **PASS** | Roster, selection card, fuel options, stack list, ledger, with the truck carrying 2T | Roster labels "Supply dump, 0313", no "off map" entries, no names; fuel options "…from the 12T dump at 0113"; stack list "Supply dump · 2T"; ledger "…from the dump at 0113" | — | R10 |
| SUP-A14 | **FAIL against the original wording; PASS under the user-approved wording (see Still open)** | Divide, load, unload, read "All units (n)" | 15 → 16 after the split (a split counter is a real counter), unchanged by loading; carried SP is not counted. The row says split counters must not inflate the count | — | R6 |
| SUP-A15 | **UNVERIFIED, then PASS once the user confirmed the semantics** | Move, load, split, press Undo three times | Observed: each press took back only the last action ("Undid: Loaded 3T…", then "Moved to 0316"), the truck stayed selected, the checkpoint list did not show the internal "Before:" points, 592 ms. **doc 03 says the exact semantics (dice, revealed information) must be confirmed before this row is executed; they are not confirmed**, so this is an observation, not a result | Undo 592 ms | R5 → R3 |

SUP-B01–B08 (Phase B) were not run: Phase B has not been built.

Other measurements: opening the roster 79 ms, selecting a unit 83–108 ms, moving a unit (Confirm) 602–629 ms, paying fuel 484 ms. All are inside doc 03's budgets
(selection ≤ 1000 ms, action ≤ 1500 ms). Loading a save was only waited for (it finished within 3 s); its time was not measured.

## Defects found by this run (all fixed, each with a test that failed first)

| ID | Defect | Fix |
|---|---|---|
| D1 | A truck that had already moved could not be combined again after being divided: the split-off counter inherited "finished moving" while the original was the current mover, so Combine was refused (rule 13.2c says divide/combine cost no MP and the parts may keep moving). Found in SUP-A08/A12 | `applyDivide` gives the new counter `moved: false`; test in `ocs-logistics.test.ts` and `transport-panel.test.ts` |
| D2 | The ledger's "from which dump" came from a note kept in the page, so it read "a dump" after loading the same save into a new page | The source is derived from the action and the state (`controller.ts` `#ledger`); the ledger now says "from the dump at 0113 (11T there now)"; test in `supply-ledger.test.ts` |
| D3 | After loading a save into a **new page**, the first actions were refused with an empty "Not allowed:", because the page's request numbers restarted at 1 and the session treated them as duplicates of the saved game's requests (pre-existing; found while verifying SUP-A10) | `#continueNumbering` continues the numbers after the loaded history; an empty refusal now says "the game refused the action (duplicate)"; test `load-then-act.test.ts` |

## Not done

- SUP-A09's combat payment, the file chooser step of SUP-A10, and the semantics confirmation for SUP-A15 are the reasons the gate cannot pass today.
- No whole turn was played to the end with real clicks in this run; the earlier run (see the roadmap) reached Turn 2 with scripted phase advancement.

## Re-run after user feedback (same day)

The user answered the acceptance questions: Undo semantics confirmed (only the last action; dice, revealed information, ending the step and combat clear it);
supply of one kind in the same Hex must not be two counters; combat and barrage payments must be in the ledger **and verified by testing**.

- **Dump merge.** Supply of the same kind and owner in a Hex is now one piece (`mergeSupplyAt`, used by unload and reinforcement placement); the map draws a dump as a small
  corner marker, not as a counter, so it no longer competes for the three visible slots. Real UI, 16×12 contact game, Allied Turn 3 Movement: truck moved to 0107 and loaded 6T
  from the merged "Dump here · 21T", moved to 0207 and unloaded 2T. Trace: status "Unloaded 2T at 0207."; panel "carrying 4/20T · 33 MP left"; row "Dump here · 2T (0.5 SP)" with
  "Load blocked: SP unloaded this phase cannot be loaded again this phase. 12.2a"; hex 0207 holds a `Supply dump, hex 0207 [dump marker]` plus the three unit counters.
  Screenshot `A02-rerun-dump-marker.jpg`. **SUP-A02 PASS.**
- **Combat payments in the ledger.** Real fight in the same game: the ledger line reads "Combat or barrage supply 2T from the dump at 0107 (13T there now)"
  and matches the deduction. Screenshot `A09-combat-supply-in-ledger.jpg`; headless test `tests/ui/combat-ledger.test.ts`. The ledger is now scoped to the current player turn
  and its heading reads "Supply this turn". **SUP-A09 PASS.**
- **SUP-A15 PASS** on the user's confirmation; the dice / revealed-information / combat clearing is covered by headless tests (`undo-action.test.ts`, `random-used.test.ts`), not by a real-UI dice roll.

## Still open

- **SUP-A14 PASS under the changed expectation.** The user decided (2026-10-02) that a truck is close to a unit, so each counter counts once and a split truck counts as two. The original observation (15 to 16 after a split, unchanged by load/unload, carried SP not counted) meets it.
- **SUP-A10 UNAVAILABLE**: the file-load step needs a real file chooser.
- No whole turn was played end to end with real clicks. **The Phase A gate stays IN PROGRESS.**
