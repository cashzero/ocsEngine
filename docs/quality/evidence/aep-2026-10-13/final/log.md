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
- Deselected on-map aircraft; only two off-map aircraft selected
- screenshot 06-off-map-barrage-plan.jpg
- Allied commander (after a handoff): Enemy Air Barrage entering your Patrol Zone at 1611 with JG 301 Bf.109 (Air Combat 4), JG 300 Fw-190a (Air Combat 4). Intercept with one Active Fighter? → Do not intercept
- Off-map Barrage flown: 3998 ms including decisions [{"seat":"Allied commander","handedOver":true,"prompt":"Enemy Air Barrage entering your Patrol Zone at 1611 with JG 301 Bf.109 (Air Combat 4), JG 300 Fw-190a (Air Combat 4). Intercept with one Active Fighter?","options":["Do not intercept","Intercept with 365th FG P-38 (Air Combat 5) from 1011","Intercept with 48th FG P-51 (Air Combat 6) from 1014","Intercept with 358th FG P-47 (Air Combat 5) from 1011"],"chosen":"Do not intercept"}]
- screenshot 07-off-map-barrage-result.jpg
- Barrage log: Allied commander made a decision
No interception.
Flak: 9 (roll 8 +1), no effect.
Barrage 3 on the 3-4 column, shifted to 1 or less: roll 7, -, no effect.
You flew barrage at 1611
You finished Movement · Movement Segment

Now: Movement · Barrage Segment · Axis commander.

You finished Aircraft Refit Phase

Passed automatically, no legal actions: Reinforcement, Movement breakout segment.

Now: Movement · Movement Segment · Axis commander.
- PASS AEP-03: Legal off-map barrage resolves through actual decisions — observed: {"turn":"Turn 1 / 8","player":"Axis player turn","phase":"Movement · Barrage","seat":"Axis commander","end":"End Barrage SegmentNext: Supply Phase","endDisabled":false,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":[]}
- screenshot 08-whole-turn-complete-refit.jpg
- PASS AEP-04: Entire first Game Turn and required handoffs complete; flown off-map aircraft refit next turn — observed: {"turn":"Turn 2 / 8","player":"Axis player turn","phase":"Aircraft Refit Phase","seat":"Axis commander","end":"End Aircraft Refit PhaseNext: Reinforcement Phase","endDisabled":false,"notice":"Refit 2 aircraft at the off-map airfield, from its own stocks.","handoff":false,"complete":false,"decision":[]}, 1 refits
- Final revision from visible checkpoint: Restore Revision 18 · R18
- screenshot 09-final-revision.jpg
- PASS AEP-05: No browser console/page errors — observed: 0

Ended at: Turn 2 / 8, Axis player turn, Aircraft Refit Phase

Console/page errors: 0

