# Product-operation verification plan

Status: **FROZEN BASELINE / EXECUTION IN PROGRESS** (2026-09-04).

Default-operation amendment (2026-10-01, explicitly requested by the user: "default map way too
small, inc min size" and "2 turn 也太少"): the New Game default is `32×24 / TEMPERATE_INLAND /
COMPACT / 2 per side / 8 turns`, and players may choose maps from 16×12 to 64×48. NG-06 now names
that default; NG-07 keeps its explicit 18×12 Large package, which is within the new limits. The
map generator itself still accepts 8×8 for rule-test fixtures only.

Order-of-battle amendment (2026-10-03, explicitly requested by the user: "default oob 應該要有更多步兵師,
reinforce entry point應該更多" and "用divisionPerSide取代 然後指定其中有多少Arm div"): New Game sets
`Divisions per side` (1–20; raised from 12 on the follow-up "div total 12好像還是有點少", default unchanged) and how many of them are armored (0–6); the rest are foot divisions, about one in
four airborne. The default is `32×24 / TEMPERATE_INLAND / COMPACT / 6 divisions per side, 2 armored / 8 turns`.
Generated maps give each side one entry Hex per six map rows along its edge (at least two), each also a Supply
Source. NG-04, NG-06 and NG-07 are restated in these terms (NG-07's former "4 per side" plan cannot be expressed
as a division mix, so its headline counts are recomputed for 4 divisions, 2 armored); every row stays `UNVERIFIED`.

Explicit-generation amendment (2026-10-04, explicitly requested by the user: "map/oob generation 應該是設定完按generate才產生
而不是每改一個設定就generate依次"): New Game no longer generates on open, on every settings change, or on "Randomize all
seeds". Changing settings only marks an existing preview "Preview invalidated" and disables Start; the Map/OOB/deployment
package is generated only when the player presses **Generate operation**. NG-02 means pressing Generate operation on the
default settings; NG-03 and NG-05 additionally require that no generation runs until Generate operation is pressed. Every
row stays `UNVERIFIED`.

Rail amendment (2026-10-04, requested by the user: "考慮到rail對OCS的supply規則極重要 安排加入rail 包含map generate
以及對應的supply規則", with the follow-up "rail不應該跟road一樣dense 應該要少一點"): generated maps carry a railway net
much sparser than the roads, and trace supply follows it (12.6a, 13.3c, 13.3h, 13.8c, 12.7a). Section H adds RAIL rows;
plan `docs/roadmap/10-rail-wbs.md`. No existing row changes status or expectation.

Replacement amendment (2026-10-04, explicitly requested by the user: "目前 PAX/EQ的 設計為何還需要option來打開 應該是內建的吧",
then choosing "B": implement 13.5a-e and build Pax/Eq in): the New Game **Air support** option is removed. Every New Game gives both
sides Pax and Eq each Reinforcement Phase, and aircraft reinforcements come with **Air forces**. Section I adds rows REPL-01 to
REPL-06; section F's run note is restated accordingly (no AIR expectation changed), and AIR-11/AIR-12, whose code was refactored,
were re-run on the new build. No other row changes.

Supply UX amendment (2026-10-02, explicitly approved by the user: "OK" to adding the SUP rows proposed in
`docs/roadmap/09-supply-logistics-ux-wbs.md` §4): section G adds Supply and logistics rows. Every new row
starts `UNVERIFIED`; no existing row changes status or expectation. The 2026-10-02 A0 baseline
(`docs/reports/supply-ux-a0-baseline-2026-10-02.md`) operated parts of this flow, including a checkpoint
restore, but did not store every evidence item required by "Rules of evidence" (screenshot artifacts,
elapsed time), so it promotes no row here, including SES-04. SUP-A15 states the approved intent (undo one
action, not the whole segment); its exact semantics for actions with dice or revealed information must be
confirmed in the A4 design review before that row can be executed.

Desktop scope amendment (2026-09-06, explicitly approved by the user): default
1920×1080, supported 1680×1050. Narrow-screen acceptance is removed. A single
left command deck remains fixed; only bounded collections may scroll. Historical
reports retain their original viewport evidence. All other operation expectations
and unverified statuses remain unchanged.

The unit-counter portion of the baseline was expanded on 2026-09-04 after the prior U4
scope was found to prove interaction but not OCS counter fidelity. Section B1 and
`04-counter-fidelity-correction-plan.md` are now required P0 evidence; existing map or
whole-turn screenshots cannot satisfy them by inference.

This plan is the acceptance authority for the current player-facing product. Unit, integration,
source-contract, and headless tests are regression support only. They cannot change a row's status
to `PASS` unless the row explicitly names that evidence type.

## Rules of evidence

- Every row starts `UNVERIFIED`, including behavior already covered by agent-written tests.
- Player operations run against the built application in a real browser, beginning from a control
  visible to the player. Calling a controller, orchestrator, or Rule API directly is not UI evidence.
- Clicking a hidden element through DevTools is not a valid player operation. Collapsed controls
  must first be opened through their visible summary, or the product must expose an obvious prompt.
- Record input values, expected visible result, observed result, elapsed time, browser console errors,
  final revision/phase, and screenshot or trace artifact for every execution.
- `PASS` means the expected result was observed with the frozen input. `FAIL` means it was not.
  `BLOCKED` means the required state cannot be reached through the product. `UNAVAILABLE` means the
  verification environment itself is unavailable. `UNVERIFIED` never means pass.
- A fix invalidates the affected row and its downstream rows. Re-run them on the new build.
- Do not change an expectation to match implementation. A changed expectation is a specification
  decision and requires its own documented approval.

## Interaction budgets

Measured from click/key input until the next usable render on the current verification machine:

- ordinary selection, action-family discovery, handoff, zoom, or panel operation: at most 1,000 ms;
- action execution and revision refresh: at most 1,500 ms;
- combined Map/OOB/deployment preview or Gameplay mount: at most 3,000 ms;
- no interaction may leave the UI without a visible busy state for more than 1,000 ms;
- ordinary interface text is at least 13 px at both desktop viewport sizes; retain the approved counter-artwork/LOD exception.

A completed transition does not pass when it exceeds its budget or temporarily appears dead.

## A. Boot and New Game package continuity

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| BOOT-01 | P0 | Open the built application | No boot error; an obvious New Game entry is available | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): boots into the default game, "☰ Menu" → "New Game…", 0 console errors |
| NG-01 | P0 | Open New Game, close it, reopen it | Dialog lifecycle is reversible and does not mutate the active game | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): close/reopen works; active game summary, turn and phase identical before and after |
| NG-02 | P0 | Build the default preview | Map, both OOB sides, deployment metrics, warnings, and Start are visible | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): Generate 488 ms → map, both sides, metrics incl. Deployed hexes/Warnings, Start enabled |
| NG-03 | P0 | Change one option after preview | Existing preview is visibly stale and Start is disabled | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): "Preview invalidated", preview dimmed, Start disabled ("Generate to apply changes"), preview content unchanged |
| NG-04 | P0 | Enter invalid width, division count, armored division count, seed, and turn limit | Each invalid request is rejected with a player-readable field/stage error | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): width 10, divisions 0, armored 7, seed −1, turn limit 0 each rejected beside the field; armored > divisions rejected with an OOB stage message |
| NG-05 | P1 | Use Randomize all seeds | All four displayed seeds change; preview becomes invalid | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): all four seeds changed, "Preview invalidated", Start disabled, nothing generated |
| NG-06 | P0 | Build and start default `32×24 / COMPACT / 6 divisions per side, 2 armored / 8 turns` (amended 2026-10-01 and 2026-10-03, see above) | Preview and mounted map size, style, units, formations, objectives, seeds, and turn limit agree | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): 32×24 Temperate inland, 48 units, 12 formations, 8 turns, seeds; mounted size, every Hex's terrain and 32 occupied Hexes equal the preview (keyboard sweep); 1 objective on both (screenshots); Generate 371 ms, Start 885 ms |
| NG-07 | P0 | Build and start `MEDITERRANEAN_COAST / 18×12 / LARGE / 4 divisions per side, 2 armored`, seeds `91001/91002/91003/91004`, 3 turns | Preview and mounted package agree; expected headline counts are 216 Hexes, 64 units, 8 formations, 38 deployed Hexes | FAIL (2026-10-04, `evidence/product-2026-10-04/newgame`): preview and mounted package agree (216 Hexes, 64 units, 8 formations, terrain hex by hex, 40 occupied Hexes), but the frozen expectation says 38 deployed Hexes and the product shows 40. Changing the expected count needs the user's approval |
| NG-08 | P0 | Repeat NG-07 from a fresh page | Map terrain/feature signature, OOB identity/stats, and deployment are identical | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): fresh page: terrain/feature, OOB and deployment signatures and the mounted keyboard sweep identical |
| NG-09 | P1 | Change only each seed in four separate runs | Only the documented Map/OOB/deployment/rules dimension changes | PASS (2026-10-04, `evidence/product-2026-10-04/newgame`): map seed → map (+ deployment, which sits on the map); OOB seed → OOB only; deployment seed → deployment only; rules seed → nothing in the preview |
| NG-10 | P0 | Observe generation and Start states | Configure, Map, OOB, Deployment, and Gameplay have truthful current/completed states; no simultaneous “active” ambiguity | FAIL (2026-10-04, `evidence/product-2026-10-04/newgame`): while generating, 2 Map, 3 OOB and 4 Deployment are all `is-active` at once (the ambiguity this row forbids); before and after, the states are truthful |

## B. Map and OOB operation

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| MAP-01 | P0 | Inspect the preview and mounted map | Terrain uses visual fill/pattern; roads, rivers, settlements, entry areas, and objectives are distinguishable without terrain-name labels on Hexes | PASS (2026-10-04, `evidence/product-2026-10-04/map`, judged on map01-*.png): fills/patterns, roads, rivers, settlements, objective star, blue entry-hex outlines; no terrain-name labels on Hexes |
| MAP-02 | P0 | Drag the map, wheel zoom, use +/−, then Reset | Camera changes after each input and Reset returns to 100% without selecting/moving a unit | PASS (2026-10-04, `evidence/product-2026-10-04/map`): drag moved the view, wheel 110%, + 120%, −− 100%, Reset 100%; no selection or move; all ≤ 397 ms |
| MAP-03 | P0 | Click and keyboard-activate a Hex and a counter | Selection is visible; stack panel identifies the Hex and visible pieces | FAIL (2026-10-04, `evidence/product-2026-10-04/map`): mouse PASS (empty Hex, own and enemy stacks: the stack list names the Hex and visible pieces). Keyboard Enter on an own two-unit stack selects only the top unit; no stack list, so the second piece is not shown (only the screen-reader announcement names it) |
| MAP-04 | P0 | Compare OOB preview with mounted counters/stacks | Both sides/formations and every generated unit remain traceable; projection/stack hiding explains any count difference | FAIL (2026-10-04, `evidence/product-2026-10-04/map`): all 56 non-dump preview units are in the two rosters, but preview and menu say 64 units while the rosters list 28 + 28; the 8 supply dumps are absent from "All units" and nothing on screen explains the difference |
| MAP-05 | P1 | Inspect enemy stacks from each hot-seat side | Owner-visible data and enemy redaction follow the active seat; no private data leaks | PASS (2026-10-04, `evidence/product-2026-10-04/map`): each seat sees the enemy top unit plus "n hidden"; the owner sees all; the hand-over screen hides the map; no hidden name in the other seat's DOM |

## B1. Printed unit-counter fidelity

Use the fixed NG-07 package and the reviewed VASSAL/rulebook corpus defined in
`04-counter-fidelity-correction-plan.md`. A generic rectangle, role abbreviation, text
summary, or isolated counter laboratory is not acceptable evidence.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| CTR-01 | P0 | Inspect Allied and Axis unit counters in the combined New Game preview | Both sides expose the generated unit counters, not formation counts alone; HQ, combat, artillery, reconnaissance, engineer, transport, and supply templates are visibly distinct | PASS at 1920×1080 (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`, judged on ctr01-*.png): 64 counters, HQ/combat/artillery/recon/engineer/transport/supply templates distinct on both sides, no role-label or "?" fillers; 1680×1050 repeat also PASS |
| CTR-02 | P0 | Compare a basic combat counter with its reviewed definition and rulebook template | Designation, echelon, symbol, affiliation, Combat Strength, Action Rating, MA/mobility, combat category, and applicable RE are in the correct counter grammar and match the generated definition | PASS (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): Standish TF / 10.A prints III 2 F2 7-4-14, equal to its generated Move face; tracked/mech colours on the image |
| CTR-03 | P0 | Inspect HQ, artillery, transport, and supply counters | Each uses its role-specific printed fields; not-applicable ratings are omitted rather than shown as zero, question mark, or a generic role label | PASS (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): HQ XXX 21 9-16 (range-MA), artillery 9 / 3 / range 2 / 14, truck 5 · 45, supply "1 SP"; no CS/AR filler |
| CTR-04 | P0 | Start the exact previewed package and find the sampled counters on the mounted map and in stack inspection | Identity, current printed face, values, symbol, side, and formation marking agree across preview, map, and inspector | PASS at 1920×1080 (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): six sampled pieces print the same fields in preview, roster, unit card and on the map (ctr04-map-*.png) |
| CTR-05 | P0 | Operate a legal face/mode change and a reachable step/resource change | Printed face and per-step/resource values update from authoritative state; mode/status appears separately and no stale printed value remains | UNVERIFIED — partial (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): Combat mode turned 13.Abn's face from 7-4-5 to 13-4-3 with "Combat mode" shown separately; a Breakdown dropped its RE from 3 to 2 on the counter; the fuel payment's dump fell 16T → 15T in the Ledger, but the dump counter itself was covered by other counters and was not seen updating |
| CTR-06 | P0 | Inspect a three-counter stack at normal zoom, zoom limits, selection, hover, and keyboard focus | Square aspect/field order remain stable; counter identity and critical ratings are not obscured by stack offset or interaction chrome | UNVERIFIED — partial (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): a three-counter stack is legible at 100% and at the 150% maximum, selected and under keyboard focus; the minimum-zoom screenshot missed the stack and hover showed no change, so those two are not evidenced |
| CTR-07 | P0 | Inspect the same enemy stack before and after a valid hot-seat handoff | Counter back/redaction, accessible name, DOM, and stack count reveal only rule-allowed information | PASS at 1920×1080 (2026-10-04, `evidence/product-2026-10-04/counters-1920x1080`): Allied seat sees the top enemy counter + "1 hidden"; after the hand-over (map hidden) the owner sees all; no hidden name in the Allied DOM |
| CTR-08 | P0 | Repeat CTR-01 through CTR-07 at 1920×1080 and 1680×1050 while recording console and timing evidence | Required counters and controls remain reachable; no clipped/overlapping critical field, uncaught error, or over-budget interaction | UNVERIFIED (2026-10-04): 1920×1080 run had 0 console errors and every timed action ≤ 1,026 ms; the 1680×1050 repeat stopped after CTR-03 when the test browser tab crashed inside the harness's mouse scan (`evidence/product-2026-10-04/counters-1680x1050`) |

