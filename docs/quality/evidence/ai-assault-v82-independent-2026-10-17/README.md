# heuristic@82 independent run (attacker on v79, assault planning for defender and meeting)

Status: FAIL (VP gate). heuristic@82 is not promoted; heuristic@79 stays the standard computer strategy. Every correctness
and supply check passed, and both supply gates passed on the development batch.

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This evidence does not
change any row of `docs/quality/03-product-operation-verification-plan.md`.

## Inputs

- Source: `9fbcf57` on branch `ai-truck-shuttle`. The policy is `e6539df` (`docs/ai/heuristic-policy.md`, 尚未升級的候選);
  `9fbcf57` only changes the two supply-gate scripts and documents. Before pushing, `9fbcf57` was rebased onto `7990052`
  (artillery barrages against ports and air bases, which also changes the rules engine and the AI) as `66b5454`; the code
  measured here is the frozen `9fbcf57` build, not `main` after that commit. Development:
  [ai-assault-v82-development-2026-10-17](../ai-assault-v82-development-2026-10-17/README.md).
- Opponent: heuristic@79, the frozen build `artifacts/ai-promotion/frozen-v79` (`93df378`). Both policies play through the
  candidate's engine and generator.
- Freeze: [v82-freeze.json](v82-freeze.json) (`frozen-v82r`; absolute paths shortened when copied). Frozen quality:
  typecheck 0, 753 tests passed / 8 skipped, smoke 0.
- Registration: [v82-registration.json](v82-registration.json), written 2026-10-17T05:54:10Z and copied here before the first
  independent game. The ranges were checked before registration against all 1,168 `match-*.save.json` under the main
  checkout, `tmp/` and every worktree, and against `artifacts/ai-promotion/played-seeds.tsv`: no overlap. The 80 seeds were
  then appended to that ledger.
- Settings: 32×24, six divisions (two armored) per side, eight turns, `--air NONE --air-transport NONE`;
  TEMPERATE_INLAND and EASTERN_EUROPE; MEETING and AXIS_ATTACKS; ten same-seed swapped-seat pairs per group.
- Match indexes: meeting temperate 8100000–8100019, meeting eastern 8100100–8100119, attack temperate 8100200–8100219,
  attack eastern 8100300–8100319.
- Commands (from the candidate worktree): `freeze.py artifacts/ai-promotion/frozen-v82r`, `quality.py`,
  `batch.py … development`, `verify.py … development`; frozen-v79 self-play on the development attack seeds
  (`frozen-v82r-selfplay`); `ai-logistics-study.mjs` and `ai-fuel-study.mjs` with `--baseline <self-play> --gate heuristic`;
  `register.py … 8100000`, `batch.py … independent`, `verify.py … independent --delivered`.

## Expected

Registered in `v82-registration.json`: MEETING and AXIS_ATTACKS VP deltas both positive; 40-pair mean VP gain minus
2.1 × SE above 0; every game FINISHED with a matching replay hash, no rejected action and no error; supply and advance
audit violations 0; full frozen quality. 攻方運補 and 攻方送補 gates (`docs/ai/evaluation.md`, compared with the standard's
self-play on the same seeds since 2026-10-17, user decision) on the development batch.

## Observed ([v82-result.json](v82-result.json))

| Group | VP v82–v79 | Δ | Games won / lost / drawn by v82 |
|---|---|---|---|
| Meeting temperate | 269–319 | −50 | 5 / 7 / 8 |
| Meeting eastern | 140–124 | +16 | 3 / 3 / 14 |
| Attack temperate | 182–162 | +20 | 9 / 11 / 0 |
| Attack eastern | 115–121 | −6 | 11 / 8 / 1 |

- Total 706–726 (−20): meeting −34, attack +14. Meeting is negative: **VP gate fails**.
- 40-pair mean VP gain −0.25, SE 0.579, interval [−1.47, 0.97]: **fails** as well.
- 80/80 games complete, replay hashes equal, 0 rejected actions, 0 errors; supply audit and advance audit pass
  (`verify.py`). 239 candidate Regular advances, 238 funded; 32 successful Overruns, all funded. Steps: v82 killed 1,358,
  lost 1,323.
- Development batch (known seeds 1300000–1300307, 32 games): 16-pair mean +1.375, SE 1.466; meeting −22, attack +66
  (game sums). Supply gates on it: rail 1.00, rear SP 5.4 vs 5.4, garrison 0/0, SP no front unit can draw 1.7 vs 1.7; all
  pass (v82's attacker plays the standard's games, so the two sides are equal).

## What this shows

- The meeting engagement, where v82 plans assaults from the column the Combat Segment accepts, guns and SP pricing, lost on
  the independent seeds (−34; −1.38 a pair on the development seeds, +5.10 on the reused wide seeds). The wide-seed gain
  did not carry over.
- The attack engagement, where only the defender changed (v82's attacker plays v79), was +14, +0.35 a game; development
  measured the defending effect at +8.25 and +2.40 a pair against v79 self-play.

## Raw data

Saves, traces, audits and the frozen build stay in the ignored
`.claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/` (`frozen-v82r*`).
