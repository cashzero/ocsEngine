# Computer players in the UI, 2026-10-15

Acceptance rows BOT-01 to BOT-11 of `docs/quality/03-product-operation-verification-plan.md` §K.

- **Commit under test:** `3d6c5ee` (source identical to `f6243b0`; later commits only changed the acceptance script).
- **Boundary:** the built application (`npm run build`) served locally and operated in Playwright Chromium, 1920×1080, by
  `scripts/product-acceptance/run-computer.mjs` (every step is a click, a selection or a typed value on a visible control; every
  observation is read from the page) and `run-computer-scale.mjs`. Screenshots were reviewed in `artifacts/` (not committed).
- **Console / page errors:** 0 in every run.
- **Machine:** WSL2, Node 22; other work was running during some runs, which moves the timings below (the default-size game took
  28 s, 62 s and 85 s in three runs).

## Inputs

| Part | Operation | Settings | Seeds (map/OOB/deployment/rules) |
|---|---|---|---|
| A | Person (Allied) against computer (Axis) | 16×12, Compact, 2 divisions (1 armored), 6 turns | 94001–94004 |
| B, C | Computer against computer | same | 94101–94104 |
| D | Person (Allied) against computer (Axis) | same | 94201–94204 |
| scale | Computer against computer | the default operation: 32×24, Compact, 6 divisions (2 armored), 8 turns | defaults |

## Results (`results.json`, `extra.json`)

| Row | Observed |
|---|---|
| BOT-01 | Players box set to Allied Player / Axis Computer; the preview bar read "Allied: you · Axis: computer"; Start in 184 ms opened the game on "Allied commander" with the computer panel ("Your turn") and no hand-over screen. |
| BOT-02 | The person moved 83 Recon Bn from 0409 to 1108, declared an attack on 1208 at 5:1 in the Combat Segment, paid its supply; the computer answered "chose a combat supply source" and "chose the defending terrain" by itself; the result card appeared on the person's screen ("defender loses 2 step"); no hand-over appeared. |
| BOT-03 | Computer turn: top bar "Axis computer player turn", status "Axis computer is playing…", 6 actions in 0.7 s at Fast; Pause held 9 = 9 actions for 1.5 s; one Step played exactly one more action ("An enemy unit moved to 1208"); Instant finished the turn (18 computer actions) and the status returned to "Your turn". |
| BOT-04 | Turn 1 played by both sides (person's movement, attack, supply, reinforcement steps; computer's whole turn) to Turn 2 Allied Reinforcement; 59 computer actions; no stall, no hand-over. |
| BOT-05 | Computers against each other started with no hand-over; 12 actions in 1.5 s unattended; View menu Allied / Axis switched the seat on screen "Allied computer" → "Axis computer"; Pause held 20 = 20; Instant ran to Game End "Draw", TURN LIMIT, final revision 275. The downloaded final save (275 actions) loaded into a fresh engine with the same final hash `sha256:0193e11f…` and seats Allied computer:BOT, Axis computer:BOT. At the default size (scale run): 549 computer actions to Game End "Axis" (TURN LIMIT) in 28–85 s including drawing; Pause appeared in 3–12 ms while they played. |
| BOT-06 | Paused while the Axis computer had the move (revision 172–176 in the runs), saved, opened the same operation again with two persons (no computer panel), loaded the save: the computer panel returned at the saved revision and, with nobody pressing Play, 2.5 s later the computer had played 2–14 more actions ("chose the turn order"). |
| BOT-07 | A checkpoint at the start of the computer's Movement; five Steps played ["logistics action", "logistics action", "moved to 0305", "logistics action", "moved to 0305"]; Restore returned the revision to the checkpoint's; five Steps played the identical list. |
| BOT-08 | A save whose Axis seat names `test-stall:<revision>` stopped at once with the banner "AXIS COMPUTER CANNOT GO ON — The computer found no legal action to take. Nothing was skipped…", revision 172 held for 1.5 s; "Play Axis myself" removed the panel, kept the screen on "Axis commander" with no hand-over screen, and the person (recovering internal stocks first, then ending steps, with hot-seat hand-overs as two persons now played) reached Turn 5 Combat. |
| BOT-10 | A computer-against-computer game saved while paused at revision 24, the same operation opened with two persons, the save loaded: the computers resumed at revision 29 and played to Game End "Draw" at revision 275; the final save replays to its saved hash. |
| BOT-11 | A person played all six Game Turns against the computer (ending steps, first option of each decision): 125 computer actions, Game End "Axis" (TURN LIMIT) at revision 175 in 28 s; the final save (175 actions) replays to its saved hash; seats Allied commander:HUMAN, Axis computer:BOT. |
| BOT-09 | Not run at the browser boundary except the figures above. Headless, default operation, `scripts/ai-match.mjs --trace` + `scripts/ai-latency.mjs`, four matches: per-action compute p95 225.8 / 221.8 / 151.9 / 358.6 ms (decide + dispatch p95 270 / 246 / 174 / 381 ms), max 0.65 / 0.77 / 0.36 / 1.07 s; a whole Player Turn at most 5.1 / 4.5 / 2.9 / 7.1 s. One match exceeds the proposed 300 ms p95. |

## Issues found and fixed during the runs

- The first load of a save into a reopened page failed: a save loads only into a game of the same scenario (known `load-same-scenario`);
  the runs reopen the same operation from its seeds first.
- Restoring a checkpoint taken in the middle of a computer step changed its fourth decision: the computer's per-step plan was
  lost. The runner now keeps and restores the step memory for each position (BOT-07 passes; unit test
  `tests/ai/seat-runner.test.ts`).
- A paused computer stayed paused after a save was loaded; loading now has the computers play on.
- The top bar said "Allied to act" while the Axis computer played (it named the seat holding the screen); it names the seat
  the game waits for. The End button's reason read "Actor does not own the sequence step."; it now reads "Axis computer is playing."
- With only computers, the log called the viewer's own computer "You"; it names the seat.
- The computer panel at the top of the map was covered by the phase popup; it moved to the bottom left.
- The pause and play glyphs were missing from the headless font; the buttons are text.

## Not covered

- Ending a game by a person's attack on the computer beyond the first one, the Air rules (the computer uses air only as
  `bot-air` says), a game larger than the default, and a viewport of 1680×1050.
- BOT-09's browser half: the page is unresponsive while a decision runs (`computer-main-thread`).
- Whether the computer's play is good: see `docs/ai/evaluation.md`.
