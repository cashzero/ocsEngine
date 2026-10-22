# Two-step theater allocation in play, Western Europe (plan P11.8)

Boundary: headless bot-against-bot games and offline analysis. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[P11.8](../../../roadmap/18-position-metrics-wbs.md); design: [theater supply allocation](../../../ai/theater-supply-plan.md#策略上層).
The user's acceptance (2026-10-22): 「在西歐對局中觀測是否有幫助」. They chose the two-step design and approved this batch;
after it they asked not to run more games for now and to analyze the metrics.

## Registration

[registration.json](registration.json) and [theater-weights.json](theater-weights.json) were committed (`4c2f9e3`) before
any game: 80 new Western Europe Axis-attack games (matches 2100100–2100179), two-step allocation on against the
standard, seat-swapped pairs. Primary: VP margin of the on side, pair mean with a 95% t interval. Secondary: Kill − Loss,
Supply, the attacker's Game Turn 1–3 potential, realized value and objective VP, and how much the plan changes.

## Run

Source `2fb408e` (registration commit `4c2f9e3` adds only the record), `dist` built from it, Node v26.9.0. All 80 games
finished and passed the replay check (1,827 s, 12 processes). Summary SHA-256 `90cbdb24c52d…`
(`artifacts/ai-theater-two-step-games/attack-western`).

```sh
node scripts/ai-match.mjs --matches 80 --start 2100100 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic:docs/quality/evidence/ai-theater-two-step-games-2026-10-22/theater-weights.json --axis heuristic --swap --parallel 12 --out artifacts/ai-theater-two-step-games/attack-western
node scripts/ai-paired-measures.mjs artifacts/ai-theater-two-step-games/attack-western --candidate heuristic:docs/quality/evidence/ai-theater-two-step-games-2026-10-22/theater-weights.json
# theater rows: ai-position-record.mjs --theater over 8 chunks of 10 games, then
node scripts/ai-theater-realized.mjs artifacts/ai-theater-two-step-games/rows/obs__*.jsonl
# plan change: ai-theater-adherence.mjs over 4 shards, then
node scripts/ai-theater-adherence.mjs --summarize artifacts/ai-theater-two-step-games/adherence/shard-*.jsonl
```

Theater rows: 80 games, no replay hash mismatch; of the Combat entries, 2 could not be rebuilt and 5 mismatched (left
null). Adherence: 80 games, no replay hash mismatch, planning left every state unchanged. Rows SHA-256 `e1766aeacebe…`,
adherence `46d40104c887…`.

## Results

| Measure, on side minus standard, per pair (40 pairs) | Mean | 95% interval | Pairs positive / zero / negative |
|---|---:|---|---|
| **VP** | **+0.88** | **[−1.22, +2.97]** | 19 / 7 / 14 |
| Kill − Loss (steps) | −0.86 | [−3.69, +1.96] | 16 / 1 / 23 |
| Supply (units out of supply, opponent minus own) | +0.29 | [−0.44, +1.02] | 17 / 5 / 18 |

The per-pair VP SD was 6.54, not the 4.2 assumed at registration, so the power for +2 VP a pair was about 0.5.

Objective VP gained as attacker, theater attacking minus standard attacking, per pair: Game Turns 1–3 +0.33
[−0.21, +0.86], 4–8 +0.55 [−1.54, +2.64]. Attacker rows:

| Attacker | Game Turns | Rows | Potential | Realized at Combat entry | Share | Objective VP gained |
|---|---|---:|---:|---:|---:|---:|
| Standard | 1–3 | 120 | 3.16 | 1.00 | 0.32 | 0.97 |
| Two-step on | 1–3 | 120 | 3.52 | 1.18 | 0.34 | 1.08 |
| Standard | 4–8 | 200 | 2.00 | 1.34 | 0.67 | 1.20 |
| Two-step on | 4–8 | 200 | 2.21 | 1.46 | 0.66 | 1.30 |

Plan change, against the [one-step batch](../ai-theater-adherence-2026-10-22/README.md):

| Measure | One step | Two steps |
|---|---:|---:|
| Turns whose two plans differ in objectives or group sizes | 97 of 640 | 420 of 640 |
| Game Turn 1–3 theater groups from the allocation (on side moving) | 35 of 487 | 194 of 492 |
| Of which next-step groups | — | 92 |
| Units in the plan per Game Turn 1–3 turn (on side moving) | 18.7 | 23.3 |

Execution, on side moving, Game Turns 1–3, against the standard on the objectives the allocation would have picked:

| Allocation groups | Groups | Members in place at Combat | Any member in place | Attacked | Held at end |
|---|---:|---:|---:|---:|---:|
| This-step defended, two-step on moving | 99 | 0.31 | 0.45 | 0.41 | 0.32 |
| Same, standard moving (counterfactual plan) | 91 | 0.16 | 0.36 | 0.33 | 0.30 |

Next-step groups held at the end of the attacker's next player turn: 0.11 (92) with the two-step policy moving and 0.08
(97) for the standard on the same objectives in Game Turns 1–3; 0.45 (49) and 0.31 (48) in Game Turns 4–8.

## Conclusions

- The two-step allocation changes the plan: two thirds of the turns differ, about 40% of the Game Turn 1–3 groups come
  from the allocation, and the plan uses track and truck units it could not see before fuel was paid.
- Help is not established: VP +0.88 a pair with an interval from −1.22 to +2.97, Kill − Loss −0.86, Supply +0.29.
  Objective VP gained in Game Turns 1–3 rises by 0.33 a game, interval −0.21 to +0.86.
- The limit is now execution, not the plan. Of the units the allocation places beside a defended objective this step,
  31% are there at Combat (16% when the standard moves), and fewer than half the groups have any unit there. The
  allocation counts each unit's reach alone, from an unmoved, fueled start; the movement step then moves units one by
  one under stacking, ZOC of units already moved, fuel actually paid and its own scores.

## Limits

One opponent (the standard), Western Europe Axis attacks only, 40 pairs; observed VP SD 6.54, power for +2 VP a pair
about 0.5. In-place counts are taken at Combat segment entry only. The counterfactual plans are rebuilt from a fresh
policy memory at the first Movement decision of each step.
