# S4: heuristic@87 independent batch and promotion

Boundary: the promotion process of [AI evaluation](../../../ai/evaluation.md#標準策略的升級流程), from the registered
independent batch to the promotion. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S4.4–S4.5 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#5-s4-獨立批與基準重測). Candidate, development batch and the supply
audit decision: [S4 development record](../ai-s4-v87-2026-11-15/README.md). The user (2026-11-15): 「完成S4」.

**Result: every registered condition holds; heuristic@87 is promoted.** It is the first standard since heuristic@75
promoted through the whole process with no exception to it. Two of its parts reached S4 by the user's exceptions to the
improvement plan (S1's remaining gap; `approachAttack` after its S3 check failed); the independent batch judges the
candidate as a whole, not each part.

## Registration

[registration.json](../ai-s4-v87-2026-11-15/registration.json) and its
[notes](../ai-s4-v87-2026-11-15/registration-notes.md), committed in `07fda54` before any independent game. Candidate
`artifacts/ai-promotion/frozen-v87r` (source `4a109cc` with
[candidate.patch](../ai-s4-v87-2026-11-15/candidate.patch)), baseline `artifacts/ai-promotion/frozen-v86`. Primary measure
Kill − Loss (positive in each changed engagement, and paired mean − 2.1 SE > 0); non-inferiority margins VP 1.5 and
Supply 0.5 per pair; all games legal, complete and replayed; zero guarded supply and advance violations; full frozen
quality; the two attacker supply gates against heuristic@86's self-play on the same seeds.

## Run

```sh
P=artifacts/ai-promotion
python3 scripts/ai-promotion/batch.py $P/frozen-v87r-freeze.json $P/frozen-v86-freeze.json independent
# heuristic@86 self-play on the attack seeds, through the candidate's engine (run inside $P/frozen-v87r):
node scripts/ai-match.mjs --matches 20 --start 2400200 --parallel 3 --turns 8 --size 32x24 --divisions 6 --armored 2 \
  --air NONE --air-transport NONE --style WESTERN_EUROPE --engagement AXIS_ATTACKS \
  --allied heuristic@../frozen-v86/dist --axis heuristic@../frozen-v86/dist --swap --out $P/frozen-v87r-v86selfplay-independent/attack-western
#   (the same with --start 2400300 --style EASTERN_EUROPE into attack-eastern)
python3 scripts/ai-promotion/verify.py $P/frozen-v87r-freeze.json $P/frozen-v86-freeze.json independent [--delivered]
node scripts/ai-logistics-study.mjs <batch attack-western> <batch attack-eastern> --gate heuristic \
  --baseline <self-play attack-western> --baseline <self-play attack-eastern>      # inside $P/frozen-v87r
node scripts/ai-fuel-study.mjs <same arguments>
```

80 games, seeds 2400000–2400019 (Western Europe meeting), 2400100–2400119 (Eastern Europe meeting), 2400200–2400219
(Western Europe attack), 2400300–2400319 (Eastern Europe attack), seats exchanged, 8 Game Turns, 32×24, 6 divisions,
2 armored, no air; 40 self-play games. Node v26.9.0. Batch 09:27–09:51, self-play 09:51–10:02 (2026-11-15, local time).

`verify.py` was run twice. First without `--delivered` on the frozen builds; its acceptance.json was kept as
`acceptance-frozen-only.json` in the raw data. Then with `--delivered` from a temporary detached worktree at `4a109cc`
with candidate.patch applied and built: HEAD, the delivered sources and the build match the frozen candidate, and the
result is identical apart from `verificationScope` ([acceptance.json](acceptance.json)). `07fda54` changed only the two
registration files after `4a109cc`.

## Observed

Correctness: all 80 games finished at Game Turn 8 with 0 rejected actions, 0 errors and identical replays; no pair ended in
the same state in either engagement; supply and advance audits found no violation. The candidate made 285 advances
after combat, 283 funded (the other 2 at Game Turn 8 Combat or Exploitation, as the audit allows), and 35 successful
Overruns, all funded. Under the amended audit rule (2026-11-15) the audit recorded 234 trace losses of the moving
unit itself in the attack games (135 Western, 99 Eastern; both policies). Every one has trace or SP to eat when the
Movement Segment ends.

| Paired, heuristic@87 − heuristic@86 (40 pairs) | Mean | SE | Mean ± 2.1 SE | Registered rule | Pass |
|---|---:|---:|---|---|---|
| Kill − Loss (primary) | +5.64 | 1.45 | [+2.60, +8.67] | lower end > 0; meeting +4.63, attack +6.65 both > 0 | yes |
| VP | +0.73 | 0.83 | [−1.01, +2.46] | lower end > −1.5 | yes |
| Supply (units the opponent ends out of supply − own) | +1.34 | 0.48 | [+0.32, +2.35] | lower end > −0.5 | yes |

| Per pair, heuristic@87 − heuristic@86 (10 pairs a group) | VP | Kill − Loss | Supply |
|---|---:|---:|---:|
| Western Europe meeting | −3.20 (SD 7.1; 3 up, 5 down) | +1.35 (SD 8.4) | +0.65 |
| Eastern Europe meeting | +1.60 (SD 4.1) | +7.90 (SD 8.0) | +2.50 |
| Western Europe attack | +2.60 (SD 4.2) | +5.15 (SD 9.7) | +1.10 |
| Eastern Europe attack | +1.90 (SD 3.2) | +8.15 (SD 10.1) | +1.10 |

Totals: VP 818 against 760; steps killed 1,840 against 1,389.

Attacker supply gates: the 20 attack games where the candidate attacked, against heuristic@86 attacking on the same
match indexes in its self-play ([logistics-gate.json](logistics-gate.json), [fuel-gate.json](fuel-gate.json); full
tables in [logistics.json](logistics.json) and [fuel.json](fuel.json)):

| Measure (attacker, from Game Turn 3) | heuristic@87 | heuristic@86 self-play | Gate | Pass |
|---|---:|---:|---|---|
| Rail Cap used of SP railable forward | 100% | — | ≥ 70% | yes |
| Rear SP left after moving that no front unit can draw | 2.8 | 6.3 | ≤ standard | yes |
| Garrison stock loaded or railed | 0/0 | — | 0 | yes |
| SP no front unit can draw, a segment | 3.2 | 6.5 | ≤ standard | yes |
| Units unable to fuel, a game (share needing fuel) | 9.8 (11%) | 11.0 (12%) | reported | — |
| Dry HQs | 7% | 5% | reported | — |
| SP front units can draw, a segment | 15.0 | 14.4 | reported | — |

Reported from the same batch: heuristic@86 attacking the candidate's defender (the `defenderCut` side) leaves 8.6 rear
SP no front unit can draw, has 9.0 SP a segment no front unit can draw and 22% of its units needing fuel unable to fuel,
against 6.3, 6.5 and 12% when it attacks itself.

## What this shows

- The candidate gains in both engagements and both maps on Kill − Loss. In VP it gains in three groups and loses in
  Western Europe meeting games (−3.2 a pair, SD 7.1, 10 pairs; not separable from noise on its own).
- The attacker's supply gap that heuristic@86 was promoted with is closed on these seeds: both gates pass with about half
  the standard's undrawable SP. The development batch's worse fuel numbers (26% against 19%, 8 games) do not repeat here
  (11% against 12%); dry HQs stay slightly higher (7% against 5%).
- On the defender's side, `defenderCut` doubles the SP heuristic@86's attacker cannot bring to its front.

## Limits

- Two map styles, two engagements, one size, no air and no sea; no `ALLIED_ATTACKS`.
- 10 pairs a group: the per-group rows are directions only.
- Decision time is recorded per game, not per side. Mean milliseconds an action were 93 and 85 in the attack groups,
  against 87 and 80 in the self-play, which ran at a different parallelism.

## Raw data

`artifacts/ai-promotion/frozen-v87r-independent/` (with `acceptance-frozen-only.json`),
`frozen-v87r-v86selfplay-independent/` and `frozen-v87r-independent-gates/` of the `ai-truck-shuttle` worktree.
