# Product-operation verification plan

Status: **FROZEN BASELINE / EXECUTION IN PROGRESS** (2026-09-04).

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
| BOOT-01 | P0 | Open the built application | No boot error; an obvious New Game entry is available | UNVERIFIED |
| NG-01 | P0 | Open New Game, close it, reopen it | Dialog lifecycle is reversible and does not mutate the active game | UNVERIFIED |
| NG-02 | P0 | Build the default preview | Map, both OOB sides, deployment metrics, warnings, and Start are visible | UNVERIFIED |
| NG-03 | P0 | Change one option after preview | Existing preview is visibly stale and Start is disabled | UNVERIFIED |
| NG-04 | P0 | Enter invalid width, formation count, seed, and turn limit | Each invalid request is rejected with a player-readable field/stage error | UNVERIFIED |
| NG-05 | P1 | Use Randomize all seeds | All four displayed seeds change; preview becomes invalid | UNVERIFIED |
| NG-06 | P0 | Build and start default `18×12 / COMPACT / 2 formations per side` | Preview and mounted map size, style, units, formations, objectives, seeds, and turn limit agree | UNVERIFIED |
| NG-07 | P0 | Build and start `MEDITERRANEAN_COAST / 18×12 / LARGE / 4 per side`, seeds `91001/91002/91003/91004`, 3 turns | Preview and mounted package agree; expected headline counts are 216 Hexes, 90 units, 8 formations, 28 deployed Hexes | UNVERIFIED |
| NG-08 | P0 | Repeat NG-07 from a fresh page | Map terrain/feature signature, OOB identity/stats, and deployment are identical | UNVERIFIED |
| NG-09 | P1 | Change only each seed in four separate runs | Only the documented Map/OOB/deployment/rules dimension changes | UNVERIFIED |
| NG-10 | P0 | Observe generation and Start states | Configure, Map, OOB, Deployment, and Gameplay have truthful current/completed states; no simultaneous “active” ambiguity | UNVERIFIED |

## B. Map and OOB operation

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| MAP-01 | P0 | Inspect the preview and mounted map | Terrain uses visual fill/pattern; roads, rivers, settlements, entry areas, and objectives are distinguishable without terrain-name labels on Hexes | UNVERIFIED |
| MAP-02 | P0 | Drag the map, wheel zoom, use +/−, then Reset | Camera changes after each input and Reset returns to 100% without selecting/moving a unit | UNVERIFIED |
| MAP-03 | P0 | Click and keyboard-activate a Hex and a counter | Selection is visible; stack panel identifies the Hex and visible pieces | UNVERIFIED |
| MAP-04 | P0 | Compare OOB preview with mounted counters/stacks | Both sides/formations and every generated unit remain traceable; projection/stack hiding explains any count difference | UNVERIFIED |
| MAP-05 | P1 | Inspect enemy stacks from each hot-seat side | Owner-visible data and enemy redaction follow the active seat; no private data leaks | UNVERIFIED |

## B1. Printed unit-counter fidelity

Use the fixed NG-07 package and the reviewed VASSAL/rulebook corpus defined in
`04-counter-fidelity-correction-plan.md`. A generic rectangle, role abbreviation, text
summary, or isolated counter laboratory is not acceptable evidence.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| CTR-01 | P0 | Inspect Allied and Axis unit counters in the combined New Game preview | Both sides expose the generated unit counters, not formation counts alone; HQ, combat, artillery, reconnaissance, engineer, transport, and supply templates are visibly distinct | UNVERIFIED |
| CTR-02 | P0 | Compare a basic combat counter with its reviewed definition and rulebook template | Designation, echelon, symbol, affiliation, Combat Strength, Action Rating, MA/mobility, combat category, and applicable RE are in the correct counter grammar and match the generated definition | UNVERIFIED |
| CTR-03 | P0 | Inspect HQ, artillery, transport, and supply counters | Each uses its role-specific printed fields; not-applicable ratings are omitted rather than shown as zero, question mark, or a generic role label | UNVERIFIED |
| CTR-04 | P0 | Start the exact previewed package and find the sampled counters on the mounted map and in stack inspection | Identity, current printed face, values, symbol, side, and formation marking agree across preview, map, and inspector | UNVERIFIED |
| CTR-05 | P0 | Operate a legal face/mode change and a reachable step/resource change | Printed face and per-step/resource values update from authoritative state; mode/status appears separately and no stale printed value remains | UNVERIFIED |
| CTR-06 | P0 | Inspect a three-counter stack at normal zoom, zoom limits, selection, hover, and keyboard focus | Square aspect/field order remain stable; counter identity and critical ratings are not obscured by stack offset or interaction chrome | UNVERIFIED |
| CTR-07 | P0 | Inspect the same enemy stack before and after a valid hot-seat handoff | Counter back/redaction, accessible name, DOM, and stack count reveal only rule-allowed information | UNVERIFIED |
| CTR-08 | P0 | Repeat CTR-01 through CTR-07 at 1920×1080 and 1680×1050 while recording console and timing evidence | Required counters and controls remain reachable; no clipped/overlapping critical field, uncaught error, or over-budget interaction | UNVERIFIED |

## C. Rule actions through the actual UI

