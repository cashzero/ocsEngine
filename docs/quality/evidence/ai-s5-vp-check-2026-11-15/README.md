# S5.2: VP check of the attack-only candidate before an independent batch

Boundary: continuations of recorded games; no new game. The standard is unchanged (heuristic@86). This record changes
no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S5.2 (section 7.4) of the [AI strategy
improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-15): 「開始執行S5」.

## Result

**The registered reading recommends not registering the independent batch.** The candidate (heuristic@86 plus the four
parts, with `approachAttack` and `arrivalRailForward` in attack engagements only) changes VP by **+0.75 ± 0.38 an attack
pair**. A batch of 40 attack pairs needs an observed mean above 1.23 (pair SD 3.7) or 1.49 (pair SD 4.5). The predicted
pass probabilities are **0.25 and 0.18**, both below 0.5. No style × role cell is established worse.

| cand − heuristic@86, VP margin a game, end of the game | Attacker | Defender | Roles equally |
|---|---|---|---|
| Western Europe (229 games, 120 maps, 1 dice) | +1.62 ± 0.79 | +0.26 ± 0.76 | +0.94 ± 0.55 |
| Eastern Europe (53 games, 18 maps, 2 dice) | +0.04 ± 0.71 | +1.08 ± 0.76 | +0.56 ± 0.52 |
| **All four cells equally (an attack pair)** | | | **+0.75 ± 0.38** |
| Without the 28 branches reused from S4.7 | | | +0.45 ± 0.38 |

SEs are over maps. The candidate's end of the game differs from heuristic@86's on 563 of 564 branches. Every one of the
1,228 continuations finished the game.

Other measures (all cells equally, a game): objectives margin +0.27 ± 0.16, Kill − Loss +2.56 ± 0.89, units out of trace
margin −0.61 ± 0.32 (fewer of its own). The pattern of S4.7 holds: the parts buy kills and supply more than objectives.

| Independent batch of 40 attack pairs | Threshold (observed mean) | Pass probability |
|---|---:|---:|
| Pair SD 3.7 (the last batch's attack pairs) | +1.23 | 0.25 |
| Pair SD 4.5 | +1.49 | 0.18 |

## Against earlier estimates (post hoc)

- The S4.8 estimates were +1.43 ± 0.37 (the two registered part tests) and +1.84 ± 0.54 (the whole candidate, including
  the last batch's own numbers). This check, on 564 branches mostly apart from those data, measures +0.75 ± 0.38.
- The Western attacker's +1.62 ± 0.79 agrees with S3.2's `approachAttack` for the attacker (+2.00 ± 0.59, other
  Western maps).
- The defender's gain is much smaller than the last batch suggested: Eastern +1.08 ± 0.76 (S4.7 measured +4.14 ± 1.64 on
  14 of these branches) and Western +0.26 ± 0.76. The batch's role split (+3.60 ± 1.03 defending) is not reproduced.
- Variance: a Western branch's single-dice SD is 11.1 to 11.5, against 6.3 to 8.7 on S4.7's 28 Western branches. The
  planned 6 to 7 pooled the two styles. An Eastern branch's is 6.0 to 6.5. So the Western roles have SEs of about 0.77,
  not the planned 0.48. The Eastern roles have about 0.73, not 1.0. The estimate's SE (0.38) is as planned (0.39).
- The Western source sets differ (attacker: allocation +3.04 ± 1.29, execution +1.82 ± 1.14, HQ +0.20 ± 1.48). None
  of them is established apart from the others.

## Method

[registration.json](registration.json), committed in `7d99c60` before any continuation; [analysis.py](analysis.py).
Branch lists: [branches-west.jsonl](branches-west.jsonl) (458), [branches-east.jsonl](branches-east.jsonl) (78),
[branches-east-s47.jsonl](branches-east-s47.jsonl) (28 reused). Candidate: [cand-weights.json](cand-weights.json).
Build `467b5bb`, Node v26.9.0. Run 2026-11-15 20:09 to 2026-11-16 00:13 (10 processes).

```sh
F=docs/quality/evidence/ai-s5-vp-check-2026-11-15
V="--variant v86=heuristic --variant cand=heuristic:$F/cand-weights.json --opponent heuristic@artifacts/ai-promotion/frozen-v86/dist --horizons 1 --jobs 10"
node scripts/ai-continue-batch.mjs --branches $F/branches-east.jsonl $V --dice 2 --out-dir artifacts/ai-s5/s52/east
node scripts/ai-continue-batch.mjs --branches $F/branches-west.jsonl $V --dice 1 --out-dir artifacts/ai-s5/s52/west
python3 $F/analysis.py
```

## Limits

- Branches start at Game Turn 2; the candidate's Game Turn 1 is not in the estimate.
- Eastern Europe has 18 maps, and 28 of its 106 branches had results already seen in S4.7.
- The Western positions come from October 2026 games of the theater-weight experiments against the heuristic of that
  time. They were replayed with this engine to their recorded final states, but their Game Turn 1 was not played by
  heuristic@86.
- The pass probability treats the batch's sample SD as the given pair SD and the observed mean as normal.

## Raw data

`artifacts/ai-s5/s52/` of the `ai-truck-shuttle` worktree (`east/`, `west/`, `reused/` continuations; `compare-all.*`,
`compare-new.*`, `analysis.txt`).
