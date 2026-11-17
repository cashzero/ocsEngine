# B5 heuristic baseline rows with the standard heuristic@90

Boundary: headless bot matches (`scripts/ai-match.mjs`) scored by `scripts/ai-acceptance.mjs`, rows B5-1 to B5-6 of the
[AI bot WBS](../../../roadmap/11-ai-bot-wbs.md). B5-7 (reading three whole traces by hand) was not redone. This record
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S7.2 (S4.6) of the [AI strategy
improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-17): 「全部做完」, which includes
these 80 games.

**Result: every scored row passes on both map styles with the standard policy; Eastern Europe wins 19/20 (95%).**

## Run

Standard heuristic@90, build of `55aff4c` (`artifacts/ai-promotion/frozen-v90-standard` has the same source). Node
v26.9.0. Default New Game: Western Europe meeting engagement, 32×24, 6 divisions a side, 8 Game Turns, generator defaults
for air. Seeds not used before (no match index 2900000 or above in `docs/`, `scripts/` or `artifacts/`).

```sh
O=artifacts/ai-b5-v90
node scripts/ai-match.mjs --matches 40 --start 2900000 --parallel 4 --turns 8 --allied heuristic --axis random-legal --swap --trace --out $O/vs-random
node scripts/ai-match.mjs --matches 20 --start 2900100 --parallel 5 --turns 8 --allied heuristic --axis heuristic --trace --out $O/vs-self
node scripts/ai-match.mjs --matches 20 --start 2900200 --parallel 5 --turns 8 --style EASTERN_EUROPE --allied heuristic --axis random-legal --swap --trace --out $O/eastern
node scripts/ai-acceptance.mjs $O/vs-random $O/vs-self
node scripts/ai-acceptance.mjs $O/eastern
```

Times: vs-random 276 s, vs-self 157 s, Eastern Europe 128 s; 0 failed in each.

## Observed: default map (Western Europe meeting), seeds 2900000–2900039 and 2900100–2900119

| row | item | measured | pass |
|---|---|---|---|
| B5-1 | vs random-legal: FINISHED, no errors, replay hash matches | 40/40 | PASS |
| B5-1 | heuristic vs heuristic: FINISHED, no errors, replay hash matches | 20/20 | PASS |
| B5-2 | wins against random-legal (≥ 90%) | 39/40 = 98% | PASS |
| B5-2 | wins as allied (≥ 80%) | 20/20 = 100% | PASS |
| B5-2 | wins as axis (≥ 80%) | 19/20 = 95% | PASS |
| B5-3 | games ending with an objective taken from the other side or nobody (≥ 80%) | 39/40 = 98% | PASS |
| B5-4 | games with contact where the heuristic attacked (≥ 90%) | 40/40 = 100% | PASS |
| B5-4 | median odds of declared regular attacks (≥ 3:1) | 12.0:1 over 522 attacks; below 2:1: 2% | PASS |
| B5-4 | games with at least one barrage (≥ 50%) | 38/40 = 95% | PASS |
| B5-5 | games where fuel was paid | 40/40 | PASS |
| B5-5 | games where trucks brought SP to the army (unloaded beside it, or spent from their cargo) | 40/40 (unloads in 40, cargo spent in 15) | PASS |
| B5-5 | games with a rebuild | 33/40 | info |
| B5-5 | combat units in supply at the end (≥ 80%) | 99% | PASS |
| B5-6 | pending decisions answered by a named responder, not the first-option fallback | supply-source 679, advance 498, reinforce-vp 28, first-player 139, defender-terrain 307, defender-lead 162, combat-option 161, retreat-supply 155, safest-hex 28, cheapest-loss 13 | PASS |

Heuristic against heuristic: allied 9, axis 10, draw 1.

## Observed: Eastern Europe (meeting), seeds 2900200–2900219, seats exchanged

| row | item | measured | pass |
|---|---|---|---|
| B5-1 | vs random-legal: FINISHED, no errors, replay hash matches | 20/20 | PASS |
| B5-2 | wins against random-legal (≥ 90%) | 19/20 = 95% | PASS |
| B5-2 | wins as allied (≥ 80%) | 10/10 = 100% | PASS |
| B5-2 | wins as axis (≥ 80%) | 9/10 = 90% | PASS |
| B5-3 | games ending with an objective taken from the other side or nobody (≥ 80%) | 19/20 = 95% | PASS |
| B5-4 | games with contact where the heuristic attacked (≥ 90%) | 20/20 = 100% | PASS |
| B5-4 | median odds of declared regular attacks (≥ 3:1) | 16.0:1 over 243 attacks; below 2:1: 1% | PASS |
| B5-4 | games with at least one barrage (≥ 50%) | 18/20 = 90% | PASS |
| B5-5 | games where fuel was paid | 20/20 | PASS |
| B5-5 | games where trucks brought SP to the army (unloaded beside it, or spent from their cargo) | 20/20 (unloads in 20, cargo spent in 2) | PASS |
| B5-5 | games with a rebuild | 19/20 | info |
| B5-5 | combat units in supply at the end (≥ 80%) | 100% | PASS |
| B5-6 | pending decisions answered by a named responder, not the first-option fallback | supply-source 279, defender-lead 59, combat-option 67, retreat-supply 65, first-player 77, advance 270, defender-terrain 66, cheapest-loss 11, safest-hex 9, reinforce-vp 6 | PASS |

Earlier measurements of a standard policy were heuristic@5 on the default map (39/40 against random-legal) and
heuristic@1 in Eastern Europe (32/40, 80%).

## Limits

- B5-7 (three whole traces read by hand, different map styles) was last done on heuristic@1.
- Meeting engagements only (the default); the attack engagements are measured by the promotion batches.
- Against random-legal, which does not defend; these rows check completeness and resource use, not strength.

## Raw data

`artifacts/ai-b5-v90/` of the `ai-truck-shuttle` worktree (summaries, traces, saves) and `artifacts/ai-b5-v90-*.txt`.
