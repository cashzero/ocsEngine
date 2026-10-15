# NG-12: attack off-map sortie, entire turn and free refit

- 16x12 / Compact / 1 infantry division / ground duel AEPs [{"hex":"-3,6","side":"FIRST"},{"hex":"12,6","side":"SECOND"}]
- screenshot 01-small-preview.jpg
- PASS AEP-01: Small generated map shows one AEP per side — observed: [{"hex":"-3,6","side":"FIRST"},{"hex":"12,6","side":"SECOND"}]
- screenshot 02-small-mounted.jpg
- PASS NG-12: Visible attack help names off-map aircraft and airfield — observed: Settings
Configure operation

Set the map and force options, then press Preview.

Configure
Map
OOB
Deployment
Gameplay
Preview →
✕
Scenario
SITUATION
Meeting engagement
Allied attack
Axis attack

Allied holds most of the map and the attack objectives, with its line in Combat Mode, with garrisons dug into hedgehogs on its objectives (Level 2) and on key rail towns and road junctions (Level 1); Axis also holds VP at its own ports and fields 1.5 times the divisions plus off-map air (Fighters and Tactical Bombers at an airfield off the map, flying in over its own map edge and back), assembles a few hexes away and moves first. Axis wins by holding its starting VP plus at least half the defender’s starting VP (rounded up) when the last turn ends; otherwise Allied wins. Only isolated objective garrisons start with 1T (0.25 SP) emergency supply, drawn from their side’s existing supply budget; key-point garrisons start connected to trace supply.

Operational map
THEATER
Western Europe
Eastern Europe
SEA
No sea
Along the flank

An all-land map.

WIDTH
HEIGHT

Hexes across and down: 16–256 by 12–256.

Order of battle
SCALE
Compact
Standard
Large
DIVISIONS PER SIDE
OF WHICH ARMORED

The other divisions are infantry, about one in four airborne. Each side receives Pax and Eq replacements every turn.

ALLIED REINFORCEMENTS
0% · 0 divisions
25% · 1 division
50% · 1 division
75% · 1 division
AXIS REINFORCEMENTS
0% · 0 divisions
25% · 1 division
50% · 2 divisions
75% · 2 divisions
FIRST ARRIVAL TURN

Whole divisions arrive one per Game Turn through ports or entry hexes; at least one starts on the map. The last arrival must have at least two Game Turns to play. After you finish editing, the first turn may move earlier (as early as Turn 2), then the percentage may decrease to fit. Disabled choices need more turns or divisions. Allied: none · Axis: none.

AIR FORCES
None (ground duel)
Fighters, bombers, Air Bases and aircraft reinforcements
AIR TRANSPORT
None
Transports and a paratroop battalion per side
Game rules
TURN LIMIT
START MONTH
September
October
November
December
January
February
March
April

The month sets the weather: September is always dry, autumn brings mud, and midwinter snow.

ALLIED RAIL CAP
AXIS RAIL CAP

SP or RE each side can move by rail every Movement Phase (13.3b), from the map edge to its railhead; trucks carry supply on to the front. Default: 0.75 point per division.

