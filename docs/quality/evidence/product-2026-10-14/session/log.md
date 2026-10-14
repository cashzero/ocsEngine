# doc 03 §D: SES-02 to SES-09

- screenshot 01-ses04-checkpoint-created.jpg
- screenshot 02-ses04-restored.jpg
- PASS SES-04: Revision/state return to checkpoint and play can continue — observed: checkpoints ["Restore Auto: start of Movement · Movement Segment (turn 1) · R0","Restore Revision 0 · R0"]; Brown TF Combat mode → (action: MOVE mode) Move mode → restored Combat mode; turn/seat/phase after restore "Turn 1 / 1 Allied player turn Movement" vs baseline "Turn 1 / 1 Allied player turn Movement"; logged operations after restore [] vs at the checkpoint [] (the restore adds its own notice); after restoring, the action works again (Move mode)
- screenshot 03-ses05-loaded.jpg
- PASS SES-05: Loaded revision, sequence, counters, active seat, and history agree with saved state — observed: save 1026933 bytes; at save Turn 1 / 1 Allied player turn Movement seat Allied commander, Brown TF Combat mode; after a change Move mode; after loading Turn 1 / 1 Allied player turn Movement seat Allied commander, Brown TF Combat mode; logged operations [changed to combat mode | changed to move mode] vs at save [changed to combat mode | changed to move mode] (the load adds its own notice)
- screenshot 04-ses02-handoff-prompt.jpg
- screenshot 05-ses03-privacy-screen.jpg
- screenshot 06-ses03-after-handoff.jpg
- PASS SES-02: Current player can identify the required handoff without opening unrelated tools — observed: prompt button "Hand the screen to Axis commander", text "HAND OVER Axis commander to act Continue their Player Turn: Movement · Movement Segment. Hand the screen to Axis commander"; menu open false
- PASS SES-03: Map/player projection is absent until next player confirmation — observed: privacy screen "HOT-SEAT PRIVACY Pass the screen to Axis commander Continue their Player Turn: Movement · Movement Segment. The map stays hidden until they confirm. I am Axis c", map visible false, own unit names in the page false; after confirming the seat is Axis commander (before Allied commander), map visible true
- screenshot 07-ses06-game-end.jpg
- PASS SES-06: Game End appears once with winner/draw, scores, reason, and final revision — observed: dialogs 1; "Draw"; scores Allied4 / Axis4; Result: TURN LIMIT · final revision 4
- PASS SES-07: Both files are nonempty, parseable, and reproduce the displayed final result — observed: final save 685216 bytes (parseable true), replay 171930 bytes (parseable true); loading the final save shows "Draw", Allied4 / Axis4, Result: TURN LIMIT · final revision 4 (displayed before: "Draw", Allied4 / Axis4, Result: TURN LIMIT · final revision 4); the replay file has no loader in the UI, so only that it parses is checked
- screenshot 08-ses08-new-game-from-end.jpg
- PASS SES-08: Fresh configuration opens; the finished session is not silently reused — observed: New Game opened on the "settings" page, status "Configure operation", preview shown false, Game End dialog still shown false; the finished game is replaced only by pressing Preview and Start
- screenshot 09-ses09-after-active-reload.jpg
- FAIL SES-09: Recovery behavior is explicit; no silent state substitution — observed: reload in setup (width typed 20): the New Game dialog is reopened (address kept #new-game) with its settings reset, the game behind it is "Meeting engagement · 52 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476"; reload during active play (Meeting engagement · 28 units · 4 formations · 1 turns · seeds map 7101, OOB 7102, deployment 7103, rules 7104, Turn 1 / 1 Movement, Move mode): the page shows "Meeting engagement · 52 units · 12 formations · 8 turns · seeds map 206569473, OOB 206569474, deployment 206569475, rules 206569476", Turn 1 / 8 Allied player turn Movement; any warning, banner or prompt: none; browser dialogs 0
- PASS UI-04(ses): No browser console or page error during the session run — observed: 0 errors

Ended at: Turn 1 / 8, Allied player turn, Movement

Console/page errors: 0