## C. Rule actions through the actual UI

For every row: select the visible family, select a visible candidate, inspect its legal explanation,
execute it, and confirm revision/history/state effects. A direct Rule test is not sufficient.

| ID | Pri | Required operation | Expected product result | Status |
|---|---:|---|---|---|
| ACT-01 | P0 | `ADVANCE_SEQUENCE` through every phase/segment in one whole turn | Sequence reaches the next game turn with no dead end | PASS (2026-10-04, `evidence/product-2026-10-04/act`): Turn 1 → Turn 2 through every phase of both Player Turns and the First Player decision; phases with no legal action passed with the reason in the Log |
| ACT-02 | P0 | Select a friendly counter and execute `MOVE_PIECE` | Candidate list is bounded/responsive; counter changes Hex; movement usage and history update | PASS (2026-10-04, `evidence/product-2026-10-04/act`): select 874 ms, fuel 921 ms, preview "Cost 8 MP · 6 MP left" 661 ms, Confirm 156 ms; counter 0107 → 1206; Log "moved 0107 → 1206" |
| ACT-03 | P0 | Execute `CHANGE_MODE` on a legal unit | Counter/detail mode and history update; illegal modes are absent or explained | PASS (2026-10-04, `evidence/product-2026-10-04/act`): 82.Abn offered Combat/Reserve/Strat; Reserve in 469 ms: RES on the counter, "Reserve · 1.25 MP left", Log entry |
| ACT-04 | P0 | Execute `RELEASE_RESERVE` | A reachable reserve unit becomes released and can act in its legal segment | PASS (2026-10-04, `evidence/product-2026-10-04/act`): in Exploitation, Release reserve (475 ms) returned 82.Abn to Move mode with 5 MP; it then moved 0104 → 0205; Log entries |
| ACT-05 | P0 | Execute `PLACE_REINFORCEMENT` | An off-map reinforcement is placed only on a legal entry Hex | PASS (2026-10-04, `evidence/product-2026-10-04/act`): US 652 FA Gp offered only entry Hexes 0107/0102; Enter on 0808 placed nothing; click on 0107 placed it in 241 ms; Log "entered at 0107" |
| ACT-06 | P0 | Execute `CHECK_SUPPLY` in Supply | Supply result/payment requirement is visible and state/history update | UNVERIFIED (2026-10-04): the Supply Phase passed automatically four times (both packages, both sides: "Passed automatically, no legal actions: Supply") because every unit traced supply; a unit that needs to draw from a dump was not set up |
| ACT-07 | P0 | Execute `DECLARE_COMBAT` as regular combat | Legal participants/target are visible and transaction starts | PASS (2026-10-04, `evidence/product-2026-10-04/act`): Attack 1509 plan 501 ms (14:1, DRM +4, 1T), Declare 367 ms; supply choices, defender after a hand-over, advance decision; result Ae2/DL2o3DG |
| ACT-08 | P0 | Execute `DECLARE_COMBAT` as overrun | Movement-segment overrun starts only in a legal state | PASS (2026-10-04, `evidence/product-2026-10-04/act`): no target until Brown TF stood beside the enemy; Enter on the red-ringed 1410 opened the overrun plan (526 ms); Cancel left 6 MP; Overrun declared (552 ms) and Brown TF entered 1410 |
| ACT-09 | P0 | Execute `DECLARE_BARRAGE` | Legal firer/target are visible and transaction starts | PASS (2026-10-04, `evidence/product-2026-10-04/act`): Barrage 1404 chip → plan 458 ms (strength 9, shifts, 2T, firer Div Arty I), Declare 345 ms, supply choice, result "No effect" in the Log |
| ACT-10 | P0 | Resolve `RESPOND_DECISION` from the owning seat | Modal hides the map as required, accepts a choice, and advances transaction/revision | PASS (2026-10-04, `evidence/product-2026-10-04/act`): the defending owner answered after a hand-over whose screen hid the map ("The map stays hidden until they confirm"); every answer ≤ 500 ms and the transaction went on |
| ACT-11 | P0 | Execute `COMMIT_TRANSACTION` | Reserved resources resolve once and the final result is visible in history/state | BLOCKED (2026-10-04, `evidence/product-2026-10-04/act`): no control issues COMMIT_TRANSACTION (the rule engine rejects it as never legal); combats close by themselves after the last decision. Equivalent outcome seen: each 1T paid once (Ledger) |
| ACT-12 | P0 | Execute `CANCEL_TRANSACTION` in a cancellable state | Reservation is released and no combat/barrage result is applied | BLOCKED (2026-10-04, `evidence/product-2026-10-04/act`): no control issues CANCEL_TRANSACTION; after Declare every decision offers only payment/advance choices. Only the plan can be cancelled before declaring (verified, no state change) |
| ACT-13 | P0 | Attempt an operation from the wrong hot-seat side | Private candidates are unavailable; the UI gives an obvious handoff path | PASS (2026-10-04, `evidence/product-2026-10-04/act`): with the hand-over pending, own unit shows "Cannot move in this step", no mode buttons, no move confirm, End disabled; the deck shows "Hand the screen to Axis commander" |
| ACT-14 | P0 | Complete a whole turn containing at least one unit action, all required handoffs, and any decisions | Turn increments; no phase was skipped by a test-only/direct API shortcut | PASS (2026-10-04, `evidence/product-2026-10-04/act`): Turn 1 with placements, Reserve/release, fuel, moves, overrun, barrage, two attacks, all decisions by the owning seat and every hand-over through the deck; no hidden control or API call |
| ACT-15 | P0 | Move a unit into a Hex so it holds more than 10 RE, confirm it, then press End on the Movement segment | The move preview warns of the overstack and its button reads Confirm anyway; after the move a warning stays beside End naming the Hex and its RE; End needs a second press (Finish anyway: n hex is overstacked); the 4.8a elimination decision then follows. Moves within 10 RE show none of this; Trucks and dumps are not counted. Added 2026-10-03. Evidence so far is automated only (`tests/ui/overstack-warning.test.ts`) plus a styling check of injected markup in the served page; the full browser flow has not been operated | PASS (2026-10-04, `evidence/product-2026-10-04/act-overstack-supply`): 10 moves into 0502 within 10 RE showed no warning; the 11th previewed "⚠ Overstack … 10.5 RE … 4.8a" with "Confirm anyway"; warning beside End; a Truck did not change the RE; End needed "Finish anyway: 1 hex is overstacked"; the 4.8a decision listed only combat units |

