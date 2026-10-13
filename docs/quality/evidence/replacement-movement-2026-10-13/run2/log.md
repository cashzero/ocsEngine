# Movable replacement units: actual UI acceptance

- First preview:  Preview ScenarioMeeting engagement Map18×12 Units43 Objectives3 hexes · 8 VP (4 each side) Preview readyStart plays exactly this package; Back returns to the settings. ConfigureMapOOBDeploymentGameplay ← Back Start this operation ✕ Scenario SituationMeeting engagementAllied attackAxis attack Both armies start about ten hexes apart and each holds the same objective VP. The side holding more VP when the last turn ends wins; equal VP is a draw. Only isolated objective garrisons start with 1T (0.25 SP) emergency supply, drawn from their side’s existing supply budget; key-point garrisons start connected to trace supply. Operational map TheaterWestern EuropeEastern Europe SeaNo seaAlong the flank An all-land map. Width Height Hexes across and down: 16–256 by 12–256. Order of battle ScaleCompactStandardLarge Divisions per side of which armored The other divisions are infantry, about one in four airborne. Each side receives Pax and Eq replacements every turn. Air forcesNone (ground duel)Fighters, bombers, Air Bases and aircraft reinforcements Game rules Turn limit Start monthSeptemberOctoberNovemberDecemberJanuaryFebruaryMarchApril The month sets the weather: September is always dry, autu
- screenshot 01-new-game-small-preview.jpg
- screenshot 02-new-game-small-started.jpg
- PASS REPL-05: The first fresh New Game completes Turn 1 with legal decisions and handoffs — observed: {"turn":"Turn 1 / 6","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Select a unit on the map to see where it can move and what it can attack.","handoff":false,"complete":false,"decision":[]} → {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":true,"notice":"Decision recorded.","handoff":false,"complete":false,"decision":[]}
- PASS REPL-07: Personnel replacements offers Reserve/Strat but no Combat Mode — observed: Mode Reserve Strat mode
- screenshot 03-pax-strat.jpg
- screenshot 04-pax-reserve.jpg
- screenshot 05-pax-move-preview.jpg
- PASS REPL-07: Personnel replacements moves to 1306 with its MP recorded — observed: Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Repl PAX 1 Axis Personnel replacements 1406 · Move mode · 1 Pax 5 MP left Done Unit Log All units (26) Mode Reserve Strat mode Mode changed to move. → Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Repl PAX 1 Axis Personnel replacements 1306 · Move mode · 1 Pax 4.5 MP left Done MOVED Unit Log All units (26) Click a highlighted hex to preview the move; darker hexes are out of reach. Moved to 1306.
- screenshot 06-pax-moved.jpg
- PASS REPL-08: Eq movement requires fuel — observed: Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Repl EQ 1 Axis Equipment replacements 1406 · Move mode · 1 Eq Needs fuel before it can move (12.5) Deselect Unit Log All units (26) Mode Reserve Strat mode Fuel 1 · What to fuel This unit only · 1T, this phase · fuels 1 2 · Pay from which dump Fuels 1 unit: Axis Equipment replacements 1406 the 16T dump at 1807 the 12T dump at 1306 the 12T dump at 1509 Hover a dump to see its hex on the map. Moved to 1306.
- screenshot 07-eq-move-preview.jpg
- PASS REPL-07: Equipment replacements moves to 1306 with its MP recorded — observed: Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Repl EQ 1 Axis Equipment replacements 1406 · Move mode · 1 Eq 10 MP left Deselect FUEL Unit Ledger Log All units (26) Mode Reserve Strat mode Fuel this unit for this phase (1T) from the 16T dump at 1807: done. → Move units one at a time: select a unit to see its range. Red rings mark overrun targets. Repl EQ 1 Axis Equipment replacements 1306 · Move mode · 1 Eq 9.5 MP left Done FUEL MOVED Unit Ledger Log All units (26) Click a highlighted hex to preview the move; darker hexes are out of reach. Moved to 1306.
- screenshot 08-eq-moved.jpg
- PASS REPL-05: The fresh New Game completes the entire turn containing replacement movement — observed: {"turn":"Turn 3 / 6","player":"Axis player turn","phase":"First Player Phase","seat":"Axis commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Your turn, Axis commander.","handoff":false,"complete":false,"decision":["Go first","Go second"]}
- screenshot 09-fresh-turn-completed.jpg
- Second, different Map/OOB preview:  Preview ScenarioMeeting engagement Map32×24 Units57 Objectives4 hexes · 12 VP (6 each side) Preview readyStart plays exactly this package; Back returns to the settings. ConfigureMapOOBDeploymentGameplay ← Back Start this operation ✕ Scenario SituationMeeting engagementAllied attackAxis attack Both armies start about ten hexes apart and each holds the same objective VP. The side holding more VP when the last turn ends wins; equal VP is a draw. Only isolated objective garrisons start with 1T (0.25 SP) emergency supply, drawn from their side’s existing supply budget; key-point garrisons start connected to trace supply. Operational map TheaterWestern EuropeEastern Europe SeaNo seaAlong the flank An all-land map. Width Height Hexes across and down: 16–256 by 12–256. Order of battle ScaleCompactStandardLarge Divisions per side of which armored The other divisions are infantry, about one in four airborne. Each side receives Pax and Eq replacements every turn. Air forcesNone (ground duel)Fighters, bombers, Air Bases and aircraft reinforcements Game rules Turn limit Start monthSeptemberOctoberNovemberDecemberJanuaryFebruaryMarchApril The month sets the weather: September is always dry, aut
- screenshot 10-new-game-large-preview.jpg
- screenshot 11-new-game-large-started.jpg
- FAIL REPL-07: Replacement movement acceptance finishes — observed: locator.waitFor: Timeout 8000ms exceeded.
Call log:
[2m  - waiting for locator('#close-utility').first() to be visible[22m

    at click (/home/cashlin/ocsEngine/scripts/air-acceptance/harness.mjs:119:17)
    at /home/cashlin/ocsEngine/scripts/replacement-acceptance/run-movement.mjs:68:9
- screenshot 12-failure.jpg
- PASS REPL-07: No browser page/console errors — observed: []

Ended at: Turn 1 / 8, Allied player turn, Movement

Console/page errors: 0
