# Theater allocation in play, Western Europe (plan P11.8)

Boundary: headless bot-against-bot games and offline analysis. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[P11.8](../../../roadmap/18-position-metrics-wbs.md); design: [theater supply allocation](../../../ai/theater-supply-plan.md#策略上層).
The user asked (2026-10-21) to complete the implementation and learn whether it helps; promotion is not in scope, and
the work is Western Europe only.

## Registration

[registration.json](registration.json) and [theater-weights.json](theater-weights.json) were committed (`2a2f749`)
before any game: 80 new Western Europe Axis-attack games (matches 2100000–2100079), theater allocation on
(`heuristic:` with `theaterAllocation` 1) against the standard, seat-swapped pairs. Primary measure: VP margin of the
on side, pair mean with a 95% t interval; helps if the interval is above 0. Secondary: Kill − Loss, Supply, and the
attacker's potential, realized value and objective VP gained by Game Turn. Power: per-pair VP SD about 5.4, so 40 pairs
give an SE about 0.85: power about 0.65 for +2 VP a pair, about 0.98 for +3.

## Run

- Source `2a2f749`, `dist` built from it, Node v26.9.0. All 80 games finished and passed the replay check (1,040 s,
  12 processes). Summary SHA-256 `9ef474f7…` (`artifacts/ai-theater-allocation-games/attack-western`).

```sh
node scripts/ai-match.mjs --matches 80 --start 2100000 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic:docs/quality/evidence/ai-theater-allocation-games-2026-10-21/theater-weights.json --axis heuristic --swap --parallel 12 --out artifacts/ai-theater-allocation-games/attack-western
```

- Theater rows: the 80 games recorded with `ai-position-record.mjs --theater` in 8 chunks (8 min 32 s); no replay hash
  mismatch; 8 Combat entries not rebuilt.

## Results

| Measure, on side minus standard, per pair (40 pairs) | Mean | 95% interval | Pairs positive / zero / negative |
|---|---:|---|---|
| **VP** | **+1.10** | **[−0.23, +2.43]** | 10 / 26 / 4 |
| Kill − Loss (steps) | +0.48 | [−1.47, +2.42] | 13 / 14 / 13 |
| Supply (units out of supply, opponent minus own) | +0.23 | [−0.14, +0.59] | 12 / 21 / 7 |

When the theater side attacks, the attacker's mean final margin is +0.80 VP; when the standard attacks, −1.40.

Attacker rows (means per row):

| Attacker | Rows | Potential | Realized at Combat entry | Share | Objective VP gained |
|---|---:|---:|---:|---:|---:|
| Standard, Game Turns 1–3 | 120 | 3.41 | 1.11 | 0.33 | 1.00 |
| Theater on, Game Turns 1–3 | 120 | 3.40 | 1.06 | 0.31 | 1.04 |
| Standard, Game Turns 4–8 | 200 | 1.78 | 1.06 | 0.60 | 0.99 |
| Theater on, Game Turns 4–8 | 200 | 2.05 | 1.26 | 0.61 | 1.22 |

## Earlier observations

Before this batch the candidate was taken, by mistake, through the promotion procedure; the user stopped it. Their
Western Europe data, observations only:

- Development batch of the frozen candidate v86 against the frozen v85 (`dc9d6fc`, known seeds 1300200–1300207): 4
  Western attack pairs, VP +2.75 ± 1.70, Kill − Loss +7.1 ± 2.2, Supply +0.1 ± 1.1 a pair; meeting games unchanged.
- The registered independent batch (2000200–2000239 Western, 2000300–2000339 Eastern) was stopped after 25 games of
  each map, because it included Eastern Europe against the research scope; it is void. Its 12 complete Western pairs:
  VP +1.92 ± 1.55, Kill − Loss −0.2 ± 2.1 a pair. Eastern results were not read. These match numbers are used.

The first frozen candidate failed the truck-shuttle test: a theater group's lead was its member's current hex, so
trucks followed it away from the front. The lead is now the objective, and groups below a capture probability of 0.25
are dropped (`dc9d6fc`).

## Conclusions

- Whether the theater allocation helps is not established: the VP gain is +1.10 a pair with an interval from −0.23 to
  +2.43, and Kill − Loss and Supply show no clear change. 26 of 40 pairs end with the same margin.
- The mechanism it aimed at did not move: in Game Turns 1–3 the attacker realizes the same share of the potential
  (0.31 against 0.33) and gains the same objective VP. The small positive VP comes from Game Turns 4–8.

## Limits

One opponent (the standard), Western Europe Axis attacks only, 40 pairs; the power for an effect of +2 VP a pair was
about 0.65. The bot-side allocation estimates enemy strength and assumes defenders pay supply; it is not the
measurement-side allocation of the metric.