If the generated product cannot create a legal state for ACT-04, ACT-05, or another action, that row
is `BLOCKED`, not `PASS`; the missing scenario/setup path is a product gap to resolve.

## D. Gameplay session and lifecycle

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| SES-01 | P0 | Pause, attempt action, then Resume | Actions are unavailable while paused and return after resume without state loss | UNVERIFIED |
| SES-02 | P0 | Reach a player change and use the visible handoff prompt | Current player can identify the required handoff without opening unrelated tools | UNVERIFIED |
| SES-03 | P0 | Begin and complete hot-seat handoff | Map/player projection is absent until next player confirmation | UNVERIFIED |
| SES-04 | P0 | Create checkpoint, execute action, restore checkpoint, resume | Revision/state return to checkpoint and play can continue | UNVERIFIED |
| SES-05 | P0 | Download save, change state, load that file | Loaded revision, sequence, counters, active seat, and history agree with saved state | UNVERIFIED |
| SES-06 | P0 | Finish a turn-limit-one game through the UI | Game End appears once with winner/draw, scores, reason, and final revision | UNVERIFIED |
| SES-07 | P0 | Download final save and replay | Both files are nonempty, parseable, and reproduce the displayed final result | UNVERIFIED |
| SES-08 | P0 | Choose New Game from Game End | Fresh configuration opens; the finished session is not silently reused | UNVERIFIED |
| SES-09 | P1 | Reload browser during setup and during active play | Recovery behavior is explicit; no silent state substitution | UNVERIFIED |

