# heuristic@78 independent run (truck shuttle)

Status: FAIL (VP gate). heuristic@78 is not promoted; heuristic@75 stays the standard computer strategy. Every
correctness and supply check passed, and the attacker logistics gate passed.

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This evidence does not
change any UI row of `docs/quality/03-product-operation-verification-plan.md`.

## Inputs

- Source: `affa01a` on branch `ai-truck-shuttle` (base `4222bbe`, which registered the attacker logistics gate). The policy
  change is the per-truck leg state machine described in `docs/ai/heuristic-policy.md` (後勤); `643bfd4` also fixes
  LOAD_SUPPLY candidates to offer only the Tokens a dump may still load (12.2a).
- Opponent: heuristic@75, the frozen build `artifacts/ai-vp/baseline-75` (`baseline-75-freeze.json`). Both policies play
  through the candidate's engine and generator.
- Freeze: [v78-freeze.json](v78-freeze.json). Frozen quality: typecheck 0, 748 tests passed / 8 skipped, smoke 0.
- Registration: [v78-registration.json](v78-registration.json), written and copied here before the first independent
  game. `register.py` scans only the checkout it runs in, so the ranges were also checked against every
  `match-*.save.json` under the main checkout, `tmp/` and all worktrees, and against
  `artifacts/ai-promotion/played-seeds.tsv`: no overlap.
- Settings: 32×24, six divisions (two armored) per side, eight turns, `--air NONE --air-transport NONE`;
  TEMPERATE_INLAND and EASTERN_EUROPE; MEETING and AXIS_ATTACKS; ten same-seed swapped-seat pairs per group.
- Match indexes: meeting temperate 6900000–6900019, meeting eastern 6900100–6900119, attack temperate
  6900200–6900219, attack eastern 6900300–6900319.
- Commands (from the candidate worktree): `freeze.py`, `quality.py`, `batch.py … development`, `verify.py … development`,
  `register.py … 6900000`, `batch.py … independent`, `verify.py … independent --delivered`; then
  `node scripts/ai-logistics-study.mjs <attack dirs> --gate heuristic` on both batches.

## Expected

Registered in `v78-registration.json`: MEETING and AXIS_ATTACKS VP deltas both positive; 40-pair mean VP gain minus
2.1 × SE above 0; every game FINISHED with a matching replay hash, no rejected action and no error; supply and advance
audit violations 0; full frozen quality. Attacker logistics gate (`docs/ai/evaluation.md`, 攻方運補 gate) on the
development batch.

## Observed ([v78-result.json](v78-result.json))

| Group | VP v78–v75 | Δ | Games won / lost / drawn by v78 |
|---|---|---|---|
| Meeting temperate | 409–371 | +38 | 13 / 4 / 3 |
| Meeting eastern | 152–140 | +12 | 9 / 8 / 3 |
| Attack temperate | 156–164 | −8 | 9 / 8 / 3 |
| Attack eastern | 124–90 | +34 | 11 / 7 / 2 |

- Total 841–765 (+76): meeting +50, attack +26, both positive.
- 40-pair mean VP gain +0.95, SE 0.526, interval [−0.155, 2.055]. The lower bound is below 0: **VP gate fails**.
- 80/80 games complete, replay hashes equal, 0 rejected actions, 0 errors; supply audit and advance audit pass
  (`verify.py`). 258 candidate Regular advances, 253 funded; 30 successful Overruns, all funded.
- Step losses: v78 lost 1,383 and killed 1,426.
- Development batch (known seeds 1300000–1300307, 32 games): 354–310 (+44), meeting +30, attack +14, 16-pair mean
  +1.375, interval [−0.006, 2.756].
- Attacker logistics gate, development: PASS (rail 1.00; rear SP after moving 2.6 vs 12.0; garrison stock 0/0).
  The same check on the independent attack games also passes: rail 1.00; rear 3.0 vs 8.8 SP; stock 0/0; SP within 4
  hexes of the enemy 5.4 vs 2.9; SP loaded per truck point 0.36 vs 0.28.

## Raw data

Saves, traces, audits and the frozen build stay in the ignored
`.claude/worktrees/ai-truck-shuttle/artifacts/ai-logistics/` (`candidate-78*`). The played seeds were appended to
`artifacts/ai-promotion/played-seeds.tsv` in the main checkout.
