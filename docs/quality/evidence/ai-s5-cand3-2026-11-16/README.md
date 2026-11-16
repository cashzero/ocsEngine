# S5.4: cand3, `approachAttack` for the attacker only

Boundary: continuations of recorded games; no new game. The standard is unchanged (heuristic@86). This record changes
no row of `docs/quality/03-product-operation-verification-plan.md`. The user (2026-11-16): 「好 3接2」.

## Result

**cand3 changes VP by +1.53 ± 0.32 an attack pair, above cand2's +1.24, so cand3 goes to S5.3.** cand3 has cand2's five
weights (`approachAttack` 1, `arrivalRailForward` 1, `hqBridge` 1, `defenderCut` 2, `optionAdvance` 1), with
`approachAttack` acting for the attacker of an attack engagement only (`6b15f8d`).

| cand3 − heuristic@86, VP a game at the end | Attacker | Defender | Roles equally |
|---|---|---|---|
| Western Europe (120 maps) | +2.68 ± 0.78 | +1.88 ± 0.62 (cand2 +0.26) | +2.28 ± 0.53 |
| Eastern Europe (18 maps) | +0.92 ± 0.73 | +0.62 ± 0.39 (cand2 +1.08) | +0.77 ± 0.39 |
| **All four cells equally (an attack pair)** | | | **+1.53 ± 0.32** |

| Independent batch, attack pairs | Pair SD 3.7 | Pair SD 4.5 |
|---|---:|---:|
| 40 | 0.67 | 0.52 |
| 80 (the user's choice for S5.3) | 0.89 | 0.78 |
| 120 | 0.96 | 0.90 |

The attacker decides as cand2: on 4 attacker branches cand3's 12 rows equal cand2's column by column, so cand2's attacker
rows stand for cand3's. 335 defender continuations, all finished the game (2026-11-16 19:50 to 20:55).

## Method

[registration.json](registration.json) and [analysis.py](analysis.py), committed in `5280474` before any continuation.
Defender branches of [S5.2](../ai-s5-vp-check-2026-11-15/README.md); heuristic@86's rows are S5.2's.

## Limits

- `approachAttack`'s defender effect (S5.2b) and the choice between cand2 and cand3 come from the same branches, so the
  estimate is biased upward by the selection. The independent batch is the unbiased test.
- The Eastern defender got worse (+1.08 to +0.62): there `approachAttack` had helped the defender (+0.40 ± 0.72 alone).

## Raw data

`artifacts/ai-s5/s52d/` (defender continuations, `attacker-from-cand2/`, compare reports) and `artifacts/ai-s5/s52d-check/`
of the `ai-truck-shuttle` worktree.
