# Candidate heuristic@83: assault planning for the defender only, development batch

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Development evidence only: heuristic@79 stays the standard and no
independent batch has been registered.

## Question

heuristic@82 failed its independent run
([ai-assault-v82-independent-2026-10-17](../ai-assault-v82-independent-2026-10-17/README.md)): meeting −34, attack +14. The
user chose to keep only the defender's change (v83) and to judge only the engagements a candidate changes (VP gate,
`docs/ai/evaluation.md`).

## Inputs

- Source: `b312960` (`main` after `7990052`, artillery barrages against ports and air bases) plus the working-tree change:
  both sides of a meeting engagement take the attacker's heuristic@79 path (`posture !== 'DEFENDER'` in the effort rule,
  `crowding` and `supplyPrice`).
- Opponent: frozen heuristic@79 (`artifacts/ai-promotion/frozen-v79/dist`, from `93df378`); both sides on the candidate's
  engine.
- Development seeds and settings of `docs/ai/evaluation.md`: MEETING 1300000–1300007 and 1300100–1300107, AXIS_ATTACKS
  1300200–1300207 and 1300300–1300307; 32×24, six divisions (two armored), eight turns, no aircraft, `--swap --trace`.
- Baseline: frozen v79 self-play on the development attack seeds on the same engine (`v79-baseline-development-7990052`);
  the earlier self-play baseline predates the engine change of `7990052`.

## Observed

All 32 games FINISHED, replay ok, 0 failed.

| Engagement | Pairs | VP margin a pair | Identity with v79 |
|---|---|---|---|
| Meeting | 8 | 0.00 ± 0.00 | both games of every pair end in the same state hash (8/8) |
| Attack | 8 | +4.13 ± 1.69 | every game v83 attacks equals v79 self-play on the same match index (8/8) |

- Only the defender changed. The attack margin is the same as heuristic@82's on these seeds (+4.13); the facility barrages
  of `7990052` did not change any of the games compared above.
- The same defender plan measured elsewhere:

  | Batch | Pairs | Mean a pair | mean − 2.1 × SE |
  |---|---|---|---|
  | heuristic@82 independent, attack (fresh seeds 8100200–8100319) | 20 | +0.35 ± 0.73 | −1.18 |
  | heuristic@82 wide seeds, attack (reused) | 10 | +1.20 ± 0.61 | −0.08 |
  | heuristic@83 development, attack | 8 | +4.12 ± 1.69 | +0.57 |

- Under the current VP gate an independent v83 run is judged on its 20 attack pairs, so its lower bound needs a mean of
  about +1.5 a pair with an SE like the v82 run's. The only fresh-seed measurement of this defender plan is +0.35: the
  development batch does not warrant an independent run, and running one on the same plan would be a second draw of
  an effect already measured on fresh seeds.

## Raw data

The ignored `artifacts/ai-assault/v83a-development` and `artifacts/ai-assault/v79-baseline-development-7990052` of the
`ai-truck-shuttle` worktree.
