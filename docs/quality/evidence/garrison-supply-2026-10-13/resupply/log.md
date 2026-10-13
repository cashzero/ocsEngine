# Garrison emergency supply UI

- Inputs: {"engagement":"AXIS_ATTACKS","style":"EASTERN_EUROPE","width":24,"height":16,"scale":"COMPACT","divisions":3,"armored":1,"air":"NONE","turnLimit":3,"seeds":{"map":14,"oob":8802,"deployment":8803,"rules":8804}}
- Generate: {"elapsed":580,"state":{"status":"Preview ready","hint":"Start plays exactly this package; Back returns to the settings.","stages":["Configure:is-complete","Map:is-complete","OOB:is-complete","Deployment:is-complete","Gameplay:-"],"start":{"disabled":false,"text":"Start this operation"},"stale":false,"error":"","fieldError":null}}
- Preview: {"metrics":{"Scenario":"Axis attack","Map":"24×16","Units":"50","Objectives":"4 hexes · 4 VP (all held by Allied)","Divisions":"Allied 3 · Axis 5","Deployed hexes":"33","Rail Cap":"Allied 2 · Axis 4","Warnings":"1"},"terrainHash":"a7112a43901de9db","deploymentHash":"6f25337bb2ac3ff9","warnings":"1 generation warning(s)"}
- screenshot 01-preview.jpg
- screenshot 02-started.jpg
- Pick formation trace routes and feed units out of trace supply; unfed units become Out of Supply when the phase ends (12.6).
No unit selected
Click one of your units on the map, or open All units.
Supply 2
Unit
Log
All units (20)
2 units out of trace supply now · 0 marked Out of Supply.
Out of trace supply
Feed a unit from a dump (1T per 2 RE) or leave it; unfed units become Out of Supply when the phase ends.
II
1
1
0
US Garrison Bn
1015 · Combat mode
Feed from 12T at 0813
Feed from 1T at 1015
Feed from 1T at 1214
II
1
1
0
US Garrison Bn
1214 · Combat mode
Feed from 12T at 0813
Feed from 1T at 1015
Feed from 1T at 1214
Movement · Movement Segment finished.
- PASS GS-FEED: Isolated VP garrisons have an available feeding payment — observed: Feed from 12T at 0813 | Feed from 1T at 1015 | Feed from 1T at 1214 | Feed from 12T at 0813 | Feed from 1T at 1015 | Feed from 1T at 1214
- screenshot 03-supply-before.jpg
- PASS GS-CONSUME: Feeding from the 1T emergency stock removes one garrison from the unfed list — observed: 2 → 1
- PASS GS-STOCK: The consumed 1T stock is no longer offered — observed: false
- Pick formation trace routes and feed units out of trace supply; unfed units become Out of Supply when the phase ends (12.6).
No unit selected
Click one of your units on the map, or open All units.
Supply
Unit
Ledger
Log
All units (20)
0 units out of trace supply now · 0 marked Out of Supply.
Supply drawn from the dump.
- screenshot 04-supply-after.jpg
- PASS GS-TURN: The same generated package reaches Turn 2 through legal supply payments and handoffs — observed: {"turn":"Turn 2 / 3","player":"Allied player turn","phase":"First Player Phase","seat":"Allied commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Your turn, Allied commander.","handoff":false,"complete":false,"decision":["Go first","Go second"]}
- screenshot 05-turn2.jpg
- PASS GS-DECISION: The next first-player decision resolves through its visible choice — observed: {"turn":"Turn 2 / 3","player":"Allied player turn","phase":"Reinforcement","seat":"Allied commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":true,"notice":"Decision recorded.","handoff":false,"complete":false,"decision":[]}
- Truck to rear dump: {"moved":true,"preview":"","elapsed":427}
- Trucks 5 truck points · carrying 1/20T · 29 MP left This truck is mid-move. Finish with it before moving another unit, or it loses its remaining MP and load (6.1g) 6.1g Dump here · 11T (2.75 SP) Tokens Load 1–11T · costs 5 MP, 24 MP left afterwards Carrying 1T (0.25 SP) Tokens Unload 1–1T · costs 5 MP, 24 MP left afterwards Split the counter Points Split off No MP cost (13.2c)
- screenshot 06-truck-loaded.jpg
- Truck to isolated VP: {"moved":true,"preview":"","elapsed":431}
- PASS GS-DELIVERY: A truck loads existing rear supply, moves to the isolated VP and unloads 1T — observed: Trucks 5 truck points · carrying 0/20T · 22.5 MP left This truck is mid-move. Finish with it before moving another unit, or it loses its remaining MP and load (6.1g) 6.1g Dump here · 1T (0.25 SP) Load SP unloaded this phase cannot be loaded again this phase. 12.2a Split the counter Points Split off No MP cost (13.2c) Form an Extender here (half MA; a trace supply source, 20 Truck MP back)
- screenshot 07-truck-delivered.jpg
- PASS GS-RESUPPLY: After its emergency stock is exhausted, the VP garrison can eat delivered supply — observed: 2 → 1
- screenshot 08-resupplied.jpg
- PASS GS-ERRORS: No console or page errors — observed: 0

Ended at: Turn 2 / 3, Allied player turn, Supply

Console/page errors: 0

