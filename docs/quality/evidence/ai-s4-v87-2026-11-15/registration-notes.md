# heuristic@87 independent batch: registration notes

Written with [registration.json](registration.json) (`register.py`, 2026-11-15T01:26:57Z) before any independent game.

- Candidate: `artifacts/ai-promotion/frozen-v87r` (source `4a109cc` with [candidate.patch](candidate.patch)), baseline
  `artifacts/ai-promotion/frozen-v86`. Frozen quality: typecheck, 823 tests passed and 7 skipped, smoke.
- Development batch of the re-frozen candidate (same seeds as before): all 32 games legal, replayed, zero guarded supply
  and advance violations under the amended audit; both engagements changed. Per pair: Kill − Loss +5.03 (SE 1.64; meeting
  +3.6, attack +6.4), VP +0.75 (SE 0.87), Supply +0.41 (SE 0.27).
- Primary measure **Kill − Loss**; non-inferiority margins **VP 1.5** and **Supply 0.5** per pair. 80 games, 20 a group
  (Western and Eastern Europe, meeting and Axis attacks), seeds 2400000–2400019, 2400100–2400119, 2400200–2400219,
  2400300–2400319, seats exchanged.
- Power, from the development batch's per-pair spreads (Kill − Loss 6.6, VP 3.5, Supply 1.1) over 40 pairs: the primary
  measure passes (mean − 2.1 SE > 0) with probability about 0.90 if its true effect is +3.5 (a third below the
  development estimate), and is positive in each engagement with probability about 0.99; VP clears its margin with about
  0.98 at +0.75 and 0.74 at 0; Supply with about 0.999 at +0.4 and 0.80 at 0. Together about 0.87.
- Attacker supply gates (the candidate changes trucks and HQ placement): on the independent attack games the candidate
  attacked, against heuristic@86's self-play on the same seeds (seats exchanged, through the candidate's engine):
  rail at least 70% of the SP railable forward, rear SP no front unit can draw at most heuristic@86's, no garrison stock
  loaded or railed, SP no front unit can draw at most heuristic@86's. Units unable to fuel and dry HQs are reported.
- The user's decisions behind the candidate: S1's remaining gap kept as the exception, `approachAttack` carried to S4 as
  an exception after its S3 check failed, the amended supply audit (2026-11-15), and 「完成S4」.
