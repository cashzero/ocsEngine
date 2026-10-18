# Exposure with one target per opponent unit, and dump SP lost: record and check

Boundary: offline replays of saved headless bot-against-bot games. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Definitions and conclusions:
[policy-errors](../../../ai/policy-errors.md#局勢指標). Closes TODO `bot-position-exposure`.

## Question

The user (2026-10-18), first of four proposed priorities: replace the saturated exposure measure by one where each
opponent unit counts toward one target only, so that E6 (attackers stopping 2–3 hexes short) can be judged with data.
The TODO also asked for dump SP captured or destroyed to be recorded and compared with `dumpSpInReach`.

## Method

- `stacksExposedAllocated` / `stepsExposedAllocated` (`nextTurnMetrics`, `scripts/ai-position-metrics.mjs`): greedy
  allocation over the opponent's projected reach. Repeatedly take the player's stack with the most steps that the
  unallocated opponent units able to reach a hex beside it can attack at Combat Table column 9+; keep only the attackers
  needed there (weakest printed strength dropped first while it stays at 9+); mark them allocated. The old upper-bound
  measures stay for comparison.
- `spCapturedOrDestroyed` per player turn (`scripts/ai-position-record.mjs`): Tokens of the player's dumps in
  `SUPPLY_CAPTURED` (captured plus destroyed) and `DUMP_BLOWN` events, divided by 4.
- On game 1330100 (`defender-1330/noeffort-eastern`) allocation lowered Axis exposed stacks from 17 to 7 at Game Turn 2
  and from 16 to 6 at Game Turn 6; Allied ones from 8 to 6 and 5 to 5. All next-turn metrics without the supply cut took
  0.03–0.2 s per position.

## Inputs and commands

The 24 game folders of [ai-position-record-2026-10-18](../ai-position-record-2026-10-18/manifest.json), re-recorded
(every metric of [ai-position-supply-cut-2026-10-18](../ai-position-supply-cut-2026-10-18/README.md) plus the above).
Files, games, rows and SHA-256: [manifest.json](manifest.json).

```sh
node scripts/ai-position-record.mjs <match directory> --out artifacts/ai-positions-exposure/<name>.jsonl   # 12 processes
python3 scripts/ai-position-analysis.py 'artifacts/ai-positions-exposure/*.jsonl' --out artifacts/ai-positions-exposure/analysis/exposure.json
```

368 games, 5,888 rows, 0 skipped, 24 min 10 s on 12 processes; 252 distinct games analysed. Every result the previous
analysis produced is unchanged (its output differs only by the added lines).

## Observed

Steps the non-moving player O lost in the mover's turn, 3,276 player turns from Game Turn 2:

| Subset | `stacksExposed` r | `stacksExposedAllocated` r | R² it adds over `stacksExposed` [95%] | `stepsExposedAllocated` r (adds over `stacksExposed`) |
|---|---|---|---|---|
| All | 0.09 | 0.23 | 0.052 [0.037, 0.071] | 0.16 (0.018 [0.008, 0.031]) |
| Attacker moving (1,223) | 0.37 | 0.36 | 0.013 [0.002, 0.030] | 0.21 (0.004 [0.000, 0.016]) |
| Defender moving (1,156) | 0.17 | 0.13 | 0.000 [0.000, 0.006] | 0.17 (0.004 [0.000, 0.017]) |
| Meetings (897) | 0.17 | 0.22 | 0.019 [0.004, 0.043] | 0.22 (0.019 [0.004, 0.045]) |

By `stacksExposedAllocated`, all turns (mean steps lost; turns with a loss): 0 (n 103) 0.41, 22%; 1 (212) 0.42, 25%;
2–3 (908) 0.91, 44%; 4–7 (1,880) 1.44, 56%; 8+ (173) 1.68, 65%. Share at 8+: 5% (`stacksExposed` 41%,
`stepsExposedAllocated` 63%, `stepsExposed` 73%).

SP of O's dumps captured, destroyed or blown, by `dumpSpInReach`, all turns: 0 (n 175) 0.00, 0%; 1 (26) 0.08, 12%; 2–3
(295) 0.11, 11%; 4–7 (792) 0.38, 21%; 8+ (1,988) 0.47, 16%; r 0.08, R² added over `contact` 0.007 [0.001, 0.016]; with
the defender moving r 0.14, 0.020 [0.010, 0.034].

Final VP margin: adding `stepsExposedAllocated` to VP + steps + out of trace gives no gain; 95% intervals in Axis attacks
[−0.03,+0.02] [−0.01,+0.02] [−0.02,+0.01] [−0.02,+0.01] [−0.01,+0.00] [−0.01,+0.00] [−0.00,+0.00] for Game Turns 2–8;
meetings all contain 0.

## Conclusions

- The TODO's acceptance holds: the allocated exposure adds R² over `stacksExposed` with an interval above 0, and dump SP
  lost is recorded and compared.
- The gain is mostly across roles: within the attacker's turns the old count already predicted as well, and within the
  defender's turns allocation adds nothing. Allocation chiefly puts the measure on one scale whoever moves, and removes
  the saturation of the stack count. Use `stacksExposedAllocated`; the step version stays saturated.
- Exposure stays a weak predictor of next-turn losses (r 0.13–0.36): whether the opponent attacks and the dice dominate.
- `dumpSpInReach` is a valid necessary condition (no SP lost when 0) with weak predictive power, since losses are rare.
- Judging E6 still needs continuation tests comparing stopping short with closing in, measured with these metrics.

## Limits

Greedy allocation, highest-step stack first; another order could allocate differently. The defenders' terrain and the
attackers' supply are taken as the rules' odds query gives them. Games are v79-family play.
