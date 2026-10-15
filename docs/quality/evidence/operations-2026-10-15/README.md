# Outstanding operations acceptance

Run date: 2026-10-15 (Asia/Taipei). Base commit: `eca3a07f6e84c25550f4f631f2422d01d91d57ea` plus the working-tree implementation identified by `fingerprints.json`.
This immutable record covers the 23 rows that began UNVERIFIED: NG-12, CTR-06/08, ACT-06,
SES-01/07, UI-05, SUP-B01–08 and RAIL-05–10/15–16. The acceptance operations and expected
results in `03-product-operation-verification-plan.md` were not reduced or rewritten.

The runners serve the built `dist/` and `web/` application and operate Chromium through visible controls,
real keyboard input, native file choosers and downloads. They do not inject fixtures or dispatch through
controllers/Rule APIs. Downloaded saves are read to observe authoritative hashes, locations, stock,
actions and rail control. Reading `window.ocsMap` supplies camera coordinates/reachable choices for
actual pointer/keyboard operations; it does not execute game actions. Offline route exploration helped
freeze the rail witness but is not counted as acceptance.

## Reproduction

Run `npm run build`, then use a new artifact directory for each run:

```sh
node scripts/product-acceptance/run-helpers.mjs artifacts/operations/helpers-timed
node scripts/product-acceptance/run-counters.mjs artifacts/operations/counters-accepted 1920x1080
node scripts/product-acceptance/run-counters.mjs artifacts/operations/counters-accepted 1680x1050
node scripts/product-acceptance/run-keyboard.mjs artifacts/operations/keyboard
node scripts/air-acceptance/run-offmap.mjs artifacts/operations/offmap-air
node scripts/product-acceptance/run-rail-operations.mjs artifacts/operations/rail-accepted
```

Results/logs are copied into named subfolders here; screenshots, large saves and replay files remain
in the ignored artifact directories. `run-metadata.json` identifies artifact paths, timestamps, errors,
final boundaries and timing summaries. The helper's final run adds all locator-click timings to the
initial generation/mount measurements; the preceding `helpers-final` is retained as supporting evidence.

## Inputs and observed results

All games use TEMPERATE_INLAND and no sea. Unless stated otherwise: meeting engagement, October,
no air forces or air transport, unchanged generated package started from its preview. Seeds below
are map/OOB/deployment/rules, in that order. Counts are configured divisions per side before any
scenario attack multiplier.

| Run | Frozen inputs | Observed boundary |
|---|---|---|
| helpers, package A | 16×12 COMPACT, 1 division, 0 armored, 2 turns, 23111/23112/23113/23114 | Preview and mount visibly differ from B |
| helpers, package B | 18×12 STANDARD, 2 divisions, 1 armored, 1 turn, 7101/7102/7103/7104 | Complete turn and Game End Draw 9/9, revision 2; downloaded save and replay reproduce it |
| helpers, transport | 24×18 STANDARD, 3 divisions, 1 armored, 3 turns, 23101/23102/23103/23104 | 0711→0606 delivers 8T, then whole turns through Draw 14/14, revision 34 and matching replay |
| helpers, fuel shortfall | 48×36 COMPACT, 2 divisions, 1 armored, 2 turns, 24113/24114/24115/24116 | Doan TF at 2027 lacks a reachable source; prefills 1T/2027 and actually delivers it from 1914 |
| helpers, natural Supply | 48×36 COMPACT, 2 divisions, 1 armored, 2 turns, 24109/24110/24111/24112 | Garrison 2325 needs 1T; real Supply and helper agree; complete game Draw 50/50, revision 16 and matching replay |
| counters, both desktops | NG-07: 18×12 LARGE, 4 divisions, 2 armored, 3 turns, 91001/91002/91003/91004 | CTR-01–07 operated at 1920×1080 and 1680×1050; finish in Axis Movement after legal handoff |
| keyboard | 18×12 COMPACT, 2 divisions, 1 armored, 2 turns, 7101/7102/7103/7104 | 82.Abn Move face, keyboard move 0503→0403, all handoffs and first-player decision; Turn 2 Allied Reinforcement |
| off-map, package A | 16×12 COMPACT, 1 division, 0 armored, no air, 13101/13102/13103/13104 | Changed settings and small preview/mount |
| off-map, package B | 24×18 STANDARD, 2 divisions, 1 armored, Axis attacks, September, standard air and air transport, 8 turns, 13201/13202/13203/13204 | AEP 2410 sortie, full first turn, Turn 2 Axis Aircraft Refit, revision 18 |
| rail | 48×36 COMPACT, 4 divisions, 1 armored, 4 turns, 9111/9112/9113/9114 | All eight rows through legal moves, overrun, decisions, loads and handoffs; Turn 3 First Player, revision 45 |

