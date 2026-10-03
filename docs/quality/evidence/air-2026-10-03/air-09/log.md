# AIR-09 whole air game, save/load and replay (3 turns)

- New Game: Standard scale, air forces + transports + support, 3 turns, seeds {"map":5101,"oob":5102,"deployment":5103,"rules":5104}
- PASS AIR-09: A whole game turn with air forces is completed through the deck (refits, sweeps, barrages, handoffs) — observed: now Turn 2 / 3; flights so far: Turn 1 Allied FIGHTER_SWEEP, Turn 1 Allied BARRAGE, Turn 1 Axis FIGHTER_SWEEP, Turn 1 Axis BARRAGE, Turn 2 Allied FIGHTER_SWEEP
- Saved Turn 2 / 3 Allied player turn Movement to docs\quality\evidence\air-2026-10-03\air-09\mid-game-save.json (684330 bytes)
- screenshot 01-mid-game-saved.jpg
- PASS AIR-09: Loading the mid-game save restores the saved turn, phase, seat, Log and stacks — observed: changed to "Movement · Barrage" then loaded (564 ms): Turn 2 / 3 Allied player turn Movement Allied commander; stacks equal true; log equal true (47 entries)
- screenshot 02-mid-game-loaded.jpg
- screenshot 03-game-end.jpg
- PASS AIR-09: The game reaches Game End with no dead end — observed: GAME END Draw The operation ends without a sole winner. Allied 0 Axis 0 Result: TURN LIMIT · final revision 120 Download final save Download replay View final map New Game
- Flights flown: Turn 1 Allied FIGHTER_SWEEP, Turn 1 Allied BARRAGE, Turn 1 Axis FIGHTER_SWEEP, Turn 1 Axis BARRAGE, Turn 2 Allied FIGHTER_SWEEP, Turn 2 Allied BARRAGE, Turn 2 Axis FIGHTER_SWEEP, Turn 2 Axis BARRAGE, Turn 3 Allied FIGHTER_SWEEP, Turn 3 Allied BARRAGE, Turn 3 Axis FIGHTER_SWEEP, Turn 3 Axis BARRAGE
- PASS AIR-09: The final save and the replay download as nonempty, parseable files — observed: final save 708047 bytes, replay 254357 bytes with 120 actions
- PASS AIR-09: Re-running the replay file reproduces its final state hash — observed: replayed ok; hash sha256:1eb9b99380d04f2b984c50e65e3a26fe31545f0680b46a6bef4482848971facf vs sha256:1eb9b99380d04f2b984c50e65e3a26fe31545f0680b46a6bef4482848971facf
- screenshot 04-final-save-loaded.jpg
- PASS AIR-09: Loading the final save shows the same Game End: winner, scores, reason and final revision — observed: GAME END Draw The operation ends without a sole winner. Allied 0 Axis 0 Result: TURN LIMIT · final revision 120 Download final save Download replay View final map New Game (1174 ms)
- PASS AIR-09: No browser console or page error during the run — observed: 0 errors
- Final: {"turn":"Turn 3 / 3","player":"Axis player turn","phase":"Game over Phase","seat":"Axis commander","end":"End Game over PhaseNext: Game end","endDisabled":true,"notice":"Save loaded at revision 120.","handoff":false,"complete":false,"decision":[]}

Ended at: Turn 3 / 3, Axis player turn, Game over Phase, final revision 120

Console/page errors: 0

