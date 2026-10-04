# doc 03 §B1: CTR-01 to CTR-07 at 1680×1050

- PASS CTR-01: Both sides expose the generated unit counters; HQ, combat, artillery, reconnaissance, engineer, transport and supply templates are visibly distinct (judged on ctr01-preview-*.png) — observed: 64 counters (32 Allied, 32 Axis); kinds/symbols per side {"ALLIED":["HQ/HQ","COMBAT/ARMOR","ARTILLERY/SP_ARTILLERY","COMBAT/RECON","COMBAT/AIRBORNE","COMBAT/INFANTRY","COMBAT/ENGINEER","TRANSPORT/TRUCK","SUPPLY/SUPPLY"],"AXIS":["HQ/HQ","COMBAT/ARMOR","ARTILLERY/ARTILLERY","COMBAT/RECON","COMBAT/INFANTRY","COMBAT/AIRBORNE","COMBAT/ENGINEER","TRANSPORT/TRUCK","SUPPLY/SUPPLY"]}; generic role-label/"?" fillers: 0
- PASS CTR-02: A basic combat counter shows designation, echelon, symbol, affiliation, CS, AR, MA/mobility, combat category and RE (when applicable) matching its definition — observed: Standish TF / 10.A preview tokens "III2F2 7414" vs definition (move face) "III 2 F2 7 4 14" (symbol ARMOR, mobility mobility:tracked, category MECH, showRe false); colour/symbol grammar judged on ctr01/ctr04 images
- PASS CTR-03: HQ, artillery, transport and supply counters use role-specific printed fields; not-applicable ratings are omitted — observed: HQ "XXX21 9-16" (expected XXX 21 9-16); artillery "III1F1 93214" (expected barrage-AR-range-MA III 1 F1 9 3 2 14); transport "545" (expected points MA 5 45); supply ["1 1 SP","2 1 SP","3 1 SP","4 1 SP"] (printed quantity 4 SP)
- FAIL RUN: The counter run completes — observed: mouse.move: Target crashed 
    at screenHexes (E:\work\ocsEngine\.claude\worktrees\todo-inventory-docs\scripts\product-acceptance\lib.mjs:160:26)
    at async hexOnScreen (E:\work\ocsEngine\.claude\worktrees\todo-inventory-docs\scripts\product-acceptance\lib.mjs:190:43)
    at async hexShot (E:\work\ocsEngine\.claude\worktrees\todo-inventory-docs\scripts\product-acceptance\run-counters.mjs:34:17)
    at async file:///E:/work/ocsEngine/.claude/worktrees/todo-inventory-docs/scripts/product-acceptance/run-counters.mjs:110:24
- PASS CTR-08: At 1680×1050: no uncaught error and no over-budget interaction (clipping judged on the images) — observed: console/page errors 0; timed []; over 1,500 ms: 0

Ended at: unknown

Console/page errors: 0