Pause uses the actual default game before the helper packages: 32×24 COMPACT, 6 divisions, 2 armored,
8 turns. Its before/paused hashes are identical, accepted history length unchanged and lifecycle PAUSED;
End is physically attempted while disabled. Resume restores availability and the same phase/state.

Transport preview/cancel preserve the authoritative state hash. The 8T plan uses move/load/move/unload/
finish, costs 1/5/4/5/0 MP, and leaves destination 0606 with 20T. After confirmation, reload and execute
those same five manual UI actions: both full hashes are
`sha256:e8364ded1185ba4f16944fb373c7b38037ac463534d2b943f6897f5bed952399`.
Real shuttles leave the truck only 4 MP, insufficient for 5 MP loading; the 8T request reports 0/8T and
legal alternatives. An independent 100T request reports 12T available and 88T short. Destination 2418
fails 13.2f, with legal alternatives and no delivery. Five selected 2.A units compare 1T single-unit and
4T formation fuel; paying the recommendation reduces total own stock 24→20T and matches simulation.

Supply prediction names the naturally isolated garrison at 2325: one out of trace, 1T payable, zero
unfed. The visible Supply tab shows the same unit, manual Feed executes CHECK_SUPPLY and the Log
shows “You: check supply”. Reloading the actual pre-Supply save and applying the helper produces the
same hash `sha256:6798ed4fb41994fc5a6f0e8f781b2c4874243a7a87d86dffbefeb59cc5f890b1`.
Ending Supply and completing the turn leaves no OOS for that paid unit. The transport helper game
save/load agrees at Turn 2; its final replay hash is
`sha256:2f7b14ffa1517f2b595b6fc6a63e58b09736a265510e4c0a5dcbc825da323c4c`.
The natural Supply game replay hash is
`sha256:4b4c464150f60505cdec992a074180c60929805435b2e20510bdd7a66eb7da42`.

Off-map help and preview explicitly name the airfield. All six roster aircraft are in OFF_MAP_BOX,
with no map hex location. Only the two off-map fighters JG 300 Fw-190a and JG 301 Bf.109 participate
in the Barrage; on-map aircraft are deselected. The AEP +1 range restriction is visible. The defender
receives the required interception handoff and chooses not to intercept; Flak resolves without losses.
At next-turn Refit both are at the off-map airfield, Inactive, with “from its own stocks, no SP”.
Refit 2 makes them Active and total Axis resource stock remains 28T.

Rail operations use actual generated units and reload only saves created through UI in that same game:

- RAIL-05: 17.Abn moves to Marbach 1204 beyond direct map-edge draw. The overlay names a friendly
  RAIL source and trace coverage; actual Supply passes with no OOS prompt, then handoff reaches Axis Movement.
- RAIL-08: HQ 22nd Corps at bare railroad 1905 legally changes Move→Combat→Move. Its RAIL source
  appears only in Combat Mode.
- RAIL-16: 16T costs 4 Rail Cap against only 3 remaining, refused with 13.3a. A 1T request to 3234
  in enemy ZOC is refused with 13.3e. Both confirmations are disabled.
- RAIL-10: Truck 2010→3334, then railroad into woodland 3433 previews cost 1 MP / 17.5 left and confirms.
- RAIL-07/09: 22 Arm Regt / 11.A captures enemy station 3329. Its line initially remains disconnected.
  Truck at 3229 forms a five-point Extender; EXT and station RAIL sources appear. A real Axis handoff
  shows enemy rail at the captured station and no Axis RAIL source.
- RAIL-06: Allied combat occupation and Extender at 3505 cut the Axis network. Station 2604 loses
  its RAIL path; actual Axis Supply lists nine dependent units out of trace, including the station garrison.
  The legal Supply helper feeds them; all decisions and handoffs continue into Turn 2.
- RAIL-15: advance HQ and two 11.A regiments, pay fuel, overrun the garrison at 3403 with 14:1 odds,
  resolve the Axis 1T defense payment/terrain choices through handoff and perform mandatory advance.
  White TF reaches 3603; 22 Arm goes 3403→3402→3501. Neither enters target station 3502.
  Saved controller is Axis before ending Movement and Allied after; overlay gains friendly RAIL source/path.
  Continue through Turn 3 First Player, revision 45, final hash
  `sha256:b9e15da6a56d45ac87351a311301666f20eb74a93fa2d8848a35c9ffc941391e`.

## Screenshot review

The following files were opened and visually inspected in `artifacts/operations/`; file references in
copied logs refer to their artifact directory, not this evidence folder.

- `counters-accepted/counters-1920x1080/01-ctr06-complete-stack-100.jpg` and
  `02-ctr06-complete-stack-150.jpg`: three full square faces, Div Arty II and I identities, strength 9,
  AR 3, range 2, MA 14 and 2 SP/8T dump are legible. Header sits below the map toolbar.
- `counters-accepted/counters-1680x1050/04-ctr06-complete-stack-30.jpg` and
  `08-ctr06-keyboard-complete-stack.jpg`: full-size inspection survives icon-scale map, all three
  faces visible, focused dump has a gold outline and matching inspector; no Move popup over fields.