## E. Layout, readability, and fault visibility

| ID | Pri | Operation | Required result | Status |
|---|---:|---|---|---|
| UI-01 | P0 | Operate at 1920×1080 | Map remains dominant; single left deck does not scroll; primary commands and current phase/seat remain visible | UNVERIFIED |
| UI-02 | P0 | Operate at 1680×1050 | No page overflow, clipped content, or whole-deck scrolling; only bounded lists scroll; map and commands remain reachable | UNVERIFIED |
| UI-03 | P0 | Measure every visible text node in both viewports and inspect screenshots | Minimum computed size is 13 px; no visually illegible clipped labels | UNVERIFIED |
| UI-04 | P0 | Run NG-07 and ACT-14 while collecting console/runtime errors | Zero uncaught exception or error log; failures appear in the UI | UNVERIFIED |
| UI-05 | P1 | Keyboard traverse New Game, map selection, actions, modal, handoff | Focus remains visible and modal focus cannot escape into private content | UNVERIFIED |

## F. Air power (added 2026-10-01 with M11-Air A9; AIR-10 to AIR-15 added 2026-10-03)

Run on a New Game with **Air forces: Fighters, bombers and Air Bases** (and, from 2026-10-03, **Air transport** and
**Air support** set to their non-None options; from 2026-10-04 there is no Air support option: Eq and aircraft reinforcements
are built in, see section I). Hip Shoots are unreachable because no air force is listed as able to Hip
Shoot (game-specific rules were left out), so that part of AIR-05 is `BLOCKED`.