For every row: select the visible family, select a visible candidate, inspect its legal explanation,
execute it, and confirm revision/history/state effects. A direct Rule test is not sufficient.

| ID | Pri | Required operation | Expected product result | Status |
|---|---:|---|---|---|
| ACT-01 | P0 | `ADVANCE_SEQUENCE` through every phase/segment in one whole turn | Sequence reaches the next game turn with no dead end | UNVERIFIED |
| ACT-02 | P0 | Select a friendly counter and execute `MOVE_PIECE` | Candidate list is bounded/responsive; counter changes Hex; movement usage and history update | UNVERIFIED |
| ACT-03 | P0 | Execute `CHANGE_MODE` on a legal unit | Counter/detail mode and history update; illegal modes are absent or explained | UNVERIFIED |
| ACT-04 | P0 | Execute `RELEASE_RESERVE` | A reachable reserve unit becomes released and can act in its legal segment | UNVERIFIED |
| ACT-05 | P0 | Execute `PLACE_REINFORCEMENT` | An off-map reinforcement is placed only on a legal entry Hex | UNVERIFIED |
| ACT-06 | P0 | Execute `CHECK_SUPPLY` in Supply | Supply result/payment requirement is visible and state/history update | UNVERIFIED |
| ACT-07 | P0 | Execute `DECLARE_COMBAT` as regular combat | Legal participants/target are visible and transaction starts | UNVERIFIED |
| ACT-08 | P0 | Execute `DECLARE_COMBAT` as overrun | Movement-segment overrun starts only in a legal state | UNVERIFIED |
| ACT-09 | P0 | Execute `DECLARE_BARRAGE` | Legal firer/target are visible and transaction starts | UNVERIFIED |
| ACT-10 | P0 | Resolve `RESPOND_DECISION` from the owning seat | Modal hides the map as required, accepts a choice, and advances transaction/revision | UNVERIFIED |
| ACT-11 | P0 | Execute `COMMIT_TRANSACTION` | Reserved resources resolve once and the final result is visible in history/state | UNVERIFIED |
| ACT-12 | P0 | Execute `CANCEL_TRANSACTION` in a cancellable state | Reservation is released and no combat/barrage result is applied | UNVERIFIED |
| ACT-13 | P0 | Attempt an operation from the wrong hot-seat side | Private candidates are unavailable; the UI gives an obvious handoff path | UNVERIFIED |
| ACT-14 | P0 | Complete a whole turn containing at least one unit action, all required handoffs, and any decisions | Turn increments; no phase was skipped by a test-only/direct API shortcut | UNVERIFIED |

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

## F. Air power (added 2026-10-01 with M11-Air A9)

Run on a New Game with **Air forces: Fighters, bombers and Air Bases**. Air Transport and Air Drop
(14.9, 14.10) are not implemented and have no row; Hip Shoots are unreachable because no air force is
listed as able to Hip Shoot (game-specific rules were left out), so that part of AIR-05 is `BLOCKED`.

| ID | Pri | Player operation | Required visible result | Status |
|---|---:|---|---|---|
| AIR-01 | P0 | Inspect both sides' aircraft and Air Bases in the preview, then on the mounted map from each seat | Printed values, Active status and Level match the preview; the enemy sees only the Air Base, its top Active plane and top combat unit (4.9a) | UNVERIFIED |
| AIR-02 | P0 | Refit Inactive aircraft in the Aircraft Refit Phase | 1T cost, 2 × Level capacity, the un-negated ZOC restriction and the Active limit are visible; refitted aircraft become Active | UNVERIFIED |
| AIR-03 | P0 | Fly a Fighter Sweep against an enemy Air Base | Voluntary aborts, alternating picks across hot-seat handoffs, round results, return to base Inactive | UNVERIFIED |
| AIR-04 | P0 | Fly an air barrage into an enemy Patrol Zone and have it intercepted | The owner decides interception after a handoff; Air Combat, Flak with its modifiers, Mission Loss, the barrage result, and the one-barrage-per-hex limit are visible | UNVERIFIED |
| AIR-05 | P1 | Fly Trainbusting; Hip Shoot where allowed | Marker shown; enemy movement costs +1 MP in the zone; marker removed at the enemy Clean Up. Hip Shoot: BLOCKED (see above) | UNVERIFIED |
| AIR-06 | P1 | Base Transfer; barrage an Air Base on the Facility Table | Fighter within range stays Active; Level never drops below 1 | UNVERIFIED |
| AIR-07 | P0 | Capture an Air Base with a ground unit | Capture rolls, displacement choice to a base within twice the range (or loss), aircraft Inactive | UNVERIFIED |
| AIR-08 | P1 | Try a second barrage on the same hex and a second mission with the same aircraft | Both unavailable with the rule explained (10.0e, 14.2e) | UNVERIFIED |
| AIR-09 | P0 | Play a whole turn with air forces, then to Game End; save, load and replay | No dead end; console has no errors; the loaded and replayed game matches | UNVERIFIED |

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

The gate may be marked `PASS` only when every P0 row is `PASS`, no P1 row has a player-blocking
failure, evidence belongs to the same final build, and the observed-issue list contains no open P0.

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
