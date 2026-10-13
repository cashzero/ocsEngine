# NG-13 Hedgehogs

- New Game: Axis attack, 24×16, Compact, 3 divisions (1 armored), no air forces (the attacker's off-map air comes with the situation), 3 turns, seeds {"map":8801,"oob":8802,"deployment":8803,"rules":8804}
- PASS NG-13: The New Game help names the defender's hedgehogs and their Levels — observed: ConfigureMapOOBDeploymentGameplay ← Back Start this operation ✕ Scenario SituationMeeting engagementAllied attackAxis attack Allied holds most of the map and every objective, its line in Combat Mode, with garrisons dug into hedgehogs on its objectives (Level 2) and on key rail towns and road junctions (Level 1);
- screenshot 01-started.jpg
- PASS NG-13: The attacker sees the defender's hedgehogs with their Level on the map — observed: 5 enemy hedgehogs: L2@0402 L1@1305 L1@1308 L2@0209 L2@0410
- screenshot 02-attacker-sees-hedgehogs.jpg
- PASS NG-13: The defender sees the same hedgehogs as its own — observed: 5 own hedgehogs
- PASS NG-13: A unit's Unit tab offers digging in with its cost, dumps and crew — observed: Chmbln TF / 10.A, 1613: "Build a Level 1 hedgehog at 1613 (2 SP from the 12T dump at 1508; crew Chmbln TF / 10.A cannot move this phase)"
- screenshot 03-dig-in-offered.jpg
- PASS NG-13: Digging in puts a Level 1 hedgehog on the map at once — observed: notice "Build a Level 1 hedgehog at 1613 (2 SP from the 12T dump at 1508; crew Chmbln TF / 10.A cannot move this phase): done." (558 ms); map L1 at 1613
- PASS NG-13: The supply ledger shows the 8T (2 SP) paid — observed: 8T paid
- screenshot 04-dug-in.jpg
- PASS NG-13: An Engineer-Capable HQ offers to build a hedgehog within 2 hexes — observed: US HQ 20th Corps, 1308: Build a hedgehog… (30 hexes)
- PASS NG-13: The Construction plan prices the hedgehog at 8T (2 SP) — observed: 1611: HEDGEHOG: Build a Level 1 hedgehog · 8T (2 SP)
- screenshot 05-engineer-hedgehog-option.jpg
- PASS NG-13: The engineer's hedgehog appears on the map — observed: L1@1611
- PASS NG-13: Game Turn 1 ends and Turn 2 begins — observed: Turn 2 / 3, Allied player turn, First Player Phase
- PASS NG-13: A unit in a hedgehog hex offers reducing it, free, with the crew named — observed: US HQ 20th Corps, 1308: "Reduce the hedgehog at 1308 (it is removed) (no SP; crew US Garrison Bn, US HQ 20th Corps cannot move this phase)"
- screenshot 06-reduce-offered.jpg
- PASS NG-13: The reduced hedgehog at 1308 is removed on the map — observed: no hedgehog
- screenshot 07-reduced.jpg
- PASS NG-13: An attacking unit can reach a hex next to a hedgehog — observed: I/16 Pz Bn / 116.Pz, 2015 to 1612, next to 1613
- PASS NG-13: The attack sheet names the hedgehog's −Level combat DRM, −1 Surprise and Heavy AT — observed: Hedgehog Level 1: −1 combat roll, −1 Surprise, Heavy AT
- screenshot 08-attack-sheet.jpg
- attack resolved: 
- screenshot 09-attack-resolved.jpg
- PASS NG-13: The turn containing the attack completes through all decisions and handoffs — observed: {"turn":"Turn 3 / 3","player":"Allied player turn","phase":"First Player Phase","seat":"Allied commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Your turn, Allied commander.","handoff":false,"complete":false,"decision":["Go first","Go second"]}
- PASS NG-13: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 3 / 3, Allied player turn, First Player Phase

Console/page errors: 0

