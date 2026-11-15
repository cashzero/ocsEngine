# Review of the S4.7 diagnosis: why heuristic@87 failed on VP, and what follows

Boundary: re-analysis of recorded results; no new game and no new continuation. The standard is unchanged
(heuristic@86). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. It reviews the
[S4.7 diagnosis](../ai-s4-vp-diagnosis-2026-11-15/README.md) at the user's request (2026-11-15: 「仔細分析opus 的研究。
給出解決方案」). Everything here is post hoc; the numbers come from [review.py](review.py) on the S4.7 continuations and
from the recorded results it names.

## What the review changes

1. **The candidate's VP was predictable, and below what the gate can detect.** Only two of the four parts were ever
   tested on VP: `approachAttack` for the attacker (S3.2, 160 branches: +2.00 ± 0.59 a game) and `defenderCut`
   (S2.3, 239 branches: +0.85 ± 0.46). The two supply parts were built to close the supply-gate exception; S1.4a had
   already found that sustained supply does not limit the attacker's VP after Game Turn 3. Together the part tests
   predict +1.43 ± 0.37 an attack pair and nothing in meeting engagements, so +0.71 a pair over 20 attack and 20 meeting
   pairs. The independent batch measured +0.73. A candidate judged on both engagements needs an observed mean above
   1.74 (SE 0.83).
2. **The gate failure was mostly decided by the candidate's scope.** `approachAttack` and `arrivalRailForward` have no
   engagement condition, so they changed meeting games, where neither was designed or tested. That made the meeting
   engagement count: half the pairs went to it, at SD 6.1 against 3.7, and its mean had to be positive. Simulated with
   the batch's SDs, a candidate whose true attack effect is the observed +2.25 and whose meeting effect is 0 passes
   with probability 0.24 (0.11 at −0.8 in meeting). With meeting games unchanged, the same 80 games are 40 attack
   pairs and it passes with 0.85–0.96.
3. **In meeting engagements `approachAttack` goes opposite ways on the two map styles; the pooled −0.43 hid it.**

   | `approachAttack` − heuristic@86, meeting, a game | Western Europe (48 branches) | Eastern Europe (28) |
   |---|---|---|
   | VP margin | −1.77 ± 0.99 | +1.86 ± 0.92 |
   | Own attacks | −0.66 ± 0.28 | +0.79 ± 0.31 |
   | Enemy steps lost | −0.19 ± 0.86 | +2.55 ± 1.24 |
   | Own steps lost | +0.44 ± 0.87 | −3.32 ± 1.64 |
   | Own objectives | −0.18 ± 0.16 | +0.27 ± 0.15 |

   Eastern minus Western VP: +3.63 ± 1.36. The independent batch has the same split (Western meeting −3.20 a pair,
   Eastern +1.60), and so do the Western positions from seeds apart from the batch (B5 self-play: −2.15 ± 1.34, 20
   branches). On the sparse Eastern maps closing in adds attacks, kills and objectives; on the dense Western maps it
   lowers the number of attacks and adds no kills.
4. **The S4.7 reading "`approachAttack` in meeting engagements trades objectives for kills" does not hold.** Its pooled
   Kill − Loss gain comes from the Eastern maps and its pooled VP loss from the Western ones. The adjustment behind
   that reading also conditions on Kill − Loss, which the change itself moves.
5. **"`defenderCut` buys kills, not VP" rests on 28 branches and leaves out the larger registered test.** S4.7: −0.18 ±
   0.58; S2.3: +0.85 ± 0.46; pooled +0.45 ± 0.36. Small and not established, but not negative.
6. **"The gain comes from the defender" is not established.** Batch role split: defending +3.60 ± 1.03, attacking
   +0.90 ± 1.63; their difference is 2.7 ± 1.9. Continuations: +1.82 ± 1.04 and +1.21 ± 1.00. Pooled with the
   development batch: defender +2.47 ± 0.71, attacker +1.21 ± 0.83. In the defender's continuations the largest single
   part is `approachAttack` (+1.25 ± 1.01), not `defenderCut`.
7. **Noise.** Meeting: the VP difference is almost all dice (single-dice SD 12.4; no measurable variation between
   positions), so dice and branches are interchangeable there. Attack roles: positions differ (between-branch SD 2.4–
   3.2), so branches are needed. With 150 branches × 2 dice the SE is about 0.54 (meeting), 0.43 (attacker), 0.45
   (defender).

What stands from S4.7: the batch fails on VP; the meeting −0.80 ± 1.37 cannot be told from 0; the supply parts leave
objectives unchanged; the registered power analysis used an SD 2.5 times too small.

## Numbers for a next candidate

| Whole candidate, VP a game | Estimate | From |
|---|---|---|
| Attacker | +1.21 ± 0.83 | S4.7 continuations, batch role split, development batch |
| Defender | +2.47 ± 0.71 | the same |
| Attack pair | +1.84 ± 0.54 | half their sum |
| Attack pair, registered part tests only | +1.43 ± 0.37 | S3.2 and S2.3 |

VP gate with meeting games unchanged (40 attack pairs, pass when mean − 2.1 SE > 0):

| True effect an attack pair | Pair SD 3.7 (this batch) | Pair SD 4.5 |
|---|---:|---:|
| +1.00 | 0.36 | 0.25 |
| +1.43 | 0.63 | 0.47 |
| +1.80 | 0.83 | 0.67 |
| +2.25 | 0.96 | 0.85 |

The earlier Western attack batches had pair SDs of 4.9 and 6.5 (heuristic@86 against heuristic@85).

Another place VP is left: attacks that clear an objective which nobody then enters, 0.60 a game for heuristic@86's
attacker in self-play and 0.90 for the candidate's (0.47–0.60 a side in meeting games); 0.25–0.40 a game are entered by
a move later in the same player turn. The advance responder always takes an objective when a supplied advance exists
(`src/ai/decisions.ts`), so these are advances that could not be funded or had no attacker left: the part of error E3
recorded as not tested.

## Limits

- Post hoc throughout. The map-style split is the batch's own stratum, but it was looked at after the pooled result.
- The pooled estimates mix branch points from Game Turn 2, whole games and different dice; the batch's own numbers are
  in the whole-candidate rows, so those rows are optimistic for a new batch.
- The gate simulation draws pairs as normal with the batch's SDs.

## Raw data

`artifacts/ai-vp-why/cont/` of the `ai-truck-shuttle` worktree.
