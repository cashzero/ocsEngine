# AEP integrated player operation

- 16x12 / Compact / 1 infantry division / ground duel AEPs [{"hex":"-3,6","side":"FIRST"},{"hex":"12,6","side":"SECOND"}]
- screenshot 01-small-preview.jpg
- PASS AEP-01: Small generated map shows one AEP per side — observed: [{"hex":"-3,6","side":"FIRST"},{"hex":"12,6","side":"SECOND"}]
- screenshot 02-small-mounted.jpg
- 24x18 / Standard / 2 divisions, 1 armored / Axis attacks AEPs [{"hex":"-4,9","side":"FIRST"},{"hex":"19,9","side":"SECOND"}]
- screenshot 03-attack-preview.jpg
- PASS AEP-02: Different map/OOB preview and same mounted package expose friendly and enemy AEPs — observed: [{"hex":"-4,9","side":"FIRST"},{"hex":"19,9","side":"SECOND"}]
- PASS AEP-02: Mounted FIRST AEP 0110 announces owner and range origin — observed: Hex 0110 · woods · Allied Supply Source · Allied Air Entry Point (AEP): off-map aircraft enter here; range starts here +1 hex · no units
- screenshot 04-mounted-first-aep.jpg
- PASS AEP-02: Mounted SECOND AEP 2410 announces owner and range origin — observed: Hex 2410 · clear · Axis Supply Source · Axis Air Entry Point (AEP): off-map aircraft enter here; range starts here +1 hex · no units
- screenshot 05-mounted-second-aep.jpg
- PASS AEP-03: Off-map sortie panel identifies Axis AEP and counts range from it — observed: Air Barrage 1611
Off-map entry
AEP 2410 · range from nearest AEP +1 hex
Mission hex
1611
Table column
17-24 → 3-4
Shifts
Density -1, Terrain -1, No spotter -3, Short range +1
Barrage strength
17
Flak
+2 (Three or more aircraft +1, Enemy Patrol Zone, mission has a Fighter +1); 11+ on 2d6 costs a step
Enemy Patrol Zone
yes: an enemy Fighter may intercept

Tick up to 4 aircraft; they may come from different bases. Every mission aircraft becomes Inactive at a base afterwards.

F
Fw-190a
71
5
2
JG 27 Fw-190a
2207
T
Ju.88
106
(2)
12
KG 6 Ju.88
2207
F
Bf.109
76
5
1
JG 26 Bf.109
2203
F
Fw-190d
74
6
2
JG 53 Fw-190d
2203
T
Ju.88
106
(2)
9
KG 76 Ju.88
2203
F
Bf.109
76
4
1
JG 301 Bf.109
Axis off-map airfield
F
Fw-190a
71
4
2
JG 300 Fw-190a
Axis off-map airfield
F
Fw-190d
74
6
2
JG 53 Fw-190d
Axis off-map airfield
T
Ju.88
106
(2)
9
KG 76 Ju.88
Axis off-map airfield
T
Ju.88
106
(2)
12
KG 66 Ju.88
Axis off-map airfield
T
Ju.88
106
(2)
12
KG 51 Ju.88
Axis off-map airfield
Cancel
Fly Air Barrage
- screenshot 06-off-map-barrage-plan.jpg
- Allied commander (after a handoff): Enemy Air Barrage entering your Patrol Zone at 1611 with JG 27 Fw-190a (Air Combat 5), KG 6 Ju.88 (Air Combat (2)), JG 26 Bf.109 (Air Combat 5), JG 53 Fw-190d (Air Combat 6). Intercept with one Active Fighter? → Do not intercept
- Axis commander (after a handoff): JG 27 Fw-190a (Air Combat 5) returns to base and becomes Inactive: choose a friendly Air Base within 71 hexes of 1611. It took off from 2207. → Original Air Base at 2207 (8 hexes)
- Axis commander: KG 6 Ju.88 (Air Combat (2)) returns to base and becomes Inactive: choose a friendly Air Base within 106 hexes of 1611. It took off from 2207. → Original Air Base at 2207 (8 hexes)
- Axis commander: JG 26 Bf.109 (Air Combat 5) returns to base and becomes Inactive: choose a friendly Air Base within 76 hexes of 1611. It took off from 2203. → Original Air Base at 2203 (10 hexes)
- Axis commander: JG 53 Fw-190d (Air Combat 6) returns to base and becomes Inactive: choose a friendly Air Base within 74 hexes of 1611. It took off from 2203. → Original Air Base at 2203 (10 hexes)
- Off-map Barrage flown: 4111 ms including decisions [{"seat":"Allied commander","handedOver":true,"prompt":"Enemy Air Barrage entering your Patrol Zone at 1611 with JG 27 Fw-190a (Air Combat 5), KG 6 Ju.88 (Air Combat (2)), JG 26 Bf.109 (Air Combat 5), JG 53 Fw-190d (Air Combat 6). Intercept with one Active Fighter?","options":["Do not intercept","Intercept with 365th FG P-38 (Air Combat 5) from 1011","Intercept with 48th FG P-51 (Air Combat 6) from 1014","Intercept with 358th FG P-47 (Air Combat 5) from 1011"],"chosen":"Do not intercept"},{"seat":"Axis commander","handedOver":true,"prompt":"JG 27 Fw-190a (Air Combat 5) returns to base and becomes Inactive: choose a friendly Air Base within 71 hexes of 1611. It took off from 2207.","options":["Original Air Base at 2207 (8 hexes)","Air Base at 2203 (10 hexes)"],"chosen":"Original Air Base at 2207 (8 hexes)"},{"seat":"Axis commander","handedOver":false,"prompt":"KG 6 Ju.88 (Air Combat (2)) returns to base and becomes Inactive: choose a friendly Air Base within 106 hexes of 1611. It took off from 2207.","options":["Original Air Base at 2207 (8 hexes)","Air Base at 2203 (10 hexes)"],"chosen":"Original Air Base at 2207 (8 hexes)"},{"seat":"Axis commander","handedOver":false,"prompt":"JG 26 Bf.109 (Air Combat 5) returns to base and becomes Inactive: choose a friendly Air Base within 76 hexes of 1611. It took off from 2203.","options":["Original Air Base at 2203 (10 hexes)","Air Base at 2207 (8 hexes)"],"chosen":"Original Air Base at 2203 (10 hexes)"},{"seat":"Axis commander","handedOver":false,"prompt":"JG 53 Fw-190d (Air Combat 6) returns to base and becomes Inactive: choose a friendly Air Base within 74 hexes of 1611. It took off from 2203.","options":["Original Air Base at 2203 (10 hexes)","Air Base at 2207 (8 hexes)"],"chosen":"Original Air Base at 2203 (10 hexes)"}]
- screenshot 07-off-map-barrage-result.jpg
- FAIL AEP: Integrated AEP flow completes — observed: locator.innerText: Timeout 30000ms exceeded.
Call log:
[2m  - waiting for locator('.command-deck')[22m

    at /home/cashlin/ocsEngine/scripts/air-acceptance/run-aep.mjs:43:53
- screenshot 08-failure.jpg

Ended at: Turn 1 / 8, Axis player turn, Movement · Barrage

Console/page errors: 0

