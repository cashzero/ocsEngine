# S5.2b, S5.4c and S5.4d: each weight alone, and cand2

Boundary: continuations of recorded games; no new game. The standard is unchanged (heuristic@86). This record changes
no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S5.2b and S5.4 (sections 7.4 and 7.6) of the
[AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-16): 「2+3」.

## Result

**`optionAdvance` is the largest single gain, and cand2 (S5.2's candidate plus `optionAdvance`) changes VP by +1.24 ±
0.38 an attack pair.** An independent batch of 40 attack pairs would pass with probability 0.50 (pair SD 3.7) or 0.37
(4.5). By the registered reading the result goes to the user: it is neither at least 0.8 nor below 0.5 at both SDs.

| Weight alone − heuristic@86, VP a game at the end | Western | Eastern | Role effect | Pair effect |
|---|---|---|---|---|
| `optionAdvance`, attacker | +1.35 ± 0.41 | +0.98 ± 0.35 | +1.17 ± 0.27 | **+0.58 ± 0.14** |
| `defenderCut`, defender | +1.68 ± 0.61 | +0.30 ± 0.27 | +0.99 ± 0.33 | **+0.49 ± 0.17** |
| `arrivalRailForward` + `hqBridge`, attacker (cand − approach) | +0.18 ± 0.30 | +0.40 ± 0.23 | +0.29 ± 0.19 | **+0.29 ± 0.13** (with the defender row below) |
| `arrivalRailForward`, defender | +0.32 ± 0.29 | +0.25 ± 0.23 | +0.28 ± 0.18 | |
| `approachAttack`, attacker | +1.44 ± 0.78 | −0.36 ± 0.65 | +0.54 ± 0.51 | +0.08 ± 0.35 |
| `approachAttack`, defender | −1.17 ± 0.70 | +0.40 ± 0.72 | −0.39 ± 0.50 | |

The first three are established (mean − 2.1 SE > 0); `approachAttack` is not. By the registered rule (pair effect above
0) all five weights are kept. `optionAdvance` trades steps for objectives as intended: objectives margin +0.49 and Kill −
Loss −1.22 a game for the attacker. Its +1.17 is close to the S5.4a census bound (1.46). `defenderCut` buys kills (Kill −
Loss +2.27) and some objectives (+0.27).

| cand2 − heuristic@86, VP a game at the end | Attacker | Defender | Roles equally |
|---|---|---|---|
| Western Europe (120 maps) | +2.68 ± 0.78 | +0.26 ± 0.76 | +1.47 ± 0.55 |
| Eastern Europe (18 maps) | +0.92 ± 0.73 | +1.08 ± 0.76 | +1.00 ± 0.54 |
| **All four cells equally (an attack pair)** | | | **+1.24 ± 0.38** |
| Without the 28 S4.7 branches | | | +0.97 ± 0.38 |

The defender rows equal S5.2's candidate's, since `optionAdvance` acts for the attacker only. The candidate's attacker
gained +1.06 (Western) and +0.88 (Eastern).

Pass probability by batch size (post hoc, the same formula; the batch size is the user's decision):

| Attack pairs (games) | Pair SD 3.7 | Pair SD 4.5 |
|---|---:|---:|
| 40 (80) | 0.50 | 0.37 |
| 80 (160) | 0.75 | 0.61 |
| 120 (240) | 0.85 | 0.75 |

## Method

[registration.json](registration.json) (`28833e0`) and [registration-amendment.json](registration-amendment.json)
(`d686ac1`, before any part result was read: the attacker's arrival and bridge are measured together, at the user's
「也太久」). [analysis.py](analysis.py) `parts` and `cand2`. Builds `14719f7` (optionAdvance). Branches, dice and
heuristic@86's rows are S5.2's ([S5.2](../ai-s5-vp-check-2026-11-15/README.md)). Part runs: 2026-11-16 09:37 to 15:20
(stopped at 13:28 for the amendment and resumed). cand2: 15:21 to 17:38. Every continuation finished the game.

## Limits

- cand2's weights were selected on these branches. `optionAdvance` was clearly established, but the estimate is
  biased upward by however much the selection rule favoured noise. The independent batch is the unbiased test.
- `approachAttack` is kept with a pair effect indistinguishable from 0. On the Western defender it is −1.17 ± 0.70.
- Branches start at Game Turn 2; Eastern Europe has 18 maps; 28 Eastern branches had results seen in S4.7.

## Raw data

`artifacts/ai-s5/s52b/` (parts, compare reports, `analysis-parts.txt`) and `artifacts/ai-s5/s52c/` (cand2) of the
`ai-truck-shuttle` worktree; heuristic@86's rows in `artifacts/ai-s5/s52/`.