- Both desktop runs' `ctr06-stack-zoom-{100,150,70,30}.png` and preview/map sample images:
  square aspect retained; full detail, ratings and icon levels observed; inspection restores the full
  information at every level. Selected face 1/2/3 records compare each face with its unit inspector.
- `helpers-final/01-paused.jpg`: yellow pause banner with reachable Resume; End disabled.
  `12-eight-token-plan.jpg`: source, destination, stock, five step costs and Confirm/Cancel visible.
  `18-fuel-comparison.jpg`: five chosen formation units, 4T recommendation, 1T/4T alternatives with
  sources; bounded list scrolls. `26-shortfall-prefilled-plan.jpg`: 2027 and 1T prefilled with route,
  resulting stock and costs; long plan uses bounded scrolling to reach confirmation.
- `helpers-final/28-natural-supply-prediction.jpg` and `31-supply-payment-history.jpg`: one out of
  trace, zero predicted unfed, named garrison, 1T source, and subsequent “You: check supply” log.
  `23-helper-replayed-end.jpg`: replayed Draw 14/14 and final revision 34.
  The final timed run's `12-eight-token-plan.jpg`, `17-mp-shortfall.jpg`, `23-helper-replayed-end.jpg`
  and `33-supply-game-replayed.jpg` were also opened: same readable plan, 4 MP/0T shortfall, and
  replayed Draw 14/14 revision 34 and Draw 50/50 revision 16.
- `keyboard/03-preview-focus-trap.jpg`: Start has visible gold focus while Map/OOB preview remains
  clear. `07-keyboard-private-handoff.jpg`: only the privacy dialog is drawn, focus on commander
  confirmation and no map/private deck in the document.
- `offmap-air/05-off-map-air-roster.jpg`: off-map aircraft listed at their airfield. Long roster names
  remain subject to the existing UI-02 name truncation issue; the location and mission/refit boundaries
  were checked explicitly. `08-off-map-barrage-plan.jpg`: off-map participants and AEP +1 origin.
  `11-off-map-refit-no-sp.jpg`: notice confirms refitting two at off-map field from own stocks.
- `rail-accepted/09-woodland-rail-one-mp-preview.jpg`: actual popup says cost 1 MP / 17.5 left and
  hover identifies woods. `08-rail-enemy-zoc-refusal.jpg`: 3234 request, visible 13.3e and disabled OK.
  `13-linked-extender-and-station.jpg`: selected five-point Extender and station RAIL hover/path.
  `17-axis-rail-cut-supply-list.jpg`: nine out-of-trace, named units and feed controls in Supply.
  `24-front-station-control-after-phase-end.jpg`: after Movement, station 3502 has RAIL source and
  friendly rail path, with handover still required before the opponent can act.

## Failures found, corrections and limits

Exploratory outcomes are retained in `exploration/`; they do not promote rows. Inspection initially
showed the stack header underneath the toolbar; it was moved down and both sizes rerun into
`counters-accepted`, with a measured non-overlap assertion and reviewed images. Early rail exploration
found source types missing from hover announcements; the integrated UI now names RAIL/EXT, rail owner
and trace coverage and all eight rows were rerun. An early Supply script matched “Logistics” as “Log”;
the harness now uses a word boundary and the actual Supply/history flow was rerun. Controller regression
also checks that same-revision loads and handoffs clear/hide a transport preview.

During the actual rail overrun, the surviving mover loses selection and must be reselected to continue.
The existing `overrun-selection-release` TODO remains open; the run reselected normally and completed
its required flow. Opponent-turn wording can still differ between the top bar and handover deck, as
already recorded in `05`. Existing UI-02 long-name clipping and SES-09 reload loss remain FAIL.

All accepted browser runs have zero console/page errors. Counter runs measure 89 pointer interactions
each, maximum 923 ms at 1920 and 927 ms at 1680, within the assigned 1,000/1,500/3,000 ms budgets.
Rail records 172 locator clicks (maximum 472 ms) and individual confirmed moves around 0.6–0.8 s.
Keyboard activation timings peak at 382 ms. Off-map sortie's 5,867 ms includes several separately
operated decisions/handoffs, not a single blocked interaction; its refit timing also includes the
harness's downloads/settling. These compound durations are recorded without applying a single-click
budget to the whole sequence. The final helper run records 246 interactions: maximum ordinary click 184 ms, action 399 ms,
and generation/mount 1,194 ms. No over-budget interaction. Regression results are in `checks.md`.

This closes exactly the requested 23 UNVERIFIED rows. The product gate remains IN PROGRESS:
other FAIL/IN PROGRESS rows, AIR limitations, SUP-A10 scope, CF5 continuous NG-07 persistence evidence,
entire-division rail transport and the original Phase B extensions/benchmark are not inferred complete.
