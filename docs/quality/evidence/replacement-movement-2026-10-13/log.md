# Movable replacement units: actual UI acceptance

- First preview:  Preview ScenarioMeeting engagement Map18×12 Units43 Objectives3 hexes · 8 VP (4 each side) Preview readyStart plays exactly this package; Back returns to the settings. ConfigureMapOOBDeploymentGameplay ← Back Start this operation ✕ Scenario SituationMeeting engagementAllied attackAxis attack Both armies start about ten hexes apart and each holds the same objective VP. The side holding more VP when the last turn ends wins; equal VP is a draw. Only isolated objective garrisons start with 1T (0.25 SP) emergency supply, drawn from their side’s existing supply budget; key-point garrisons start connected to trace supply. Operational map TheaterWestern EuropeEastern Europe SeaNo seaAlong the flank An all-land map. Width Height Hexes across and down: 16–256 by 12–256. Order of battle ScaleCompactStandardLarge Divisions per side of which armored The other divisions are infantry, about one in four airborne. Each side receives Pax and Eq replacements every turn. Air forcesNone (ground duel)Fighters, bombers, Air Bases and aircraft reinforcements Game rules Turn limit Start monthSeptemberOctoberNovemberDecemberJanuaryFebruaryMarchApril The month sets the weather: September is always dry, autu
- screenshot 01-new-game-small-preview.jpg
- screenshot 02-new-game-small-started.jpg
- PASS REPL-05: The first fresh New Game completes Turn 1 with legal decisions and handoffs — observed: {"turn":"Turn 1 / 6","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Select a unit on the map to see where it can move and what it can attack.","handoff":false,"complete":false,"decision":[]} → {"turn":"Turn 2 / 6","player":"Axis player turn","phase":"Reinforcement","seat":"Axis commander","end":"End Reinforcement PhaseNext: Movement Phase","endDisabled":true,"notice":"Decision recorded.","handoff":false,"complete":false,"decision":[]}
- FAIL REPL-07: Replacement movement acceptance finishes — observed: TypeError: id.split is not a function
    at label (file:///home/cashlin/ocsEngine/scripts/replacement-acceptance/run-movement.mjs:11:43)
    at file:///home/cashlin/ocsEngine/scripts/replacement-acceptance/run-movement.mjs:53:18
- screenshot 03-failure.jpg
- PASS REPL-07: No browser page/console errors — observed: []

Ended at: Turn 2 / 6, Axis player turn, Movement

Console/page errors: 0