Reproducible seeds
MAP
OOB
DEPLOYMENT
RULES
Randomize all seeds
- screenshot 03-attack-air-settings.jpg
- PASS NG-12: Preview distinguishes off-map airfield — observed: AXIS
300 points
HQ
1 units
9.SS
5 units · armored
3.PG
5 units · mobile infantry
5.FJ
1 units · airborne
18 independent support / logistics units
Air forces: 16 aircraft, off-map airfield, 2 Air Base(s)
- 24x18 / Standard / 2 divisions, 1 armored / Axis attacks AEPs [{"hex":"-4,9","side":"FIRST"},{"hex":"19,9","side":"SECOND"}]
- screenshot 04-attack-preview.jpg
- PASS AEP-02: Different map/OOB preview and same mounted package expose friendly and enemy AEPs — observed: [{"hex":"-4,9","side":"FIRST"},{"hex":"19,9","side":"SECOND"}]
- screenshot 05-off-map-air-roster.jpg
- PASS NG-12: Attacker roster exposes the off-map aircraft; every listed aircraft remains in its off-map box — observed: {"offmap":[{"id":"generated-oob:13202:axis:off-map-fighter-2:unit","text":"F\nFw-190a\n71\n4\n2\nJG 300 Fw-190a\nAxis off-map airfield · Active"},{"id":"generated-oob:13202:axis:off-map-fighter-1:unit","text":"F\nBf.109\n76\n4\n1\nJG 301 Bf.109\nAxis off-map airfield · Active"},{"id":"generated-oob:13202:axis:off-map-fighter-3:unit","text":"F\nFw-190d\n74\n6\n2\nJG 53 Fw-190d\nAxis off-map airfield · Active"},{"id":"generated-oob:13202:axis:off-map-bomber-3:unit","text":"T\nJu.88\n106\n(2)\n12\nKG 51 Ju.88\nAxis off-map airfield · Active"},{"id":"generated-oob:13202:axis:off-map-bomber-2:unit","text":"T\nJu.88\n106\n(2)\n12\nKG 66 Ju.88\nAxis off-map airfield · Active"},{"id":"generated-oob:13202:axis:off-map-bomber-1:unit","text":"T\nJu.88\n106\n(2)\n9\nKG 76 Ju.88\nAxis off-map airfield · Active"}],"locations":[{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"},{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"},{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"},{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"},{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"},{"boxId":"box:generated:axis-off-map-airfield","kind":"OFF_MAP_BOX"}]}
- PASS AEP-02: Mounted FIRST AEP 0110 announces owner and range origin — observed: Hex 0110 · woods · Allied Supply Source · Allied Air Entry Point (AEP): off-map aircraft enter here; range starts here +1 hex · no units
- screenshot 06-mounted-first-aep.jpg
- PASS AEP-02: Mounted SECOND AEP 2410 announces owner and range origin — observed: Hex 2410 · clear · Axis Supply Source · Axis Air Entry Point (AEP): off-map aircraft enter here; range starts here +1 hex · no units
- screenshot 07-mounted-second-aep.jpg
- PASS AEP-03: Off-map sortie panel identifies Axis AEP and counts range from it — observed: Air Barrage 0614
Off-map entry
AEP 2410 · range from nearest AEP +1 hex
Mission hex
0614
Table column
17-24 → 1 or less
Shifts
Density -1, Terrain -1, Hedgehog L2 -1, No spotter -3
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
- screenshot 08-off-map-barrage-plan.jpg
- Allied commander (after a handoff): Enemy Air Barrage entering your Patrol Zone at 0614 with JG 301 Bf.109 (Air Combat 4), JG 300 Fw-190a (Air Combat 4). Intercept with one Active Fighter? → Do not intercept
- Off-map Barrage flown: 5865 ms including decisions [{"seat":"Allied commander","handedOver":true,"prompt":"Enemy Air Barrage entering your Patrol Zone at 0614 with JG 301 Bf.109 (Air Combat 4), JG 300 Fw-190a (Air Combat 4). Intercept with one Active Fighter?","options":["Do not intercept","Intercept with 365th FG P-38 (Air Combat 5) from 1011","Intercept with 48th FG P-51 (Air Combat 6) from 1014","Intercept with 358th FG P-47 (Air Combat 5) from 1011"],"chosen":"Do not intercept"}]
- screenshot 09-off-map-barrage-result.jpg
- Barrage log: Allied commander made a decision
No interception.
Flak: 9 (roll 8 +1), no effect.
Barrage 3 on the 3-4 column, shifted to 1 or less: roll 7, -, no effect.
You flew barrage at 0614
You finished Movement · Movement Segment

Now: Movement · Barrage Segment · Axis commander.

You finished Aircraft Refit Phase

Passed automatically, no legal actions: Reinforcement, Movement breakout segment.

Now: Movement · Movement Segment · Axis commander.
- PASS AEP-03: Legal off-map barrage resolves through actual decisions — observed: {"turn":"Turn 1 / 8","player":"Axis player turn","phase":"Movement · Barrage","seat":"Axis commander","end":"End Barrage SegmentNext: Supply Phase","endDisabled":false,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":[]}
- screenshot 10-whole-turn-complete-refit.jpg
- PASS NG-12: After the entire first turn, off-map survivors refit at their own airfield without spending SP — observed: {"refitText":"Off-map airfield · refits every aircraft from its own stocks, no SP · no Active limit\nF\nBf.109\n76\n4\n1\nINACTIVE\nJG 301 Bf.109\nF\nFw-190a\n71\n4\n2\nINACTIVE\nJG 300 Fw-190a\nRefit 2","before":28,"after":28,"where":{"turn":"Turn 2 / 8","player":"Axis player turn","phase":"Aircraft Refit Phase","seat":"Axis commander","end":"End Aircraft Refit PhaseNext: Reinforcement Phase","endDisabled":false,"notice":"Refit 2 aircraft at the off-map airfield, from its own stocks.","handoff":false,"complete":false,"decision":[]}}
- screenshot 11-off-map-refit-no-sp.jpg
- PASS AEP-04: Entire first Game Turn and required handoffs complete; flown off-map aircraft refit next turn — observed: {"turn":"Turn 2 / 8","player":"Axis player turn","phase":"Aircraft Refit Phase","seat":"Axis commander","end":"End Aircraft Refit PhaseNext: Reinforcement Phase","endDisabled":false,"notice":"Refit 2 aircraft at the off-map airfield, from its own stocks.","handoff":false,"complete":false,"decision":[]}, 1 refits
- Final revision from visible checkpoint: Restore Revision 18 · R18
- screenshot 12-final-revision.jpg
- PASS AEP-05: No browser console/page errors — observed: 0

Ended at: Turn 2 / 8, Axis player turn, Aircraft Refit Phase

Console/page errors: 0

