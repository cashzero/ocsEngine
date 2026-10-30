# Movement-execution fix in play, Western Europe

Boundary: headless bot-against-bot games and offline analysis. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層); diagnosis that motivated the change:
[execution diagnosis](../ai-theater-execution-2026-10-30/README.md). The user (2026-10-30): 「改善移動執行」,
「試著改看看 並且跑80局確認」.

## Change and registration

`cb238c7`: a theater unit counts as beside its objective this step only inside its trace coverage now (otherwise its
group attacks next step); reach uses the mode the move step will choose; theater units score up to 1,500 move
candidates. [registration.json](registration.json) and [theater-weights.json](theater-weights.json) were committed
(`bdda951`) before any game: 80 new Western Europe Axis-attack games (2100200–2100279), seat-swapped pairs.

## Run

`dist` built from `bdda951`, Node v26.9.0. All 80 games finished and passed the replay check (1,253 s, 12 processes).
Summary SHA-256 `9649f4dfa2d0…` (`artifacts/ai-theater-execution-games/attack-western`).

```sh
B=artifacts/ai-theater-execution-games W=docs/quality/evidence/ai-theater-execution-games-2026-10-30/theater-weights.json
node scripts/ai-match.mjs --matches 80 --start 2100200 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic:$W --axis heuristic --swap --parallel 12 --out $B/attack-western
node scripts/ai-paired-measures.mjs $B/attack-western --candidate heuristic:$W
for i in 1 3 5 7 9 11; do node scripts/ai-theater-move-terms.mjs $B/attack-western --weights $W --out $B/move-terms/shard-$i.jsonl --shard $i/12 --turns 3 & done
for i in 0 1 2 3; do node scripts/ai-theater-adherence.mjs $B/attack-western --weights $W --out $B/execution/shard-$i.jsonl --shard $i/4 --execution & done
# theater rows: ai-position-record.mjs --theater over 4 chunks of 20 games, then ai-theater-realized.mjs
```

Every replay reached its saved final hash; the move-terms replay reproduced all 8,001 attacker Movement decisions of
Game Turns 1–3; of the Combat entries, 3 could not be rebuilt and 5 mismatched in the theater rows (left null).

## Results

| Measure, on side minus standard, per pair (40 pairs) | Mean | 95% interval | Pairs positive / zero / negative |
|---|---:|---|---|
| **VP** | **−0.57** | **[−2.29, +1.14]** | 16 / 8 / 16 |
| Kill − Loss (steps) | −2.42 | [−4.55, −0.30] | 12 / 0 / 28 |
| Supply | −0.15 | [−0.66, +0.36] | 17 / 5 / 18 |

Execution, Game Turns 1–3, theater policy attacking, against the [two-step batch](../ai-theater-two-step-games-2026-10-22/README.md):

| Measure | Two-step | This batch |
|---|---:|---:|
| Moves of this-step defended-group members | 310 | 119 |
| … stopping beside the objective | 0.45 | 0.86 |
| … refused by the supply gate / unreachable / not offered | 0.25 / 0.10 / 0.07 | 0 / 0 / 0 |
| This-step defended groups | 99 | 31 |
| Members in place at Combat (mean per group) | 0.40 | 0.86 |
| All members in place | 0.27 | 0.71 |
| Attacked | 0.41 | 0.97 |
| Held at end of the turn | 0.32 | 0.68 |
| Next-step groups | 92 | 170 |
| Next-step groups held at end of the next turn (standard on the same objectives) | 0.11 (0.08) | 0.14 (0.15) |

Objective VP gained as attacker, per pair: Game Turns 1–3 +0.25 [−0.81, +1.31], 4–8 −0.70 [−2.50, +1.10]. Steps the
defender lost with the theater policy attacking minus the standard attacking, per pair: Game Turns 1–3 +0.10
[−1.80, +2.00], 4–8 −4.05 [−6.66, −1.44]; steps the attacker lost: +0.68 and +0.23, both intervals across 0. In
Game Turns 4–8 the allocation's defended objectives are attacked 0.37 of the time when it moves, 0.44 for the standard
on its counterfactual objectives.

## Conclusions

- The change fixes execution of this-step groups: 86% of their moves reach the hex beside the objective (45% before),
  nearly every such group attacks, and two thirds of those objectives are held at the end of the turn.
- It does so by planning fewer this-step assaults. Most groups now wait a step for supply, and next-step groups convert
  no better than the standard does on the same objectives.
- Help is not established (VP −0.57 a pair), and the attacker inflicts fewer step losses in Game Turns 4–8 (Kill − Loss
  −2.42 a pair, interval below 0): fewer attacks happen when assaults wait for supply that the next step does not bring.

## Limits

One opponent, Western Europe Axis attacks only, 40 pairs. Execution counts are at Combat entry only. The reason
next-step groups do not convert was not traced here.
