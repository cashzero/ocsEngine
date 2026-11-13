# Drops outside trace and this-step trucks in play, Western Europe

Boundary: headless bot-against-bot games and offline analysis. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). Earlier records:
[HQ and truck allocation batch](../ai-theater-hq-games-2026-10-30/README.md) and the
[change and its development rollouts](../ai-theater-untraced-drops-2026-11-12/README.md).

## Registration

[registration.json](registration.json) and [theater-weights.json](theater-weights.json) were committed (`02bc90c`)
before any game, with the user's consent to the batch (2026-11-13: 「同意」). The batch is 80 new Western Europe
Axis-attack games (2100400–2100479) in seat-swapped pairs: the theater allocation of `51301b1` against the standard
policy. Primary measure: VP per pair.

## Run

`dist` built from `02bc90c` (source of `51301b1`), Node v26.9.0. All 80 games finished and passed the replay check
(1,205 s, 6 processes). Summary SHA-256 `5b787ea51379…` (`artifacts/ai-theater-untraced-games/attack-western`).

```sh
B=artifacts/ai-theater-untraced-games W=docs/quality/evidence/ai-theater-untraced-games-2026-11-13/theater-weights.json
node scripts/ai-match.mjs --matches 80 --start 2100400 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic:$W --axis heuristic --swap --parallel 6 --out $B/attack-western
node scripts/ai-paired-measures.mjs $B/attack-western --candidate heuristic:$W
for i in 0 1 2 3 4 5; do node scripts/ai-theater-hq-follow.mjs $B/attack-western --weights $W --out $B/follow/shard-$i.jsonl --shard $i/6 & done; wait
node scripts/ai-theater-hq-follow.mjs --summarize $B/follow/shard-*.jsonl
# theater rows: ai-position-record.mjs --theater <capture model> over 4 chunks of 20 games, then ai-theater-realized.mjs
```

Every replay reached its saved final hash.
- Theater rows: 1,280 rows; of the Combat entries, 8 could not be rebuilt and 12 mismatched (left null).
- Sorted row SHA-256: follow-through `af161027cebe…`, theater rows `d578c71288e8…`.
- Step losses and attrition: summed from the theater rows over the attacker's player turns and paired by seat-swapped
  matches. End-of-game counts: from `summary.json`, the attacker's side of each game, paired the same way.

## Results

| Measure, theater side minus standard, per pair (40 pairs) | Mean | 95% interval | Pairs positive / zero / negative | HQ and truck allocation batch |
|---|---:|---|---|---:|
| **VP** (primary) | **+2.70** | **[+1.15, +4.25]** | 24 / 8 / 8 | +1.35 [−0.51, +3.21] |
| Kill − Loss (steps) | +1.81 | [−1.28, +4.91] | 23 / 0 / 17 | +0.71 |
| Supply | −0.24 | [−0.66, +0.18] | 13 / 9 / 18 | −0.04 |

The per-pair VP SD was 4.85.

Theater policy attacking minus the standard attacking, per pair:

| Measure | Game Turns 1–3 | Game Turns 4–8 | Game Turns 1–8 |
|---|---|---|---|
| Objective VP gained | **+3.70 [2.31, 5.09]** (5.63 against 1.93) | −0.40 [−2.07, 1.27] | +3.30 [1.53, 5.07] |
| Defender steps lost | +2.48 [0.95, 4.00] | −1.07 [−2.76, 0.61] | +1.40 [−0.91, 3.71] |
| Attacker steps lost | +0.75 [0.14, 1.36] | −0.13 [−2.08, 1.83] | +0.63 [−1.53, 2.78] |
| Attacker steps lost to attrition | +0.13 [−0.14, 0.39] | −0.05 [−1.96, 1.86] | +0.07 [−1.89, 2.04] |

| At the end of the game, the attacker's side | Theater attacking | Standard attacking | Difference per pair |
|---|---:|---:|---|
| Objectives taken | 3.10 | 2.20 | +0.90 [0.44, 1.36] |
| Combat units out of supply | 0.42 | 0.55 | −0.13 [−0.81, 0.56] |

Share of the theater potential realized by Combat entry (`ai-theater-realized.mjs`): Game Turns 1–3, 0.47 with the
theater policy attacking against 0.22 with the standard; Game Turns 4–8, 0.82 against 0.62.

Plan follow-through with the theater policy attacking (`ai-theater-hq-follow.mjs`, 40 games, 320 attacker player turns):

| Measure | Game Turns 1–3 | Game Turns 4–8 | HQ and truck batch, Game Turns 1–3 |
|---|---:|---:|---:|
| Regular attacks per attacker player turn | 2.50 | 1.12 | 2.36 |
| Defended allocation groups per turn | 1.06 | 0.23 | 0.70 |
| HQ placements at their hex when Movement ends | 15/17 | 8/11 | 26/28 |
| Truck placements: unloaded this step / at the drop | 78/80, 65/80 | 19/19, 13/19 | 5/9, 3/9 within 1 hex |
| This-step groups: all members beside / attacked / held at end | 38/45, 40/45, 28/45 | 12/17, 15/17, 11/17 | 31/44, 41/44, 34/44 |
| Next-step groups: held at end of the next turn | 41/82 (0.50) | 22/30 (0.73) | 22/40 (0.55) |
| Next-step groups: a this-step group the next turn / next step again / dropped | 16, 18, 48 of 82 | 7, 6, 17 of 30 | — |

## Conclusions

Read as registered:

- **It helps on VP in this batch.** The primary is +2.70 a pair, interval [+1.15, +4.25], above 0. The four earlier
  versions were +1.10, +0.88, −0.57 and +1.35, all with intervals across 0.
- **The rollouts' gain carried to whole games.** Objective VP gained as attacker is +3.70 [2.31, 5.09] in Game Turns
  1–3 and −0.40 [−2.07, 1.27] in Game Turns 4–8: the early gain is not given back. The share of the theater potential
  realized in Game Turns 1–3, the gap this layer was built for, is 0.47 against 0.22.
- **Pushing units beyond trace did not cost what was feared.** The attacker loses 0.75 more steps a pair in Game Turns
  1–3 and no more over the game; attrition losses and units out of supply at the end do not rise.

Also observed:

- Trucks carry out their placement in whole games: 78 of 80 placements unloaded in Game Turns 1–3, 65 at the drop.
- Next-step groups still convert poorly: 16 of 82 become a this-step group the next turn and 48 are dropped; the
  objective is held at the end of the next turn in half the cases, about the same share as before with twice the
  groups. The plan's assumption about where members stage is unchanged (a known gap).
- Kill − Loss is +1.81 a pair with an interval across 0.

## Limits

- One batch of 40 pairs, one opponent (the standard policy, which as defender does not counterattack), Western Europe
  Axis attacks only.
- This is an observation, not a promotion: the standard policy stays heuristic@85 with the weight off.
- Rail and sea capacity are not in the allocation, and the measurement script's search still assigns combat units only.
- The follow-through figures compare this batch with an earlier one at different states, not paired.
