# doc 03 §A: BOOT-01, NG-01 to NG-10

- screenshot 01-boot-menu.jpg
- PASS BOOT-01: No boot error; an obvious New Game entry is available — observed: booted into Turn 1 / 8 Allied player turn Movement; "☰ Menu" visible true in the top bar; the menu's first button reads "New Game…"; console/page errors 0
- screenshot 02-ng01-open.jpg
- PASS NG-01: Dialog lifecycle is reversible and does not mutate the active game — observed: closed true, reopened true (status "Configure operation"); active game before "Meeting engagement · 52 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476" Turn 1 / 8 Movement / after "Meeting engagement · 52 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476" Turn 1 / 8 Movement
- screenshot 03-ng02-default-preview.jpg
- PASS NG-02: Map, both OOB sides, deployment metrics, warnings, and Start are visible — observed: before Generate: "Configure operation", Start absent; Generate 539 ms → "Preview ready"; metrics {"Scenario":"Meeting engagement","Map":"32×24","Units":"52","Objectives":"20 hexes · 48 VP (Allied 24 · Axis 24)","Divisions":"6 per side","Deployed hexes":"53","Rail Cap":"Allied 5 · Axis 5","Warnings":"0"}; sides ALLIED/AXIS; 58 preview counters; map hexes 768; Start "Start this operation" disabled false
- screenshot 04-ng03-after-change.jpg
- PASS NG-03: After changing an option the earlier preview is no longer offered as current: it is stale or gone, Start is unavailable, and nothing is generated until Preview is pressed — observed: after Back and changing Turn limit 8→7: page "settings", status "Configure operation" — "Set the map and force options, then press Preview."; preview on screen false; Start absent; preview dimmed false; (the row's old wording "visibly stale/dimmed, Start disabled" described the one-page dialog)
- PASS NG-03b: Pressing Preview after the change generates a new preview that carries it — observed: Preview → "Preview ready", page "preview"; Start present; preview differs from the earlier one false (turn limit is not shown on the preview, so only the rebuild is observed)
- screenshot 05-ng04-invalid-width.jpg
- screenshot 06-ng04-invalid-divisions.jpg
- screenshot 07-ng04-invalid-armored.jpg
- screenshot 08-ng04-invalid-map-seed.jpg
- screenshot 09-ng04-invalid-turn-limit.jpg
- screenshot 10-ng04-armored-over-divisions.jpg
- PASS NG-04: Each invalid request is rejected with a player-readable field/stage error — observed: width=10: beside new-game-width: "Value must be greater than or equal to 16."; status "Configure operation"; Start disabled null | divisions=0: beside new-game-divisions: "Value must be greater than or equal to 1."; status "Configure operation"; Start disabled null | armored=7: beside new-game-armored: "Value must be less than or equal to 6."; status "Configure operation"; Start disabled null | map-seed=-1: beside new-game-map-seed: "Value must be greater than or equal to 0."; status "Configure operation"; Start disabled null | turn-limit=0: beside new-game-turn-limit: "Value must be greater than or equal to 1."; status "Configure operation"; Start disabled null | armored>divisions=2/3: "OOB: Armored divisions per side must be an integer from 0 to 6, and no more than the divisions per side."; status "Cannot build this operation"; Start disabled null
- screenshot 11-ng05-randomized.jpg
- PASS NG-05: All four displayed seeds change; no earlier preview is offered as current; no generation until Preview — observed: seeds 206569473/206569474/206569475/206569476 → 723488782/145158144/3328584556/1586918215; page "settings", status "Configure operation"; preview on screen false; Start absent
- screenshot 12-ng06-preview.jpg
- screenshot 13-ng06-mounted.jpg
- PASS NG-06: Default 32×24 / COMPACT / 6 per side, 2 armored / 8 turns: preview and mounted size, style, units, formations, objectives, seeds and turn limit agree — observed: style TEMPERATE_INLAND; preview {"Scenario":"Meeting engagement","Map":"32×24","Units":"52","Objectives":"20 hexes · 48 VP (Allied 24 · Axis 24)","Divisions":"6 per side","Deployed hexes":"53","Rail Cap":"Allied 5 · Axis 5","Warnings":"0"} (Generate 455 ms, Start 290 ms); mounted 32×24, 53 occupied hexes, terrain mismatches 0; menu "Meeting engagement · 52 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476"; checks {"size":true,"terrain":true,"occupied":true,"units":true,"formations":true,"turns":true,"seeds":true}; objectives compared on the screenshots
- PASS NG-10: Configure, Map, OOB, Deployment and Gameplay show truthful current/completed states; no simultaneous "active" ambiguity — observed: Settings page strip (drawn true): Configure:is-active | Map:- | OOB:- | Deployment:- | Gameplay:-; during Preview the drawn loading steps went Map → Forces → Deployment → Scenario; Preview page strip (drawn false, otherwise read only by screen readers): Configure:is-complete | Map:is-complete | OOB:is-complete | Deployment:is-complete | Gameplay:-; during Start the drawn parts were loading[Session:is-active]; parts with more than one active step: 0. Pictures: the next two rows
- PASS NG-10 (loading page): The loading page lights one build step at a time, earlier steps are ticked and later ones still open (judged on the frames) — observed: 4 compositor frames at 6× slower CPU over 2938 ms: ng10-build-01.jpg, ng10-build-02.jpg, ng10-build-03.jpg, ng10-build-04.jpg; the step shown in each frame is read by eye, not by the script
- PASS NG-10 (start): While Start opens the previewed package the screen shows one current step and the finished steps before it (judged on the frames) — observed: 6 compositor frames at 6× slower CPU over 2352 ms: ng10-start-01.jpg, ng10-start-02.jpg, ng10-start-03.jpg, ng10-start-04.jpg, ng10-start-05.jpg, ng10-start-06.jpg; the step shown in each frame is read by eye, not by the script
- screenshot 14-ng07-preview.jpg
- screenshot 15-ng07-mounted.jpg
- PASS NG-07: Preview and mounted package agree: map size, terrain hex by hex, units, formations, seeds and turn limit; no frozen deployed-Hex or unit count — observed: Map 18×12 (expected 18×12), Divisions 4 per side (expected 4 per side); 216 hexes; Generate 454 ms, Start 179 ms; mounted checks {"size":true,"terrain":true,"occupied":true,"units":true,"formations":true,"turns":true,"seeds":true}; menu "Meeting engagement · 62 units · 8 formations · 3 turns · seeds map 91001, OOB 91002, deployment 91003, rules 91004"
- screenshot 16-ng08-mounted.jpg
- PASS NG-08: Map terrain/feature signature, OOB identity/stats, and deployment are identical from a fresh page — observed: preview terrain+features 948776828071a630, OOB 637593259ff5fa87, deployment 1100460776703fdc; equal {"terrainAndFeatures":true,"oob":true,"deployment":true,"mountedMap":true}
- PASS NG-09: Only the documented Map/OOB/deployment/rules dimension changes — observed: map seed +1 → changed map+deployment | oob seed +1 → changed oob | deployment seed +3 → changed deployment (seen on the mounted map) | rules seed +1 → changed nothing in the preview; mounted weather 1 Oct · Dry
- PASS UI-04(ng): No browser console or page error during the New Game run — observed: 0 errors

Ended at: Turn 1 / 3, Allied player turn, Movement

Console/page errors: 0

