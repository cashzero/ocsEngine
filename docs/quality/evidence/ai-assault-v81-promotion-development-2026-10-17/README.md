# heuristic@81 promotion development batch (assault planning by posture)

Status: not registered. The development batch does not warrant an independent run: its paired VP margin is negative and
the candidate fails both registered supply gates. heuristic@79 stays the standard computer strategy. No independent
seeds were registered or played.

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no
row of `docs/quality/03-product-operation-verification-plan.md`.

## Inputs

- Source: `293ce72` (branch `ai-truck-shuttle`, also `main`). The policy change is described in
  `docs/ai/heuristic-policy.md` (尚未升級的候選); earlier variants are in
  [ai-assault-v81-development-2026-10-17](../ai-assault-v81-development-2026-10-17/README.md).
- Opponent: frozen heuristic@79 (`artifacts/ai-promotion/frozen-v79`, from `93df378`). Both policies play through the
  candidate's engine and generator.
- Freeze: [v81-freeze.json](v81-freeze.json) (absolute paths shortened to repository-relative ones when copied).
  Frozen quality: typecheck 0, 753 tests passed / 8 skipped, smoke 0.
- Settings: 32×24, six divisions (two armored) per side, eight turns, `--air NONE --air-transport NONE`;
  TEMPERATE_INLAND and EASTERN_EUROPE; MEETING and AXIS_ATTACKS; four same-seed swapped-seat pairs per group on the
  known development seeds 1300000–1300007, 1300100–1300107, 1300200–1300207, 1300300–1300307.
- Commands (from the candidate worktree): `freeze.py artifacts/ai-promotion/frozen-v81`, `quality.py`,
  `batch.py … development`, `verify.py … development`; then, from the frozen build,
  `node scripts/ai-logistics-study.mjs <attack dirs> --gate heuristic` and
  `node scripts/ai-fuel-study.mjs <attack dirs> --gate heuristic`. The same two gate commands were replayed on the
  earlier wide-seed batches `v80q-wide` (the committed candidate) and `v80n-wide` (`artifacts/ai-assault/`).

## Expected

`docs/ai/evaluation.md`: development games legal, replayed and audited before registration; a candidate that changes
where HQs and trucks go or how far units stand from supply also passes the 攻方運補 gate and the 攻方送補 gate on the
development attack games. heuristic@81 moves HQs and trucks behind the strongest effort, so both gates apply.

## Observed ([development-acceptance.json](development-acceptance.json), [supply-gates.json](supply-gates.json))

| Group | VP v81–v79 | Δ | Games won / lost / drawn by v81 |
|---|---|---|---|
| Meeting temperate | 157–179 | −22 | 3 / 5 / 0 |
| Meeting eastern | 45–55 | −10 | 2 / 4 / 2 |
| Attack temperate | 75–57 | +18 | 6 / 2 / 0 |
| Attack eastern | 44–52 | −8 | 3 / 5 / 0 |

- Total 321–343 (−22): meeting −32, attack +10. 16-pair mean −0.69, SE 1.40, interval [−3.62, 2.24].
- 32/32 games FINISHED, replay hashes equal, 0 rejected actions, 0 errors; ordinary supply and advance audits pass.
  103 candidate Regular advances, 101 funded; 13 successful Overruns, all funded.
- 攻方運補 gate: Rail Cap 1.00 PASS; rear SP left after moving 6.3 against v79's 1.3, **FAIL**; garrison stock 0/0 PASS.
- 攻方送補 gate: SP no front unit can draw 4.0 a segment against v79's 0.2, **FAIL**. Reported without a threshold:
  attacker units unable to fuel 17.8 a game (v79 28.5), dry HQs 21% (26%).
- Wide seeds, 10 attack pairs, same gates: v80q rear SP 6.8 against 5.0 and SP no front unit can draw 1.9 against 1.8,
  units unable to fuel 11.4 against 4.5, dry HQs 5% against 1%; v80n (identical attacker rule, every effort's objective
  doubled) 5.5 against 5.0 and 1.7 against 1.8. Both fail both halving checks.

## What this shows

- The VP gain on the reused wide seeds (+1.80 ± 1.59) does not carry over to the development seeds (−0.69 ± 1.40);
  the meeting engagement, +3.30 on the wide seeds, is −4.0 a pair here.
- The two supply gates require the candidate to halve the standard's figure. A candidate that leaves logistics unchanged
  fails them too (v80n: 1.7 against 1.8), so as registered they only admit logistics improvements. Apart from the
  threshold, v81 is worse than v79 on rear SP in both seed sets and on unreachable SP on the development seeds.

## Raw data

Saves, traces, audits, gate reports and the frozen build stay in the ignored
`.claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/` (`frozen-v81*`).
