# Reinforcement percentage selectors and integrated entries

- PASS allied ratio is a labelled discrete selector: {"tag":"SELECT","options":[{"value":"0","text":"0% · 0 divisions"},{"value":"25","text":"25% · 2 divisions"},{"value":"50","text":"50% · 3 divisions"},{"value":"75","text":"75% · 5 divisions"}]}
- PASS axis ratio is a labelled discrete selector: {"tag":"SELECT","options":[{"value":"0","text":"0% · 0 divisions"},{"value":"25","text":"25% · 2 divisions"},{"value":"50","text":"50% · 3 divisions"},{"value":"75","text":"75% · 5 divisions"}]}
- PASS First turn stays empty while being edited:
- PASS Typing first turn 4 keeps 4:
- PASS Clearing turn limit preserves reinforcement settings:
- PASS Typing turn limit 10 preserves 75% / T3:
- PASS Committed short campaign fits to a listed percentage and retains T2 fitting:
- PASS An unplayable percentage is disabled:
- screenshot 01-short-campaign-options.jpg
- PASS Settings show actual whole-division counts and schedules: Whole divisions arrive one per Game Turn through ports or entry hexes; at least one starts on the map. The last arrival must have at least two Game Turns to play. After you finish editing, the first turn may move earlier (as early as Turn 2), then the percentage may decrease to fit. Disabled choices need more turns or divisions. Allied: 2 divisions, Turn 3–4 · Axis: 3 divisions, Turn 3–5.
- screenshot 02-settings.jpg
- PASS Preview generated: {"page":"preview","previewShown":true,"stripDrawn":false,"status":"Preview ready","hint":"Start plays exactly this package; Back returns to the settings.","stages":["Configure:is-complete","Map:is-complete","OOB:is-complete","Deployment:is-complete","Gameplay:-"],"start":{"disabled":false,"text":"Start this operation"},"stale":false,"error":"","fieldError":null}
- PASS Preview agrees with configured reinforcement counts: SCENARIO
Allied attack
MAP
28×20
UNITS
49
OBJECTIVES
6 hexes · 19 VP (Allied 3 · Axis 16) | Divisions
Allied 6 · Axis 4
Deployed hexes
34
Rail Cap
Allied 5 · Axis 3
Ports
3
Sea Cap
Allied 5
Reinforcement divisions
Allied 2 · Axis 3, from Turn 3
Warnings
0
- screenshot 03-preview.jpg
- Mounted package Allied attack · 49 units · 10 formations · 6 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476
- screenshot 04-started.jpg
- Moved XX 35 4 12 4 10 35.Inf 0206 · Move mode to 0205
- PASS A legal movement completed through the UI:
- screenshot 05-legal-move.jpg
- Phase {"turn":"Turn 1 / 6","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Moved to 0205.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 1 / 6","player":"Allied player turn","phase":"Movement · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Supply Phase","endDisabled":false,"notice":"Movement · Movement Segment finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 1 / 6","player":"Allied player turn","phase":"Exploitation · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Movement · Barrage Segment finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 1 / 6","player":"Axis player turn","phase":"Movement","seat":"Axis commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 1 / 6","player":"Axis player turn · Allied to act","phase":"Reaction · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Phase","endDisabled":false,"notice":"Your turn, Allied commander.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"First Player Phase","seat":"Axis commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":["Go first","Go second"]}
- Phase {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":true,"notice":"Decision recorded.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":false,"notice":"Supply dump placed at 2819.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"Movement","seat":"Axis commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Reinforcement Phase finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Axis player turn · Allied to act","phase":"Reaction · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Phase","endDisabled":false,"notice":"Your turn, Allied commander.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Reaction · Barrage Segment finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Allied player turn","phase":"Movement · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Supply Phase","endDisabled":false,"notice":"Movement · Movement Segment finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 2 / 6","player":"Allied player turn","phase":"Exploitation · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Segment","endDisabled":false,"notice":"Movement · Barrage Segment finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 3 / 6","player":"Axis player turn","phase":"First Player Phase","seat":"Axis commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":["Go first","Go second"]}
- Phase {"turn":"Turn 3 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":true,"notice":"Decision recorded.","handoff":false,"complete":false,"decision":[]}
- PASS First Axis reinforcement division appears at T3: [{"id":"generated-oob:206569474:axis:f2-combat-1:unit","text":"XX\n5\n4\n9\n3\n4\n5.FJ\noff map · Move mode · arriving"},{"id":"repl-arrival:player:axis:3","text":"Repl\nEQ\n1\nAxis Equipment replacements\noff map · Move mode · 1 Eq · arriving"},{"id":"repl-arrival:player:axis:3:pax","text":"Repl\nPAX\n1\nAxis Personnel replacements\noff map · Move mode · 1 Pax · arriving"},{"id":"supply-arrival:player:axis:3","text":"5 SP\nSupply dump\noff map · Supply · 20T (5 SP) · arriving"}]
- screenshot 06-land-ready.jpg
- PASS Axis divisional reinforcement enters legally and appears in the roster: XX
5
4
9
3
4
5.FJ
off map · Move mode · arriving
- screenshot 07-land-arrived.jpg
- Phase {"turn":"Turn 3 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":false,"notice":"Supply dump placed at 2819.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 3 / 6","player":"Axis player turn","phase":"Movement","seat":"Axis commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Reinforcement Phase finished.","handoff":false,"complete":false,"decision":[]}
- Phase {"turn":"Turn 3 / 6","player":"Axis player turn · Allied to act","phase":"Reaction · Barrage","seat":"Allied commander","end":"End Barrage SegmentNext: Combat Phase","endDisabled":false,"notice":"Your turn, Allied commander.","handoff":false,"complete":false,"decision":[]}
- PASS Completed full Game Turns 1 and 2 through handoffs and pending decisions: {"turn":"Turn 3 / 6","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Reaction · Barrage Segment finished.","handoff":false,"complete":false,"decision":[]}
- PASS A scheduled Allied division is available for shipping at T3: [{"id":"generated-oob:206569474:allied:f3-combat-1:unit","disabled":false,"text":"101.Abn\n2 Sea Cap"},{"id":"generated-oob:206569474:allied:independent-artillery-1:unit","disabled":false,"text":"US 255 FA Gp\n1/2 Sea Cap"},{"id":"generated-oob:206569474:allied:independent-transport-2:unit","disabled":false,"text":"Truck\n5 Sea Cap"},{"id":"repl-arrival:player:allied:2","disabled":false,"text":"Allied Equipment replacements\n1/4 Sea Cap"},{"id":"repl-arrival:player:allied:2:pax","disabled":false,"text":"Allied Personnel replacements\n1/4 Sea Cap"},{"id":"repl-arrival:player:allied:3","disabled":false,"text":"Allied Equipment replacements\n1/4 Sea Cap"},{"id":"repl-arrival:player:allied:3:pax","disabled":false,"text":"Allied Personnel replacements\n1/4 Sea Cap"},{"id":"repl-arrival:player:allied:3:pax:2","disabled":false,"text":"Allied Personnel replacements\n1/4 Sea Cap"}]
- screenshot 08-sea-ready.jpg
- PASS Shipped divisional unit is now in the serving roster: 101.Abn
2 Sea Cap
- screenshot 09-sea-arrived.jpg
- PASS No browser console or page errors: []

Ended at: Turn 3 / 6, Allied player turn, Movement

Console/page errors: 0
