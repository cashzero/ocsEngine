# Next-turn discount of a theater group (plan P11.8)

Boundary: offline replay of existing development games; no new game was played. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11.8](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md#策略上層).

## Question

The user chose (2026-10-22) a two-step theater allocation. A group that gets to its objective only next step is worth
its capture probability times a discount estimated from development data and frozen (choice 2a). The discount is the
share of defended objectives whose enemy strength, as the attacker sees it, has not risen by the attacker's next
Movement segment.

## Method

Data: the seven Western Europe Axis-attack folders of the P5 record, the same development data as the
[capture model](../ai-theater-capture-model-2026-10-21/README.md). `dist` built from the working tree at `076b706` plus
the projected-reach query (no change to the replayed rules), Node v26.9.0.

```sh
node scripts/ai-theater-delay.mjs artifacts/ai-assault/defender-1330/noeffort-temperate artifacts/ai-assault/defender-1330/v83-temperate artifacts/ai-assault/v84-development/attack-temperate artifacts/ai-continue/ration-fix-games/attack-temperate artifacts/ai-promotion/frozen-v81-development/attack-temperate artifacts/ai-promotion/frozen-v82r-independent/attack-temperate artifacts/ai-promotion/frozen-v85-development/attack-temperate
```

At the attacker's first Movement segment decision of each Game Turn, every objective it does not hold with enemy combat
units in it (strength from `analyze`, the bot's own estimate) is paired with the same point of the next Game Turn.
Pairs where the attacker holds the objective by then are left out. Every game reached its saved final hash; 8 min 42 s.
Output kept in `artifacts/ai-theater-capture/delay.json`.

## Results

99 distinct games (33 duplicates skipped), 34 map seeds, 2,272 pairs.

| Game Turn of the plan | Pairs | Strength not risen by next turn |
|---:|---:|---:|
| 1 | 442 | 0.4367 |
| 2 | 431 | 0.7865 |
| 3 | 388 | 0.8428 |
| 4 | 328 | 0.8994 |
| 5 | 265 | 0.9057 |
| 6 | 221 | 0.9412 |
| 7 | 197 | 0.9442 |
| All | 2,272 | 0.787 [0.761, 0.810] |

The interval resamples map seeds (2,000 draws). 3.9% of the pairs had no enemy combat unit in the objective next turn.

## Decision

The share depends strongly on the Game Turn: the defender reinforces most between Game Turns 1 and 2. A single pooled
value would overstate waiting on Game Turn 1 and understate it later, so the per-turn shares above are frozen as
`NEXT_TURN_DISCOUNT` in `src/ai/policies/theater.ts`. On the last Game Turn there is no next turn and the discount is 0.

## Limits

The discount counts any rise of the estimated strength as a lost chance and ignores a fall; it is measured on defended
objectives and also applied to empty ones. It comes from games of earlier heuristic versions, whose attackers did not
plan two steps ahead.
