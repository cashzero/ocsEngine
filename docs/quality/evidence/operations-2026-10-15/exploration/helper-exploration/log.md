# doc 03 acceptance session (1920×1080)

- screenshot 01-paused.jpg
- PASS SES-01: Pause refuses game actions and preserves the rule state — observed: {"paused":{"turn":"Turn 1 / 8","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":true,"notice":"Paused. Resume to continue.","handoff":false,"complete":false,"decision":[]},"hash":"sha256:fd8ef086fedab7ea5eaa50a0c03530d194627f34ad87f2a74a0bcc638757e2d4","before":"sha256:fd8ef086fedab7ea5eaa50a0c03530d194627f34ad87f2a74a0bcc638757e2d4"}
- screenshot 02-resumed.jpg
- PASS SES-01: Resume restores action availability with no state loss — observed: {"turn":"Turn 1 / 8","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Resumed.","handoff":false,"complete":false,"decision":[]}
- Package A:16x12 Compact,1 division,0 armor,seeds23111–23114,2 turns
- screenshot 03-package-a-preview.jpg
- screenshot 04-package-a-mounted.jpg
- Package B:18x12 Standard,2 divisions,1 armor,seeds7101–7104,1 turn
- screenshot 05-package-b-preview.jpg
- screenshot 06-handoff-privacy.jpg
- screenshot 07-final-result.jpg
- screenshot 08-save-restored.jpg
- screenshot 09-replay-restored.jpg
- PASS SES-07: Downloaded final save and replay both reproduce the final result through file selection — observed: {"before":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n9\nAxis\n9\n\nResult: TURN LIMIT · final revision 2\n\nDownload final save\nDownload replay\nView final map\nNew Game","loadedSave":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n9\nAxis\n9\n\nResult: TURN LIMIT · final revision 2\n\nDownload final save\nDownload replay\nView final map\nNew Game","loadedReplay":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n9\nAxis\n9\n\nResult: TURN LIMIT · final revision 2\n\nDownload final save\nDownload replay\nView final map\nNew Game","saveHash":"sha256:f856bb9ca45e7c3aedf794a98aba2a0cbef01dadfb7d468eba11e54c375a80da","replayHash":"sha256:f856bb9ca45e7c3aedf794a98aba2a0cbef01dadfb7d468eba11e54c375a80da"}
- Helper package:24x18 Standard,3 divisions,1 armor,seeds23101–23104,3 turns
- screenshot 10-helper-package-preview.jpg
- screenshot 11-helper-initial.jpg
- screenshot 12-eight-token-plan.jpg
- PASS SUP-B01: 8T preview lists a legal route, MP and destination stock without mutating the game — observed: Deliver 8T / 8T

Resulting stock at 0606: 20T. No state changed by this preview.

Legal alternatives: 06060708090907020711081108010712

Move generated-oob:23102:allied:independent-transport-1:unit via 0712 → 0811 → 0711 · 1 MP, 44 left
Load 8T onto generated-oob:23102:allied:independent-transport-1:unit · 5 MP, 39 left
Move generated-oob:23102:allied:independent-transport-1:unit via 0711 → 0811 → 0710 → 0809 → 0708 → 0707 → 0606 · 4 MP, 35 left
Unload 8T from generated-oob:23102:allied:independent-transport-1:unit · 5 MP, 30 left
Finish generated-oob:23102:allied:independent-transport-1:unit · 0 MP, 30 left

Current positions and visible information only: enemy action can cut or capture this route. Review the map before confirming.

Confirm 8T transport Cancel plan
- PASS SUP-B01: Cancel leaves authoritative stock and revision unchanged — observed: sha256:7847c368ccbc5a94d48adf9e4fe89c432007b53d8a052cc0e804f06b0fe6e768
- screenshot 13-transport-completed.jpg
- PASS SUP-B02: Confirmed transport delivers 8T and agrees with the preflight — observed: {"where":{"turn":"Turn 1 / 3","player":"Allied player turn","phase":"Movement","seat":"Allied commander","end":"End Movement SegmentNext: Barrage Segment","endDisabled":false,"notice":"Transport 8T: 5 steps completed; result matches the preview simulation.","handoff":false,"complete":false,"decision":[]},"hash":"sha256:e8364ded1185ba4f16944fb373c7b38037ac463534d2b943f6897f5bed952399","actions":[{"actionId":"logistics:0:0","actorId":"player:allied","expectedRevision":0,"kind":"MOVE_PIECE","path":["1,11","2,10","1,10"],"pieceId":"generated-oob:23102:allied:independent-transport-1:unit"},{"actionId":"logistics:1:1","actorId":"player:allied","dumpId":"generated-oob:23102:allied:independent-supply-1:unit","expectedRevision":1,"kind":"LOAD_SUPPLY","tokens":8,"truckId":"generated-oob:23102:allied:independent-transport-1:unit"},{"actionId":"logistics:2:2","actorId":"player:allied","expectedRevision":2,"kind":"MOVE_PIECE","path":["1,10","2,10","2,9","3,8","3,7","3,6","3,5"],"pieceId":"generated-oob:23102:allied:independent-transport-1:unit"},{"actionId":"logistics:3:3","actorId":"player:allied","expectedRevision":3,"kind":"UNLOAD_SUPPLY","tokens":8,"truckId":"generated-oob:23102:allied:independent-transport-1:unit"},{"actionId":"logistics:4:4","actorId":"player:allied","expectedRevision":4,"kind":"END_MOVE","pieceId":"generated-oob:23102:allied:independent-transport-1:unit"}]}
- screenshot 14-manual-transport-equivalent.jpg
- PASS SUP-B02: The same manual move/load/move/unload/finish has exactly the helper final state — observed: {"moved":{"moved":true,"preview":"","elapsed":417},"moved2":{"moved":true,"preview":"","elapsed":418},"manual":"sha256:e8364ded1185ba4f16944fb373c7b38037ac463534d2b943f6897f5bed952399","helper":"sha256:e8364ded1185ba4f16944fb373c7b38037ac463534d2b943f6897f5bed952399"}
- screenshot 15-invalid-unload.jpg
- PASS SUP-B04: Invalid unload destination names 13.2f and offers legal alternatives — observed: Deliver 0T / 8T

Resulting stock at 2418: 0T. No state changed by this preview.

Unloading needs a friendly combat unit or supply dump at the destination (13.2f). Choose one of the suggested legal hexes.

Legal alternatives: 12101012091307140813081207130712

Send available 0T Cancel plan
- screenshot 16-shortfall.jpg
- PASS SUP-B03: Oversized task reports deliverable stock, shortfall and alternatives — observed: Deliver 12T / 100T

Resulting stock at 0606: 24T. No state changed by this preview.

Can deliver 12T of 100T; short 88T. No available trucks; include more trucks or choose a nearer relay hex.

Legal alternatives: 06060708090907020711081108010712

Move generated-oob:23102:allied:independent-transport-1:unit via 0712 → 0811 → 0711 · 1 MP, 44 left
Load 12T onto generated-oob:23102:allied:independent-transport-1:unit · 5 MP, 39 left
Move generated-oob:23102:allied:independent-transport-1:unit via 0711 → 0811 → 0710 → 0809 → 0708 → 0707 → 0606 · 4 MP, 35 left
Unload 12T from generated-oob:23102:allied:independent-transport-1:unit · 5 MP, 30 left
Finish generated-oob:23102:allied:independent-transport-1:unit · 0 MP, 30 left

Current positions and visible information only: enemy action can cut or capture this route. Review the map before confirming.

Send available 12T Cancel plan
- screenshot 17-mp-shortfall.jpg
- PASS SUP-B03: A task exceeding remaining truck MP reports no delivery with the MP reason and legal alternatives — observed: Deliver 0T / 8T

Resulting stock at 0606: 12T. No state changed by this preview.

Can deliver 0T of 8T; short 8T. The source has no loadable stock, the truck has no free capacity, or loading exceeds its remaining MP (13.2f).

Legal alternatives: 06060708090907020711081108010712

Current positions and visible information only: enemy action can cut or capture this route. Review the map before confirming.

Send available 0T Cancel plan
- screenshot 18-fuel-comparison.jpg
- screenshot 19-fuel-paid.jpg
- PASS SUP-B05: Five selected formation units compare 1T single-unit with 4T formation and pay the recommended 4T — observed: {"estimate":"FUEL ESTIMATE\nChoose units (5)\n US 610 TD Bn\n US 628 TD Bn\n 30.Inf\n 26.Inf\n US 813 TD Bn\n US Garrison Bn\n US 702 Tk Bn\n US 736 Tk Bn\n US 745 Tk Bn\n US 775 Engr Gp\n US Garrison Bn\n 82 Recon Bn / 2.A\n US HQ 7th Corps\n 66 Arm Regt (Det. 2) / 2.A\n Div Arty I / 2.A\n 66 Arm Regt / 2.A\n 67 Arm Regt / 2.A\n US Garrison Bn\n US Garrison Bn\n US Garrison Bn\n US Garrison Bn\n\nRecommended payment 4T; 0 selected units cannot be fueled.\n\nCompare single-unit / formation / HQ payments\nFORMATION · Div Arty I / 2.A from generated-oob:23102:allied:independent-supply-1:unit\nPay estimated 4T","before":24,"after":20,"notice":"Fuel 4T: 1 steps completed; result matches the preview simulation."}
- screenshot 20-handoff-privacy.jpg
- PASS SUP-B08: Whole helper turn survives downloaded save and file load — observed: {"before":"sha256:37fd5e6f770da1ef341eba592089f192a8ed14a95b22c5ee5e81a2cb6d0f6b0a","after":"sha256:37fd5e6f770da1ef341eba592089f192a8ed14a95b22c5ee5e81a2cb6d0f6b0a","where":{"turn":"Turn 2 / 3","player":"Axis player turn","phase":"First Player Phase","seat":"Axis commander","end":"End First Player PhaseNext: Aircraft Refit Phase","endDisabled":true,"notice":"Save loaded at revision 7.","handoff":false,"complete":false,"decision":["Go first","Go second"]}}
- screenshot 21-handoff-privacy.jpg
- screenshot 22-helper-game-end.jpg
- PASS SUP-B08: The helper game completes through legal arrivals, decisions and handoffs, and the downloaded replay reproduces Game End — observed: {"finalText":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n14\nAxis\n14\n\nResult: TURN LIMIT · final revision 34\n\nDownload final save\nDownload replay\nView final map\nNew Game","replayed":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n14\nAxis\n14\n\nResult: TURN LIMIT · final revision 34\n\nDownload final save\nDownload replay\nView final map\nNew Game","hash":"sha256:2f7b14ffa1517f2b595b6fc6a63e58b09736a265510e4c0a5dcbc825da323c4c"}
- screenshot 23-helper-replayed-end.jpg
- Natural fuel-shortfall package:48x36 Compact,2 divisions,1 armor,seeds24113–24116,2 turns
- screenshot 24-shortfall-package-preview.jpg
- screenshot 25-natural-fuel-shortfall.jpg
- screenshot 26-shortfall-prefilled-plan.jpg
- PASS SUP-B06: A natural missing-fuel estimate prefills the transport destination and quantity and builds a legal plan — observed: {"estimate":"FUEL ESTIMATE\nChoose units (1)\n US Garrison Bn\n US Garrison Bn\n 9.Inf\n US 603 TD Bn\n US 737 Tk Bn\n US 747 Tk Bn\n Doan TF / 3.A\n Rich TF / 3.A\n Div Arty I / 3.A\n 83 Recon Bn / 3.A\n US Garrison Bn\n US Garrison Bn\n US Garrison Bn\n US 692 TD Bn\n US HQ 7th Corps\n US 573 Engr Gp\n US Garrison Bn\n\nRecommended payment 0T; 1 selected units cannot be fueled.\n\nCompare single-unit / formation / HQ payments\nPay estimated 0T\n\nDoan TF / 3.A: needs a reachable source. Plan 1T to 2027","input":{"destination":"2027","quantity":"1"},"plan":"Deliver 1T / 1T\n\nResulting stock at 2027: 1T. No state changed by this preview.\n\nLegal alternatives: 20272026102913171914111819112010\n\nMove generated-oob:24114:allied:independent-transport-1:unit via 1911 → 1811 → 1812 → 1913 → 1914 · 3 MP, 42 left\nLoad 1T onto generated-oob:24114:allied:independent-transport-1:unit · 5 MP, 37 left\nMove generated-oob:24114:allied:independent-transport-1:unit via 1914 → 2014 → 2114 → 2215 → 2216 → 2217 → 2218 → 2319 → 2220 → 2221 → 2222 → 2323 → 2324 → 2425 → 2326 → 2226 → 2126 → 2026 → 2027 · 9.5 MP, 27.5 left\nUnload 1T from generated-oob:24114:allied:independent-transport-1:unit · 5 MP, 22.5 left\nFinish generated-oob:24114:allied:independent-transport-1:unit · 0 MP, 22.5 left\n\nCurrent positions and visible information only: enemy action can cut or capture this route. Review the map before confirming.\n\nConfirm 1T transport Cancel plan"}
- Natural shortfall resolved through 1T helper delivery; final hash sha256:60e7b8acbb8da149ce3bfc0d56397bb09ac69331cf47cfe716805f7b2b585312
- Natural Supply package:48x36 Compact,2 divisions,1 armor,seeds24109–24112,2 turns
- screenshot 27-supply-package-preview.jpg
- screenshot 28-natural-supply-prediction.jpg
- screenshot 29-explicit-supply-need.jpg
- FAIL ACT-06: Natural generated garrison draws 1T during Supply; payment and history update — observed: {"supplyUI":"Pick formation trace routes and feed units out of trace supply; unfed units become Out of Supply when the phase ends (12.6).\n\nNo unit selected\n\nClick one of your units on the map, or open All units.\n\nSupply 1\nUnit\nLogistics\nLog\nAll units (39)\n\n1 unit out of trace supply now · 0 marked Out of Supply.\n\nOut of trace supply\n\nFeed a unit from a dump (1T per 2 RE) or leave it; unfed units become Out of Supply when the phase ends.\n\nII\n1\n1\n0\nUS Garrison Bn\n2325 · Combat mode\nFeed from 1T at 2325\nMovement · Movement Segment finished.","log":"Preview before spending. Estimates use current positions and stock; future enemy actions and new arrivals can change them.\n\nFUEL ESTIMATE\n\nFuel payments are made in a Movement Segment.\n\nSUPPLY PHASE PREDICTION\n\nMandatory internal-stock recovery is deducted first. Grouped payments shown below use the same ration rules as actual Supply.\n\nOut of trace: 0. Predicted Out of Supply after these payments: 0.\n\nApply recovery and predicted payments","notice":"Supply drawn from the dump."}
- PASS SUP-B07: Prediction of one out-of-trace but feedable unit agrees with actual 1T helper payment and the manual result — observed: {"before":"SUPPLY PHASE PREDICTION\n\nMandatory internal-stock recovery is deducted first. Grouped payments shown below use the same ration rules as actual Supply.\n\nOut of trace: 1. Predicted Out of Supply after these payments: 0.\n\nUS Garrison Bn · can be fed from dump\n\n1T from generated-oob:24110:allied:independent-supply-1:objective-stock-13 → US Garrison Bn","atSupply":"SUPPLY PHASE PREDICTION\n\nMandatory internal-stock recovery is deducted first. Grouped payments shown below use the same ration rules as actual Supply.\n\nOut of trace: 1. Predicted Out of Supply after these payments: 0.\n\nUS Garrison Bn · can be fed from dump\n\n1T from generated-oob:24110:allied:independent-supply-1:objective-stock-13 → US Garrison Bn\n\nApply recovery and predicted payments","manualHash":"sha256:6798ed4fb41994fc5a6f0e8f781b2c4874243a7a87d86dffbefeb59cc5f890b1","helperHash":"sha256:6798ed4fb41994fc5a6f0e8f781b2c4874243a7a87d86dffbefeb59cc5f890b1"}
- screenshot 30-handoff-privacy.jpg
- screenshot 31-supply-payment-history.jpg
- PASS ACT-06: Natural Supply payment updates authoritative state and visible history — observed: {"log":"You: check supply\nYou finished Movement · Movement Segment\n\nPassed automatically, no legal actions: Movement barrage segment.\n\nNow: Supply Phase · Allied commander.","before":"sha256:ad8420b58b119692ea732addf27503caa36915aa0901865139830e6848919280","after":"sha256:6798ed4fb41994fc5a6f0e8f781b2c4874243a7a87d86dffbefeb59cc5f890b1"}
- screenshot 32-handoff-privacy.jpg
- PASS SUP-B08: Natural Supply helper game finishes and its file replay reproduces the result — observed: {"finalText":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n50\nAxis\n50\n\nResult: TURN LIMIT · final revision 16\n\nDownload final save\nDownload replay\nView final map\nNew Game","replayed":"GAME END\n\nDraw\n\nThe operation ends without a sole winner.\n\nAllied\n50\nAxis\n50\n\nResult: TURN LIMIT · final revision 16\n\nDownload final save\nDownload replay\nView final map\nNew Game","hash":"sha256:4b4c464150f60505cdec992a074180c60929805435b2e20510bdd7a66eb7da42"}
- screenshot 33-supply-game-replayed.jpg

Ended at: Turn 2 / 2, Allied player turn, Game over Phase, final revision 16

Console/page errors: 0