Amendment 2026-10-03 (user request: implement Air Transport/Air Drop, Air Base construction and air replacements/
reinforcements, then "完成後把全部的驗收做完"): rows AIR-10 to AIR-15 cover the new features; the former note that Air
Transport and Air Drop had no row is withdrawn. No existing expectation was changed.

Execution 2026-10-03: every row was run in Chromium (Playwright, 1920×1080) against the built application, driving only
visible controls (deck buttons, roster, hex chips, the map's arrow-key hex cursor and Enter, the menu's file chooser).
Scripts: `scripts/air-acceptance/`. Evidence (inputs and seeds, every step, observed text, elapsed times, console
errors, ending turn/phase or final revision, screenshots, saves): `docs/quality/evidence/air-2026-10-03/RUNS.md` and its run folders. All runs used the
same final build. The state revision is printed only on the Game End dialog, so runs that stop mid-game record turn,
player and phase instead. Dice-dependent checks use the rules seed named in the evidence folder; a run whose dice did not
reach a case (for example seed 5105, where the interceptor drove off the whole raid before Flak, so AIR-04's barrage
result was not shown) is kept as evidence and the case is taken from the run that reached it.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| AIR-01 | P0 | Inspect both sides' aircraft and Air Bases in the preview, then on the mounted map from each seat | Printed values, Active status and Level match the preview; the enemy sees only the Air Base, its top Active plane and top combat unit (4.9a) | PASS (2026-10-03, `air-01-08-rules-5104`) |
| AIR-02 | P0 | Refit Inactive aircraft in the Aircraft Refit Phase | 1T cost, 2 × Level capacity, the un-negated ZOC restriction and the Active limit are visible; refitted aircraft become Active | PASS (2026-10-03, after fixing the panel to show the ZOC rule and Active limit per base; `air-01-08-rules-5104`) |
| AIR-03 | P0 | Fly a Fighter Sweep against an enemy Air Base | Voluntary aborts, alternating picks across hot-seat handoffs, round results, return to base Inactive | PASS (2026-10-03, `air-01-08-rules-5104`) |
| AIR-04 | P0 | Fly an air barrage into an enemy Patrol Zone and have it intercepted | The owner decides interception after a handoff; Air Combat, Flak with its modifiers, Mission Loss, the barrage result, and the one-barrage-per-hex limit are visible | Interception, Air Combat, Flak with modifiers, the barrage result and the one-barrage limit PASS (2026-10-03, `air-01-08-rules-5104`); Mission Loss UNVERIFIED (no run reached a Flak hit on a multi-aircraft barrage) |
| AIR-05 | P1 | Fly Trainbusting; Hip Shoot where allowed | Marker shown; enemy movement costs +1 MP in the zone; marker removed at the enemy Clean Up. Hip Shoot: BLOCKED (see above) | Trainbusting PASS (2026-10-03, after naming the marker in the hover text; `air-01-08-rules-5105`); Hip Shoot BLOCKED |
| AIR-06 | P1 | Base Transfer; barrage an Air Base on the Facility Table | Fighter within range stays Active; Level never drops below 1 | PASS (2026-10-03, `air-01-08-rules-5104` and `air-06-facility-rules-5104`: Level 2 → 1, then a reducing result on Level 1 left it at Level 1) |
| AIR-07 | P0 | Capture an Air Base with a ground unit | Capture rolls, displacement choice to a base within twice the range (or loss), aircraft Inactive | PASS (2026-10-03, after fixing unreported capture rolls and deferred displacement; `air-07-rules-5105`, captured by a paratroop battalion's Air Drop landing; capture by a ground move was not operated in the browser) |
| AIR-08 | P1 | Try a second barrage on the same hex and a second mission with the same aircraft | Both unavailable with the rule explained (10.0e, 14.2e) | FAIL (2026-10-03, `air-01-08-rules-5104`): both are unavailable, but the UI only stops offering the hex and the aircraft; the rule (10.0e, 14.2e) is not explained |
| AIR-09 | P0 | Play a whole turn with air forces, then to Game End; save, load and replay | No dead end; console has no errors; the loaded and replayed game matches | PASS (2026-10-03, after fixing Game End not reappearing on load; `air-09`, 3 turns, file save/load through the file chooser, replay hash re-run) |
| AIR-10 | P0 | Build an Air Strip with an Engineer-Capable unit, upgrade it, and raise the base to Level 3 (13.8d, 15.2, 15.3) | Only a unit in Combat Mode is offered Construction; hexes within 2 Leg MP are listed; Air Strip 1T, upgrade 3T, new Level 1 4T, +1 Level 4T once per turn, never above Level 3; paid at once and shown in the ledger; one construction per phase | PASS (2026-10-03, `air-10`) |
| AIR-11 | P0 | Receive Eq and rebuild an aircraft lost in Air Combat (13.5f) | Eq arrive in the Reinforcement Phase; the Rebuild tab lists the Dead Pile or reduced aircraft and the Eq beside an HQ in Combat Mode; rebuilding spends whole Eq and the aircraft arrives Active at the chosen base | PASS (2026-10-03, `air-11-12`; re-run PASS 2026-10-04 on the build without the Air support option, `replacements-2026-10-04/air-11-12`) |
| AIR-12 | P1 | Place a reinforcing aircraft on its turn (13.6) | It is listed in Arrivals and can be placed only at a friendly Air Base with Active room, arriving Active | PASS (2026-10-03, `air-11-12`; re-run PASS 2026-10-04, `replacements-2026-10-04/air-11-12`) |
| AIR-13 | P0 | Air Transport a unit and supply to another Air Base (14.9) | Load against capacity; over capacity refused with the rule; Half range doubles capacity; the unloading limit and its exemptions shown; the carried unit has half its MA | PASS (2026-10-03, `air-13-15`) |
| AIR-14 | P0 | Plan, delay and cancel Drop Plans, then fly a parachute drop and a glider drop (14.10) | Plans made in the Aircraft Refit Phase; an unplanned combat-unit drop is refused; the Success Table number (with the glider +1) is the same in the preview and the result; the landing is rolled and reported | PASS (2026-10-03, after making the glider preview match the result; `air-13-15`) |
| AIR-15 | P1 | Fly a full Transport through an enemy Patrol Zone (14.9g) | Flak is rolled with its modifiers; a hit cuts capacity and the owner chooses the cargo lost | PASS (2026-10-03, `air-13-15`, rules seed 5106) |

The Air power section passes as a set only together with the rest of this plan's gate rules; the remaining gaps of the
implementation (Glider Points, game-specific Success Table modifiers, generator-defined para counters, fixed Eq
allotment, and others) are TODO items in `docs/reports/M11-air-power.md` §6.3 and the rules manifest.

## G. Supply and logistics (added 2026-10-02, plan `docs/roadmap/09-supply-logistics-ux-wbs.md`)

Run on the default New Game. Phase A rows (SUP-A) cover the manual flow; Phase B rows (SUP-B) cover the
helpers and start only after the Phase A gate. Supply dumps are generic counters with no names (original
board-game design; user decision 2026-10-02).

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| SUP-A01 | P0 | Select a truck in a Hex with an 8T+ dump and load a chosen part, such as 3T | Truck load is 3T, the dump keeps the rest, and the MP spent equals the preview shown before the click | PASS |
| SUP-A02 | P0 | Move that truck to a Hex with a friendly combat unit and unload a chosen part, such as 2T | The Hex shows a 2T dump, the truck keeps 1T, and the map and the selection card agree | PASS (re-run 2026-10-02 after fix) |
| SUP-A03 | P0 | Open the truck in a Hex with no friendly combat unit and no friendly dump while it carries SP | Unload is shown disabled with the reason and rule 13.2f, not silently absent | PASS |
| SUP-A04 | P0 | Unload SP, then try to load the same SP again in the same phase | Load is shown disabled with the reason "unloaded this phase" (12.2a) | PASS |
| SUP-A05 | P0 | Look at empty, part-loaded, and full trucks on the map and in the stack list | The three states are visually distinct; the stack list shows each truck's load | PASS |
| SUP-A06 | P1 | Select a dump that shares a Hex with a friendly truck and use "carry with a truck" | The same transfer area opens with the same result as from the truck | PASS |
| SUP-A07 | P0 | Load a truck, then pick another unit and preview its move | Before the move is confirmed, the UI warns that the truck would lose its remaining MP and load for the phase (6.1g); confirming is an explicit choice | PASS |
| SUP-A08 | P1 | Divide a truck, then combine the parts again | Points, load, counter-mix limit (13.2c) and spent MA (6.1f) are correct; no MP is charged | PASS |
| SUP-A09 | P0 | Pay one fuel and one combat supply, then open the supply ledger | The ledger lists what was paid, from which dump or truck, and what is left; it matches the real deduction | PASS (fuel and combat, real UI) |
| SUP-A10 | P0 | Create a checkpoint with a loaded truck, change state, restore it; then download a save and load that file | Truck points, load, dump quantities and ledger match the saved state in both routes | Checkpoint route PASS; file route OUT OF SCOPE (user decision 2026-10-02) |
| SUP-A11 | P0 | Divide and combine trucks and compare the map counter with the selection card | The counter shows the current Transport Points, not the printed 5 | PASS |
| SUP-A12 | P0 | Put two same-type trucks in one Hex (for example by dividing one) and select either | A Combine action is offered and works (blocking issue N-08) | PASS |
| SUP-A13 | P0 | Inspect dumps in the roster, selection card, fuel options, stack list and ledger, including SP carried by a truck | No dump has a name; each reads as type, quantity and Hex; carried SP is shown on its truck, not as a separate "off map" unit | PASS |
| SUP-A14 | P1 | Divide, load and unload, then read the unit counts | Each counter counts once (a truck is a unit, so a split truck is two); SP carried aboard a truck is not counted as a unit (expectation changed with the user's approval 2026-10-02) | PASS (observed 15 to 16 after a split, unchanged by load and unload) |
| SUP-A15 | P0 | After a move, a load, and a divide, press Undo | Undo reverts only the last action, not the whole segment (approved: only the last action is undone; dice, revealed information, ending the step and combat clear Undo) | PASS (move/load/divide in real UI; the dice cases by headless tests only) |
Phase A results of 2026-10-02 are in `docs/quality/evidence/supply-a-2026-10-02/README.md` (input, observed, elapsed, revision, console and artifacts per row).
After the fixes of the same day, SUP-A02 (dumps of one kind in a Hex are one counter and one map marker) and SUP-A09 (combat and barrage payments are in the ledger) were re-run in the real UI and pass.
SUP-A15 passes: the user confirmed the Undo semantics ("OK"). SUP-A14: the user decided that a truck is close to a unit, so a split truck counts as two (15 to 16); the row's expectation was changed accordingly and the earlier observation now meets it.
SUP-A10: the user moved file-based save/load out of scope on 2026-10-02; the checkpoint route passed and the file route stays UNAVAILABLE (needs a real file chooser). A whole game turn (both player turns, hot-seat handoffs, the First Player decision) was then played with real clicks; see the evidence README. 

| SUP-B01 | P0 | Enter "8T, from dump A to Hex B" | A plan preview lists trucks, route, MP per step, and resulting stock; game state is unchanged until confirmed | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B02 | P0 | Confirm that plan | Hex B gains 8T and the final state equals the manual run of the same actions | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B03 | P0 | Enter a task that exceeds the available MP | A shortfall report states how much can be delivered and why, with alternatives | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B04 | P1 | Choose a destination that breaks the unload condition (13.2f) | The planner says so and suggests legal Hexes | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B05 | P0 | Run the fuel estimate for chosen units | Needs and available sources are correct, and the later real payment matches the estimate | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B06 | P1 | Take a shortfall from the estimate into the planner | Destination and quantity are prefilled and a plan can be built | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B07 | P1 | Run the Supply Phase prediction | The predicted Out of Supply list matches the real result at the end of the Supply Phase | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |
| SUP-B08 | P0 | Play a whole turn using only the helpers, then save, load and replay | No dead end, no console error, and the loaded and replayed game match | UNVERIFIED (2026-10-04): Phase B is not implemented; the built UI has no planner, estimate or prediction control |

## H. Railroads (added 2026-10-04, plan `docs/roadmap/10-rail-wbs.md`)

Run on the default New Game unless a row says otherwise. Evidence: `docs/quality/evidence/rail-2026-10-04/README.md`.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| RAIL-01 | P0 | Generate operation on the default settings | The preview shows a connected rail net, a heavier multi-track trunk between the two sides, every entry hex on rail, and clearly fewer rail lines than roads | PASS (2026-10-04, 119 rail vs 387 road segments, `01-preview-map.jpg`) |
| RAIL-02 | P0 | Start the game and look at the map and legend | Rails are drawn as track with ties over the roads; the legend names Railroad | PASS (2026-10-04, `02-game-start.jpg`) |
| RAIL-03 | P0 | Turn on Trace Supply for each seat in turn | Map-edge rail entries show the side's S disc; each seat sees RAIL tags only on its own detrainable stations and EXT on its own linked Extenders | PASS (2026-10-04, Allied and Axis views, `03-trace-overlay.jpg`, `05-axis-overlay.jpg`) |
| RAIL-04 | P0 | Play a whole Game Turn with the rail map | No dead end; console has no errors | PASS (2026-10-04, passive turn: arrivals placed, no unit moved, `04-supply-phase.jpg`) |
| RAIL-05 | P0 | Move a unit beyond its draw range from the map edge but near a friendly station on a rail line, then reach the Supply Phase | The unit is in trace supply (no Out of Supply prompt), and the overlay covers its hex from the RAIL source | UNVERIFIED |
| RAIL-06 | P0 | Put an enemy combat unit (or an un-negated ZOC) on the rail line between a station and the map edge | The station loses its RAIL tag and units that relied on it are listed out of trace in the Supply Phase | UNVERIFIED |
| RAIL-07 | P0 | Enter an enemy-controlled station with a combat unit | Control changes; the station becomes a RAIL source for the mover once its rail path is clear, and no longer for the enemy | UNVERIFIED |
| RAIL-08 | P1 | Put an HQ in Combat Mode on a bare rail hex reached by rail | That hex gains a RAIL tag (13.8c); switching the HQ to Move Mode removes it | UNVERIFIED |
| RAIL-09 | P1 | Form an Extender next to a separate rail line | The Extender gets an EXT tag and the stations on the separate line gain RAIL tags (12.7a) | UNVERIFIED |
| RAIL-10 | P1 | Move a Truck unit along a railroad through woods | The move costs 1 MP per rail hexside (BtR Railroad, 6.2a) in the move preview | UNVERIFIED |

RAIL-05 to RAIL-10 are covered by `tests/rules/ocs-rail-supply.test.ts` and `tests/rules/rail-supply-flow.test.ts`, which are
regression support only and do not promote these rows.

## I. Replacements (added 2026-10-04, see the replacement amendment above)

Rows REPL-01 and REPL-02 run from the New Game form (Air forces None). A ground unit could not be lost the natural way within
a reasonable run: a first attempt flew Air Barrages every Barrage Segment for 8 turns with the generated air forces and never
inflicted a ground step loss, and the harness has no generic ground-movement policy. REPL-03 to REPL-06 therefore start, like
the breakdown gate, from a **test position**: the very New Game the UI makes with default settings, Air forces None and seeds
6101/6102/6103/6104, with a few units placed for Turn 1 Allied Movement (`scripts/replacement-acceptance/make-position.mjs`:
an Axis HQ in Combat Mode with a reduced division in its hex, a one-step Axis Armor unit beside three Allied divisions, a lone
Axis truck beside an Allied Leg unit; rules seed chosen so the capture and the elimination happen). It is loaded through
Menu → Load save…, which checks the hash and replays it; every later step is a click on the page. Losing a unit through
ordinary play from a fresh New Game and then rebuilding it is **not** yet exercised in the browser (TODO in
`docs/reports/replacements-2026-10-04.md`). Scripts: `scripts/replacement-acceptance/`; evidence:
`docs/quality/evidence/replacements-2026-10-04/RUNS.md`.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| REPL-01 | P0 | Open the New Game form | No Air support option; the form says both sides receive Pax and Eq every turn | PASS (2026-10-04, `repl-01-02`) |
| REPL-02 | P0 | Start a ground duel (Air forces None) and play a whole game turn | Pax and Eq are listed in Arrivals each Reinforcement Phase, print "Pax"/"Eq" with their quantity, can be placed at an entry hex or within 2 hexes of an HQ, stack as one Pax and one Eq counter; the turn completes | PASS (2026-10-04, `repl-01-02` from New Game; also `repl-03-06` Turns 1-2) |
| REPL-03 | P0 | Lose a ground unit in combat, then rebuild it from the Dead Pile with Repls beside an HQ in Combat Mode (13.5a-c) | The Rebuild tab lists the unit with its cost per step by the Rebuild Table and a placement mode; a rebuild the Repls cannot pay is refused with the reason; rebuilding spends the Repls and the unit returns in the Repls' hex, reported in the Log | PASS on the test position (2026-10-04, `repl-03-06`); from a fresh New Game: UNVERIFIED |
| REPL-04 | P0 | Rebuild steps of a reduced unit stacked with Pax (13.5a-2, 13.5b) | Listed as "reduced here" with the steps missing; any number of steps up to the Repls; it keeps its mode | PASS on the test position (2026-10-04, `repl-03-06`) |
| REPL-05 | P0 | Complete the game turn with the rebuilds, then save and load | No dead end through the hot-seat handoffs; the loaded game shows the same turn, phase and stacks; no console error | PASS (2026-10-04, `repl-03-06`, Turns 1-2) |
| REPL-06 | P1 | Lose trucks to an enemy move into their hex, then rebuild them with Eq (9.14c, 13.5e) | The capture roll and the points taken are reported; the Rebuild tab offers at most the points lost (and the Eq held); 1 Eq rebuilds one point as a truck in the Eq hex | PASS on the test position (2026-10-04, `repl-03-06`) |

## Execution order and stop conditions

1. Run BOOT and NG rows first. A package-continuity failure blocks all downstream Game Flow claims.
2. Run MAP rows on the exact NG-07 package.
3. Run ACT-01 through ACT-14. Prefer natural generated states; document any state that cannot be
   reached from New Game rather than injecting it through a test fixture.
4. Run SES rows, including real file download/load and a turn-limit-one Game End.
5. Run UI rows while repeating NG-07 and ACT-14, not on a static shell.
6. Fix only observed blockers. Rebuild, then re-run the failed row plus every dependent row.
7. Run automated typecheck/tests/build/smoke only after product-operation rows pass. These prove
   regression stability, not player acceptance.
8. Run the SUP-A rows after the Phase A work of `09-supply-logistics-ux-wbs.md`, and the SUP-B rows after
   its Phase B work. SUP-A10 needs a real file download and load, so it needs the user's permission to
   download before it is executed.

The gate may be marked `PASS` only when every P0 row is `PASS`, no P1 row has a player-blocking
failure, evidence belongs to the same final build, and the observed-issue list contains no open P0.

## Execution record 2026-10-04 (partial run)

Requested by the user ("把UNVERIFIED 全部確認一次 後更新到文件"; then "先就目前完成的部分更新文件"). Build: worktree
`worktree-todo-inventory-docs` at `780812a` (main `6745ecd` plus documentation only), `npm run build`, served from `web/` + `dist/`.
Browser: Playwright Chromium, 1920×1080 unless stated. Every operation was a click, key press or typed value on a visible
control; observations were read from the page. Scripts: `scripts/product-acceptance/` (`run-newgame.mjs`, `run-map.mjs`,
`run-counters.mjs`, and `session.mjs` for the step-by-step ACT runs, whose step files are kept with the evidence). Evidence:
`docs/quality/evidence/product-2026-10-04/` (`results.json`, `log.md`, screenshots per run). Console/page errors: 0 in every run.

Covered: §A, §B, §B1 (1920×1080; the 1680×1050 repeat stopped after CTR-03), §C. Not yet executed: §D (SES-01 to SES-09) and
§E (UI-01 to UI-05). SUP-B rows wait for Phase B (no planner exists in the product).

This run: 29 PASS, 4 FAIL (NG-07, NG-10, MAP-03, MAP-04), 2 BLOCKED (ACT-11, ACT-12); CTR-05, CTR-06 and CTR-08 (partial
evidence) and ACT-06 (state not reached) stay `UNVERIFIED`. Whole matrix after this record: 55 PASS, 5 FAIL (the four above and
AIR-08), 2 BLOCKED, 3 partly passed (AIR-04, AIR-05, SUP-A10), 26 UNVERIFIED (CTR-05, CTR-06, CTR-08, ACT-06, SES-01–09,
UI-01–05, SUP-B01–08).

Observed issues (open; none is closed by this record):

- O-1 (NG-10, P0): during Generate, stages 2–4 are `is-active` together — the exploratory finding below is reproduced.
- O-2 (NG-07, spec): the frozen package now deploys on 40 Hexes, not 38; preview and mount agree. Needs a user decision to
  amend the expectation or a generator fix.
- O-3 (MAP-03, P0): keyboard Enter on an own stack selects the top unit without the stack list that a click opens.
- O-4 (MAP-04, P0): "64 units" in the preview and menu vs "All units (28)" per side; the 8 supply dumps are counted in one place
  and not the other, with no explanation on screen.
- O-5 (usability): when the screen holder is not the seat that must act, the top bar reads "<holder> to act" while the deck
  reads "<other seat> commander to act" (seen after a manual hand-over in the Allied Reinforcement Phase and at every Player
  Turn change).
- O-6 (correctness of text): after the Allied attack on 1509 eliminated the HQ, the advance prompt said "1509 is vacant" while
  the map still announced "enemy Truck" there.
- O-7 (ACT-11/ACT-12): COMMIT_TRANSACTION and CANCEL_TRANSACTION have no player control; whether those rows should be restated
  (for example "the last decision commits the transaction once") is a specification decision for the user.
- O-8 (SES-01, not yet executed): the menu has no Pause control (`src/ui/controller.ts`: "A turn-based game has no pause"); SES-01
  will be `BLOCKED` unless the row is restated.

M8 and U10 remain `IN PROGRESS`.

## Exploratory findings that do not count as PASS

These findings triggered this plan and must be reproduced after the current code changes:

- A Large package did preserve 216 Hexes, 90 units, 8 formations, and the configured seeds through
  preview and mount.
- Advancing the sequence completed Turn 1 with 29 actions and five handoffs.
- That run performed no unit action, so it did not satisfy ACT-14.
- Selecting `MOVE_PIECE` without a selected unit then blocked the browser for more than 40 seconds.
- Generation stages 2–4 appeared active simultaneously.
- Required handoff was discoverable only in collapsed Session tools; the exploratory driver clicked
  the hidden DOM control, which is invalid under this plan.

Therefore M8 and U10 remain `IN PROGRESS`.
