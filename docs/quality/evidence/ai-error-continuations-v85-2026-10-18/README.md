# Error list: E2 causes, E3 and E5 continuation tests against heuristic@85

Boundary: offline replays and headless continuations through the Gameplay Engine. No policy change is adopted by this record;
it changes no row of `docs/quality/03-product-operation-verification-plan.md`. Findings are kept in
[policy-errors](../../../ai/policy-errors.md).

## Inputs

- Positions: `artifacts/ai-assault/v84-development` (v79 self-play, `7d88f3d`), even matches only: the two games of each
  pair are the same game. 32×24, six divisions (two armored), eight turns, no on-map air; seeds 1300000–1300307.
- Baseline variant `v85` = `heuristic` at `e89b7de` plus two knobs whose defaults change nothing: `advanceThreatLimit`
  (8) and the existing weights. Opponent: frozen heuristic@85 (`artifacts/ai-promotion/frozen-v85`). Four common dice
  seeds per branch point; horizons T0 + 1, T0 + 2 and the end.
- E3 branch points ([declined-advance-branches.jsonl](declined-advance-branches.jsonl)): `ai-find-branches.mjs --kind
  declined-advance`, the first Combat Segment from Game Turn 2 in which a side declined every advance, 30 points. Variant
  `fix`: `advanceThreatLimit` 1e9 (advance into a non-objective hex whatever the enemy threat, when a supplied advance exists).
- E5 branch points ([idle-combat-branches.jsonl](idle-combat-branches.jsonl)): `ai-error-census.mjs --branches`, Combat
  Segments with no attack although a legal one reached column 6+ at the start, 27 points. Variants `supplyLow`
  (`combatSupply` 1.5 → 0.5) and `thresholdLow` (`attackThreshold` 4 → 2).
- E2: `node scripts/ai-supply-study.mjs <dir>` on the four groups (16 distinct games, both sides).

## Observed

E3, advance whatever the threat ([declined-advance-compare.json](declined-advance-compare.json)), fix − v85 at the end
(n 30): own steps lost +1.39 ± 0.66 (t +2.1), kills +1.06 ± 0.55, Kill − Loss −0.33 ± 0.82, VP margin −0.22 ± 0.47, enemy
units out of trace +0.64 ± 0.49. At T0 + 1 Kill − Loss +0.27 ± 0.11 (t +2.5), gone by the end.

E5 ([idle-combat-compare.json](idle-combat-compare.json)), variant − v85 at the end (n 27):

| | supplyLow | thresholdLow |
|---|---|---|
| Own attacks | +0.98 ± 0.20 | +0.37 ± 0.15 |
| Kill − Loss | +0.66 ± 0.82 | +0.48 ± 0.35 |
| VP margin | −0.04 ± 0.31 | 0.00 ± 0.11 |
| Own SP on the map | −0.98 ± 0.64 | −0.23 ± 0.27 |

supplyLow at T0 + 1: kills +0.45 ± 0.14 (t +3.3), own steps lost +0.17 ± 0.08. Across its branch points the T0 + 1
differences of the out-of-trace margin and of own steps tracked the end VP difference (r −0.76 and +0.70) about as well as
the T0 + 1 VP margin (+0.72).

E2 ([attrition-causes.json](attrition-causes.json)): 233 attrition losses in 16 games. Trace lost by an enemy move 175,
enemy combat 32, units placed out of trace (reinforcements, rebuilds) 14, other 6 (`ai-supply-study` categories). The ration
was lost by an own action in 136: paying fuel 83 (single unit 68, formation 15), the Supply Phase check 33, recovering
internal stocks 17. Feed SP was within reach at the loss in 15 (6%). 41 of the units stood on an objective when cut off.

## What this shows

- E3: the threat limit on advancing is not shown to be an error; advancing anyway trades own steps for kills and moves
  no outcome measure.
- E5: attacking at column 6+ when the policy declined gives kills at once but no lasting difference in Kill − Loss or VP;
  not shown to be an error.
- E2: the bot rarely fails to feed a unit that could be fed. Most attrition starts with an enemy move cutting trace; the most
  frequent own part is paying fuel with the SP a cut-off unit needs as its ration.

## E7 and E8 breakdown

`node scripts/ai-error-census.mjs <the four groups> --out census-e7-e8.json` ([census-e7-e8.json](census-e7-e8.json)), per
side-game:

- Combat units that never moved: meeting 6.63 (immobile 5.56, mobile on an own objective 0.38, mobile elsewhere 0.69);
  defender 11.50 (9.63, 0.63, 1.25); attacker 1.38 (all mobile, elsewhere).
- Objectives lost with no combat unit of the side in the hex: meeting 2.38 (the units there were lost 2.00, the last one
  moved off 0.38, never garrisoned 0); defender 3.50 (3.38, 0.13, 0). 1.50 and 2.50 of them were emptied in the same player
  turn: a garrison destroyed or retreated in combat and the enemy entering.
- E7 and E8 are mostly not errors: the cases the items were meant to find are 0.13–0.38 objectives and 0.7–1.4 mobile units
  a side-game.

## E4 breakdown

`node scripts/ai-attack-allocation-study.mjs <the four groups> --out allocation-e4.json` ([allocation-e4.json](allocation-e4.json)),
per side-game, attacker / defender / meeting side:

- Regular attacks 10.38 / 4.50 / 5.75; at column 10+ 3.75 / 2.25 / 1.81.
- Excess units (dropping them, weakest first, keeps the attack at column 9+): 5.38 / 0.75 / 1.44. Of them with no other
  enemy combat unit adjacent 4.75 / 0.13 / 0.88; adjacent to another enemy hex that was not attacked that segment
  0.63 / 0.63 / 0.56; adjacent to one attacked at column 5 or less 0.
- Objective attacks at column 5 or less 2.38 / 0.63 / 1.81; with an own combat unit adjacent to the target that attacked
  nothing 0.38 / 0 / 0.38.
- Within the Combat Segment little strength is misplaced; most excess strength had no other target adjacent, so the
  allocation that matters is made in the Movement Segment (with E6).

## Raw data

The ignored `artifacts/ai-continue/declined-advance`, `artifacts/ai-continue/idle-combat` and the `supply-attribution.json`
files in `artifacts/ai-assault/v84-development/*` of the `ai-truck-shuttle` worktree.
