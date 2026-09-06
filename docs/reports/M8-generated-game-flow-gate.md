# M8 generated game-flow gate

Status: **IN PROGRESS (2026-09-04)**.

The original Large-OOB stall is fixed and the main real-browser turn gate now passes. M8 remains open because real save/load, Game End/final-download, narrow-layout interaction, invalid-input, and remaining rows in `docs/quality/03-product-operation-verification-plan.md` have not yet all been exercised.

The 2026-09-04 counter review also invalidated any interpretation of piece-glyph
presence as printed OCS counter fidelity. M8 cannot complete until CTR-01 through CTR-08
are exercised against the integrated flow.

Validated path:

```text
New Game -> Random Map -> Random OOB -> deterministic deployment
         -> valid Scenario -> ACTIVE Gameplay -> COMPLETE/FINISHED
         -> Game End data -> final save reload + replay
```

Evidence:

- focused Vitest: 3 generated-flow tests pass;
- headless: a generated turn-limit-one game accepts sequence actions until `FINISHED`, reports `TURN_LIMIT`, reloads the final save with identical victory, and exports replay actions;
- browser: New Game modal displays all five stages; a 14×10 request with independent seeds 1001/1002/1003/1004 replaces the active game and displays the resulting 26-unit, four-formation generated package;
- UI contract: production browser imports no Rule/Scenario test fixture and includes final save/replay/New Game result actions;
- package gate: `npm run check` passes typecheck, 31 test files / 151 tests, production build and distribution smoke test.
- combined browser preview: 216 Map Hexes, road/river/settlement/objective layers, both OOB sides, six deployment/summary metrics, and stages 1–4 active before Gameplay;
- option change visibly invalidates Start; rebuilding width 16 then starting mounts a 16×12 / 192-Hex active session;
- the rebuilt preview terrain signature equals the mounted active-map terrain signature Hex by Hex, generated projected-piece glyphs are present, and browser errors are zero; this presence check does not prove printed counter fidelity;
- standalone player-facing Map/OOB laboratories and per-Hex terrain-name labels are absent.

Current real-browser evidence (2026-09-03):

- `scripts/ui-flow-gate.mjs` starts the exact previewed Map/OOB/deployment package for default, Large, and contact cases;
- default and Large each complete Turn 1 and enter Turn 2 through five visible privacy handoffs;
- the contact case reaches Turn 4 and visibly operates reinforcement, mode change, movement, supply, reserve release, regular combat, overrun, artillery barrage, transaction commit/cancel, seven decisions, and nineteen handoffs;
- maximum measured selection/execution latency was below the 1,000/1,500 ms budgets, minimum visible font size was 13 px, and browser error count was zero;
- the gate report returned `passed: true`; generated screenshots and JSON are local ignored artifacts under `tmp/ui-flow-gate/`.

Current decision: M8 remains `IN PROGRESS`. AI is blocked until every P0 product-operation row passes and no blocking P1 issue remains.
