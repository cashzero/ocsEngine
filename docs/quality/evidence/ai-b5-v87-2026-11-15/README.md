# B5 heuristic baseline rerun with heuristic@87

Boundary: headless bot matches (`scripts/ai-match.mjs`) scored by `scripts/ai-acceptance.mjs`, rows B5-1 to B5-6 of the
[AI bot WBS](../../../roadmap/11-ai-bot-wbs.md). B5-7 (reading three whole traces by
hand) was not redone. This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[S4.6 of the AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#5-s4-獨立批與基準重測). The user
(2026-11-15): 「完成S4」, which includes S4.6's 80 games.

**Result: every scored row passes on both map styles; Eastern Europe wins 20/20, so `bot-eastern-front`'s acceptance
(≥ 90% over 20 games, seats exchanged, new seeds) is met.** B5 stays IN PROGRESS only for B5-7.

## Run

Standard heuristic@87, build of `3af6ab2` (policy identical to the promoted `1d582c8`; that commit changed only
comments). Node v26.9.0. Default New Game: Western Europe meeting engagement, 32×24, 6 divisions a side, 8 Game Turns,
generator defaults for air. Seeds not used before (no match index 2700000 or above in `docs/`, `scripts/` or
`artifacts/`).

```sh
O=artifacts/ai-b5-v87
node scripts/ai-match.mjs --matches 40 --start 2700000 --parallel 4 --turns 8 --allied heuristic --axis random-legal --swap --trace --out $O/vs-random
node scripts/ai-match.mjs --matches 20 --start 2700100 --parallel 5 --turns 8 --allied heuristic --axis heuristic --trace --out $O/vs-self
node scripts/ai-match.mjs --matches 20 --start 2700200 --parallel 5 --turns 8 --style EASTERN_EUROPE --allied heuristic --axis random-legal --swap --trace --out $O/eastern
node scripts/ai-acceptance.mjs $O/vs-random $O/vs-self
node scripts/ai-acceptance.mjs $O/eastern
```

The self-play batch is not seat-exchanged: with the same policy on both seats an exchanged pair plays the same game
twice, so 20 different seeds were used. Times: vs-random 232 s, vs-self 192 s, Eastern Europe 143 s; 0 failed in each.

## Observed: default map (Western Europe meeting), seeds 2700000–2700039 and 2700100–2700119

| Row | Item | Measured | Pass |
|---|---|---|---|
| B5-1 | vs random-legal: FINISHED, no errors, replay hash matches | 40/40 | PASS |
| B5-1 | heuristic vs heuristic: FINISHED, no errors, replay hash matches | 20/20 | PASS |
| B5-2 | wins against random-legal (≥ 90%) | 40/40 = 100% | PASS |
| B5-2 | wins as Allied / as Axis (≥ 80% each) | 20/20, 20/20 | PASS |
| B5-3 | games ending with an objective taken from the other side or nobody (≥ 80%) | 40/40 = 100% | PASS |
| B5-4 | games with contact where the heuristic attacked (≥ 90%) | 40/40 = 100% | PASS |
| B5-4 | median odds of declared regular attacks (≥ 3:1) | 13.0:1 over 522 attacks; below 2:1: 1% | PASS |
| B5-4 | games with at least one barrage (≥ 50%) | 37/40 = 93% | PASS |
| B5-5 | games where fuel was paid | 40/40 | PASS |
| B5-5 | games where trucks brought SP to the army | 40/40 (unloads in 40, cargo spent in 13) | PASS |
| B5-5 | games with a rebuild | 31/40 | info |
| B5-5 | combat units in supply at the end (≥ 80%) | 100% | PASS |
| B5-6 | pending decisions answered by a named responder, not the first-option fallback | advance 536, supply-source 639, defender-lead 215, defender-terrain 270, first-player 145, combat-option 144, retreat-supply 139, safest-hex 37, reinforce-vp 33, cheapest-loss 21 | PASS |

Heuristic against heuristic: Allied 12 wins, Axis 5, draws 3.

## Observed: Eastern Europe (meeting), seeds 2700200–2700219, seats exchanged

| Row | Item | Measured | Pass |
|---|---|---|---|
| B5-1 | vs random-legal: FINISHED, no errors, replay hash matches | 20/20 | PASS |
| B5-2 | wins against random-legal (≥ 90%) | 20/20 = 100% | PASS |
| B5-2 | wins as Allied / as Axis (≥ 80% each) | 10/10, 10/10 | PASS |
| B5-3 | games ending with an objective taken from the other side or nobody (≥ 80%) | 20/20 = 100% | PASS |
| B5-4 | games with contact where the heuristic attacked (≥ 90%) | 20/20 = 100% | PASS |
| B5-4 | median odds of declared regular attacks (≥ 3:1) | 16.0:1 over 216 attacks; below 2:1: 0% | PASS |
| B5-4 | games with at least one barrage (≥ 50%) | 19/20 = 95% | PASS |
| B5-5 | games where fuel was paid | 20/20 | PASS |
| B5-5 | games where trucks brought SP to the army | 20/20 (unloads in 20, cargo spent in 4) | PASS |
| B5-5 | games with a rebuild | 17/20 | info |
| B5-5 | combat units in supply at the end (≥ 80%) | 100% | PASS |
| B5-6 | pending decisions answered by a named responder | supply-source 275, advance 252, reinforce-vp 10, combat-option 82, retreat-supply 87, defender-lead 101, defender-terrain 63, first-player 75, safest-hex 9, cheapest-loss 13 | PASS |

The previous measurements were heuristic@5 on the default map (39/40 against random-legal) and heuristic@1 in Eastern
Europe (32/40, 80%).

## Limits

- B5-7 (three whole traces read by hand, different map styles) was last done on heuristic@1.
- Meeting engagements only (the default); the attack engagements are measured by the promotion batches.
- Against random-legal, which does not defend; these rows check completeness and resource use, not strength.

## Raw data

`artifacts/ai-b5-v87/` of the `ai-truck-shuttle` worktree (summaries, traces, saves).
