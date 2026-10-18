# Supply lines the opponent could cut next turn: estimate, record and check

Boundary: offline replays of saved headless bot-against-bot games. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Definition and conclusion:
[policy-errors](../../../ai/policy-errors.md#局勢指標). Closes TODO `bot-position-supply-cut`.

## Question

The user (2026-10-18): estimate how many units the opponent could cut off from supply next turn; a ballpark is enough,
and the first proposal (about 3 s per side per position) was too costly.

## Method

The rules' trace is derived from the state (enemy combat units and un-negated enemy ZOC block a path), so a hypothetical
state with one opponent combat unit moved to a hex gives that move's trace exactly. `supplyBestCut` is the most of the
player's traced combat units one such move cuts off, `supplyCuttable` how many some such move cuts. Hexes tried: the
opponent's reachable hexes (the same projection as the other next-turn metrics) at most one hex off a straight line from
one of the player's sources or HQs to one of its traced units; those beside a source or HQ all; the rest thinned so no two
tried hexes are adjacent.

Cheaper variants compared on the same 24 positions (games 1330100 of `defender-1330/noeffort-eastern`, 1330001 of
`defender-1330/v83-temperate`, 1300101 of `ration-fix-games/meeting-eastern`; Game Turns 2, 4, 6, 8; both sides) against
trying every hex of the filtered reach one by one:

| Variant | Calls per side | Result against every hex tried |
|---|---|---|
| Line filter only (every hex within one of a source/HQ–unit line) | 80–467 | The filter dropped no hex that cuts on the six positions checked against all reachable hexes |
| Opponent units on every reachable hex at once | 1 | Saturated: 48 of 48, 28 of 28 traced units where single moves cut 10 and 0 |
| One opponent unit on all of its reachable hexes at once | 11–49 | Saturated the same way |
| Thinned hexes only | 26–137 | Best cut equal in 23 of 24; cuttable 24 → 7 in one position (the cut hex lay beside a source) |
| Thinned hexes plus every hex beside a source or HQ (kept) | 27–198 | Best cut equal in 23 of 24 (the other 12 vs 14); cuttable equal in 18, else lower (25→20, 19→14, 7→5, 20→18, 14→12, 29→28); 0.1–0.9 s per side, about 0.4 s typical, against 0.3–4.3 s |

The module (`nextTurnMetrics` in `scripts/ai-position-metrics.mjs`) reproduced the kept variant's numbers on game
1330100 (Game Turn 4: Allied best 11, cuttable 13; Axis best 26, cuttable 28).

## Inputs and commands

The 24 game folders of [ai-position-record-2026-10-18](../ai-position-record-2026-10-18/manifest.json), re-recorded with
the estimate for the player not moving in each player turn; every game replayed to its recorded final state hash.
Files, games, rows and SHA-256: [manifest.json](manifest.json).

```sh
node scripts/ai-position-record.mjs <match directory> --out artifacts/ai-positions-supply-cut/<name>.jsonl   # 12 processes
python3 scripts/ai-position-analysis.py 'artifacts/ai-positions-supply-cut/*.jsonl' --out artifacts/ai-positions-supply-cut/analysis/supply-cut.json
```

368 games, 5,888 rows, 0 skipped, 24 min 12 s wall time on 12 processes (the four 40-game folders set it). The analysis
keeps 252 distinct games; every other result in its output equals [ai-position-analysis-2026-10-18](../ai-position-analysis-2026-10-18/README.md).

## Observed

Outcome: the rise in the non-moving player O's combat units out of trace from the start of the mover's turn to the start
of O's next turn (clipped at 0). Baseline `contact`. 3,276 player turns from Game Turn 2.

| Subset | `supplyCuttable` r (baseline) | R² added [95%] | `supplyBestCut` r | Rise in turns with metric > 0 |
|---|---|---|---|---|
| All | 0.24 (0.01) | 0.058 [0.041, 0.083] | 0.24 | 98% |
| Attacker moving (1,223) | 0.31 (0.06) | 0.091 [0.052, 0.140] | 0.30 | 97% |
| Defender moving (1,156) | 0.24 (0.02) | 0.058 [0.034, 0.087] | 0.23 | 100% |
| Meetings (897) | 0.28 (−0.01) | 0.081 [0.050, 0.126] | 0.27 | 98% |

By `supplyCuttable`, all turns: 0 (n 330) mean rise 0.43, 9% of turns with a rise; 1–7 (1,067) 1.23, 28%; 8–15 (769) 2.0,
34%; 16–23 (602) 3.32, 45%; 24–31 (294) 4.51, 44%; 32+ (214) 3.97, 36%. Divided by the units in trace it does no better
(r 0.24).

Final VP margin: adding O's `supplyCuttable` (signed for Axis) to VP + steps + out of trace gives no gain; 95% intervals
in Axis attacks [−0.02,+0.09] [−0.03,+0.02] [−0.04,+0.01] [−0.03,+0.00] [−0.01,+0.00] [−0.01,+0.01] [−0.01,+0.01] for
Game Turns 2–8; meetings all contain 0.

## Conclusions

The estimate is a usable leading measure of supply cuts in the coming player turn, weaker than objectives at risk, and
it rises with the count up to about 30 units instead of saturating. It adds nothing to the final-result prediction once
VP, steps and units out of trace are known.

## Limits

A single opponent unit per move: gaps two units close together are missed, and the moved unit is assumed to arrive and
stay. The outcome counts units out of trace by position, whatever made them so. Games are v79-family play.
