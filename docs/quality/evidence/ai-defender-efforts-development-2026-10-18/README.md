# Where the defender's gain came from: heuristic@83 and a defender without efforts

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Development evidence only; heuristic@79 stays the standard.

## Question

heuristic@83 changes only the defender of an attack engagement (assault planning sized to the Combat Segment's column,
effort guns, SP pricing). The user asked where its gain comes from before registering it.

## Method

In a swapped AXIS_ATTACKS pair against frozen v79, the game where the candidate attacks is v79 self-play (heuristic@82 and
@83 attack with v79's choices, hash-checked), so each pair compares v79's defender and the candidate's against the same v79
attacker on the same seed. Defender effect = attacker margin in the self-play game − attacker margin against the candidate's
defender (positive: the candidate defends better).

- Batches already played: heuristic@82 independent attack games (fresh seeds 8100200–8100319, 20 pairs), heuristic@82 wide
  attack games (1310000–1310009, 1310100–1310109, 10 pairs, reused), heuristic@83 development attack games
  (1300200–1300207, 1300300–1300307, 8 pairs). `node scripts/ai-objective-flow-study.mjs <attack dirs> --defender` and the
  move purposes in the traces (the `(purpose …)` of each defender `MOVE_PIECE` intent).
- New development seeds, never played before (checked against every save and the played-seeds ledger): TEMPERATE_INLAND
  1330000–1330039 and EASTERN_EUROPE 1330100–1330139, 40 attack pairs, for heuristic@83 and for heuristic@83 with
  `defenderMaxEfforts` 0 (`--allied heuristic:<weights.json>`), 32×24, six divisions (two armored), eight turns, no aircraft.

## Observed ([results.json](results.json))

- **Retaking is not where the gain was.** The candidate's defender attacked objectives about once a game at column 4.5–5.0
  (v79's 5.7–5.9) and retook 0.45–1.13 objective VP a game. It lost fewer: 7.65 against 8.05 objective VP a game (fresh
  seeds), 7.90 against 8.60 (wide), 6.25 against 9.25 (development).
- **It mostly stopped counterattacking.** Defender moves on assault tasks fell from 8.4 to 2.8 a game (fresh), 6.8 to 2.6
  (wide), 10.1 to 1.8 (development); the units went to `hunt` instead (14.0 → 17.6, 15.0 → 19.0, 17.6 → 24.9).
- Per pair, the effect looks larger where the self-play attacker did well and negative where it did badly. That is what
  regression to the mean produces when the effect is a difference involving the self-play margin, so it is not evidence
  of a mechanism.
- **New seeds, 40 pairs:**

  | Defender | Effect per defender game |
  |---|---|
  | heuristic@83 | −2.4 ± 1.25 |
  | heuristic@83 with no defender efforts | +1.4 ± 1.21 |
  | no efforts − heuristic@83 (paired) | +3.8 ± 1.01 |

  The attacker games of both runs are identical (40/40 final hashes).

## What this shows

- The defender's development gain (+8.25 and +2.40 a defender game) does not hold on fresh seeds: −2.4 here, +0.7 in the
  heuristic@82 independent run.
- What the planning did that helped is suppress v79's counterattacks: a defender that forms no main effort beats
  heuristic@83 by 3.8 ± 1.0 a game. Against v79, +1.4 ± 1.2, which this batch cannot separate from 0.

## Raw data

The ignored `artifacts/ai-assault/defender-1330`, `artifacts/ai-assault/defender-study` and the batches named above, in the
`ai-truck-shuttle` worktree.
