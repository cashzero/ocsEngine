# HQ and truck allocation in play, Western Europe

Boundary: headless bot-against-bot games and offline analysis. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). Earlier records:
[movement-execution batch](../ai-theater-execution-games-2026-10-30/README.md) and
[next-step trace](../ai-theater-next-step-2026-10-30/README.md).

The user (2026-10-30) pointed out that P11 is supply planning (「對 但這整個p11不就是補給規劃嗎」). They then asked
for the allocation to be implemented and tested without being asked how (「do it 不要問我怎麼做 應該你自行判斷並測試」).

## Change and registration

`212f0f1` changes the allocation so that an attack position counts only where a member has supply on its group's
attack step. Four sources count:
- its trace;
- SP it can eat from a dump (12.6c);
- the throw of an HQ placed for the group (12.3b, new rules query `queryHqThrow`);
- for a next-step group, SP a truck placed for the group unloads this step.

Placed HQs move to their hex, placed trucks unload at their drop, and members may leave trace for a fed attack
position.

The change was checked before registration:
- tests: the full suite passed, 815 passed and 7 skipped;
- smoke games on development seeds 2199000–2199007, which are not part of this batch.

[registration.json](registration.json) and [theater-weights.json](theater-weights.json) were committed (`a5bda1e`)
before any game. The batch is 80 new Western Europe Axis-attack games (2100300–2100379) in seat-swapped pairs.

Development replays of the movement-execution batch, Game Turns 1–4, set the limits of this design. They looked at
the 140 defended objectives whose attack positions were outside trace:
- HQ placement could cover 58;
- existing dumps could feed 10;
- a traced drop whose draw reaches the attack positions existed for 27;
- these overlap, and about half the 140 are beyond every HQ and drop within two steps.

## Run

`dist` built from `a5bda1e`, Node v26.9.0. All 80 games finished and passed the replay check (1,173 s, 12 processes).
Summary SHA-256 `92b9de6c5ebb…` (`artifacts/ai-theater-hq-games/attack-western`).

```sh
B=artifacts/ai-theater-hq-games W=docs/quality/evidence/ai-theater-hq-games-2026-10-30/theater-weights.json
node scripts/ai-match.mjs --matches 80 --start 2100300 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic:$W --axis heuristic --swap --parallel 12 --out $B/attack-western
node scripts/ai-paired-measures.mjs $B/attack-western --candidate heuristic:$W
for i in $(seq 0 11); do node scripts/ai-theater-hq-follow.mjs $B/attack-western --weights $W --out $B/follow/shard-$i.jsonl --shard $i/12 & done; wait
node scripts/ai-theater-hq-follow.mjs --summarize $B/follow/shard-*.jsonl
# theater rows: ai-position-record.mjs --theater <capture model> over 4 chunks of 20 games, then ai-theater-realized.mjs
for i in $(seq 0 7); do node scripts/ai-theater-adherence.mjs $B/attack-western --weights $W --out $B/adherence/shard-$i.jsonl --shard $i/8 & done; wait
node scripts/ai-theater-adherence.mjs --summarize $B/adherence/shard-*.jsonl
```

Every replay reached its saved final hash.
- Theater rows: 1,280 rows; of the Combat entries, 3 could not be rebuilt and 6 mismatched (left null).
- Sorted row SHA-256: follow-through `8a27ea82cbc3…`, theater rows `760ac26a1c47…`, adherence `87a0465e9ad4…`.
- Step losses: summed from the theater rows over the attacker's player turns and paired by seat-swapped matches.

## Results

| Measure, on side minus standard, per pair (40 pairs) | Mean | 95% interval | Pairs positive / zero / negative | Movement-execution batch |
|---|---:|---|---|---:|
| **VP** | **+1.35** | **[−0.51, +3.21]** | 19 / 9 / 12 | −0.57 |
| Kill − Loss (steps) | +0.71 | [−1.78, +3.20] | 19 / 2 / 19 | −2.42 [−4.55, −0.30] |
| Supply | −0.04 | [−0.59, +0.52] | 16 / 8 / 16 | −0.15 |

The per-pair VP SD was 5.83.

Theater policy attacking minus the standard attacking, per pair:

| Measure | Game Turns 1–3 | Game Turns 4–8 |
|---|---|---|
| Objective VP gained | +1.10 [−0.04, +2.24] (+0.25 in the movement-execution batch) | +0.15 [−1.72, +2.02] |
| Defender steps lost | +0.30 [−0.72, +1.32] | −0.17 [−1.65, +1.30] (−4.05 [−6.66, −1.44] before) |
| Attacker steps lost | +0.23 [−0.43, +0.88] | −0.75 [−3.33, +1.83] |

Plan follow-through with the theater policy attacking (`ai-theater-hq-follow.mjs`, 40 games, 320 attacker player turns):

| Measure | Game Turns 1–3 | Game Turns 4–8 |
|---|---:|---:|
| Regular attacks per attacker player turn | 2.36 | 1.48 |
| Defended allocation groups per turn | 0.70 | 0.41 |
| HQ placements: at their hex when Movement ends | 26/28 | 12/23 (2.65 hexes short on average) |
| Truck placements: unloaded this step / within 1 hex of the drop | 5/9, 3/9 | 6/9, 2/9 |
| This-step groups: all members beside / attacked / held at end | 31/44, 41/44, 34/44 | 12/26, 21/26, 14/26 |
| Next-step groups: held at end of the next turn | 22/40 (0.55) | 34/56 (0.61) |

Against the standard on the allocation's own defended objectives (`ai-theater-adherence.mjs`, plan at the first
Movement decision):

| Game Turns 1–3 | Allocation's defended objectives attacked | Held at end | Next-step groups held at end of next turn |
|---|---:|---:|---:|
| Theater policy moving | 0.79 (76) | 0.59 | 0.50 (32) |
| Standard moving (counterfactual plan) | 0.59 (91) | 0.34 | 0.42 (43) |

Plan size, Game Turns 1–3: 81 of 504 theater groups come from the allocation, 32 of them next-step groups. The rest
are the usual efforts filling the slots. 348 of 640 attacker turns have the same objectives and group sizes as the
standard plan.

## Conclusions

- **The supply allocation works where it acts.**
  - Placed HQs reach their hex in Game Turns 1–3: 26 of 28.
  - This-step groups attack 41 of 44 times and hold 34.
  - Next-step groups held at the end of the next turn rise from 0.14 to 0.55. The comparison is not like for like:
    groups are now kept only where supply can reach.
- **The loss of the movement-execution batch is gone.**
  - Kill − Loss is +0.71 a pair, against −2.42.
  - The defender's step losses in Game Turns 4–8 no longer fall: −0.17 a pair, against −4.05.
- **Help is not established.**
  - VP is +1.35 a pair, interval [−0.51, +3.21].
  - Game Turn 1–3 objective VP gained is +1.10 a pair, interval [−0.04, +2.24], the largest of the four
    observations but still across 0.
- **The allocation acts on a minority of objectives.** It forms 0.7 defended groups a turn in Game Turns 1–3, because
  about half the untraced objectives are beyond any HQ or truck drop within two steps.
- **Trucks rarely execute their placement.** Only 9 truck placements were made in Game Turns 1–3, and 3 of them
  unloaded within 1 hex of the drop.

## Limits

- One opponent, Western Europe Axis attacks only, 40 pairs; power is about 0.5 for +2 VP a pair.
- The attack and held figures compare the two policies on their own plans at different states, not paired.
- Truck placements are few, so the truck part is not evaluated.
- The allocation does not check the tokens a drop needs and does not use the P11.2 inflow bound.
