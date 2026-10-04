# doc 03 §A: BOOT-01, NG-01 to NG-10

- screenshot 01-boot-menu.jpg
- PASS BOOT-01: No boot error; an obvious New Game entry is available — observed: booted into Turn 1 / 8 Allied player turn Reinforcement; "☰ Menu" visible true in the top bar; the menu's first button reads "New Game…"; console/page errors 0
- screenshot 02-ng01-open.jpg
- PASS NG-01: Dialog lifecycle is reversible and does not mutate the active game — observed: closed true, reopened true (status "Configure operation"); active game before "48 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476" Turn 1 / 8 Reinforcement / after "48 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476" Turn 1 / 8 Reinforcement
- screenshot 03-ng02-default-preview.jpg
- PASS NG-02: Map, both OOB sides, deployment metrics, warnings, and Start are visible — observed: before Generate: "Configure operation", Start absent; Generate 488 ms → "Preview ready"; metrics {"Map":"32×24","Units":"48","Formations":"12","Deployed hexes":"32","Objectives":"1","Warnings":"0"}; sides ALLIED/AXIS; 48 preview counters; map hexes 768; Start "Start this operation" disabled false
- screenshot 04-ng03-stale.jpg
- PASS NG-03: Existing preview is visibly stale and Start is disabled; nothing is generated until Generate operation — observed: after changing Turn limit 8→7: status "Preview invalidated" — "Settings changed since this preview. Press Generate operation to apply them."; preview dimmed true; Start "Generate to apply changes" disabled true; preview content unchanged true
- screenshot 05-ng04-invalid-width.jpg
- screenshot 06-ng04-invalid-divisions.jpg
- screenshot 07-ng04-invalid-armored.jpg
- screenshot 08-ng04-invalid-map-seed.jpg
- screenshot 09-ng04-invalid-turn-limit.jpg
- screenshot 10-ng04-armored-over-divisions.jpg
- PASS NG-04: Each invalid request is rejected with a player-readable field/stage error — observed: width=10: beside new-game-width: "Value must be greater than or equal to 16."; status "Preview invalidated"; Start disabled true | divisions=0: beside new-game-divisions: "Value must be greater than or equal to 1."; status "Preview invalidated"; Start disabled true | armored=7: beside new-game-armored: "Value must be less than or equal to 6."; status "Preview invalidated"; Start disabled true | map-seed=-1: beside new-game-map-seed: "Value must be greater than or equal to 0."; status "Preview invalidated"; Start disabled true | turn-limit=0: beside new-game-turn-limit: "Value must be greater than or equal to 1."; status "Preview invalidated"; Start disabled true | armored>divisions=2/3: "OOB: Armored divisions per side must be an integer from 0 to 6, and no more than the divisions per side."; status "Cannot build this operation"; Start disabled null
- screenshot 11-ng05-randomized.jpg
- PASS NG-05: All four displayed seeds change; preview becomes invalid; no generation until Generate — observed: seeds 206569473/206569474/206569475/206569476 → 2786239357/572214347/2553716684/3388269728; status "Preview invalidated"; Start disabled true; preview content unchanged true
- screenshot 12-ng06-preview.jpg
- screenshot 13-ng06-mounted.jpg
- PASS NG-06: Default 32×24 / COMPACT / 6 per side, 2 armored / 8 turns: preview and mounted size, style, units, formations, objectives, seeds and turn limit agree — observed: style TEMPERATE_INLAND; preview {"Map":"32×24","Units":"48","Formations":"12","Deployed hexes":"32","Objectives":"1","Warnings":"0"} (Generate 335 ms, Start 1022 ms); mounted 32×24, 32 occupied hexes, terrain mismatches 0; menu "48 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476"; checks {"size":true,"terrain":true,"occupied":true,"units":true,"formations":true,"turns":true,"seeds":true}; objectives compared on the screenshots
- FAIL NG-10: Configure, Map, OOB, Deployment and Gameplay show truthful current/completed states; no simultaneous "active" ambiguity — observed: Generate: 1 Configure:is-active | 2 Map:- | 3 OOB:- | 4 Deployment:- | 5 Gameplay:- ⇒ 1 Configure:is-complete | 2 Map:is-active | 3 OOB:is-active | 4 Deployment:is-active | 5 Gameplay:- ⇒ 1 Configure:is-complete | 2 Map:is-complete | 3 OOB:is-complete | 4 Deployment:is-complete | 5 Gameplay:- || Start: 1 Configure:is-complete | 2 Map:is-complete | 3 OOB:is-complete | 4 Deployment:is-complete | 5 Gameplay:- ⇒ 1 Configure:is-complete | 2 Map:is-complete | 3 OOB:is-complete | 4 Deployment:is-complete | 5 Gameplay:is-active; states with more than one active stage: 1
- screenshot 14-ng07-preview.jpg
- screenshot 15-ng07-mounted.jpg
- FAIL NG-07: Preview and mounted package agree; expected headline counts are 216 Hexes, 64 units, 8 formations, 38 deployed Hexes — observed: Map 18×12 (expected 18×12), Units 64 (expected 64), Formations 8 (expected 8), Deployed hexes 40 (expected 38); 216 hexes; Generate 301 ms, Start 409 ms; mounted checks {"size":true,"terrain":true,"occupied":true,"units":true,"formations":true,"turns":true,"seeds":true}; menu "64 units · 8 formations · 3 turns · seeds map 91001, OOB 91002, deployment 91003, rules 91004"
- screenshot 16-ng08-mounted.jpg
- PASS NG-08: Map terrain/feature signature, OOB identity/stats, and deployment are identical from a fresh page — observed: preview terrain+features e194fe4839385d14, OOB 724a0289b673e3bb, deployment f0f310019becdf4b; equal {"terrainAndFeatures":true,"oob":true,"deployment":true,"mountedMap":true}
- PASS NG-09: Only the documented Map/OOB/deployment/rules dimension changes — observed: map seed +1 → changed map+deployment | oob seed +1 → changed oob | deployment seed +1 → changed deployment | rules seed +1 → changed nothing in the preview; mounted weather 1 Oct · Dry
- PASS UI-04(ng): No browser console or page error during the New Game run — observed: 0 errors

Ended at: Turn 1 / 3, Allied player turn, Reinforcement

Console/page errors: 0

