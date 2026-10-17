# Candidate heuristic@82: heuristic@81 with the attacker on heuristic@79, development batches

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. It is development evidence only: heuristic@79 stays the standard and
no independent batch has been registered.

## Question

The heuristic@81 promotion development batch
([ai-assault-v81-promotion-development-2026-10-17](../ai-assault-v81-promotion-development-2026-10-17/README.md)) was −0.69 VP a
pair and failed the 攻方運補 and 攻方送補 gates. The user asked to continue as v82: find what made the attacker's supply worse
and fix it.

## Inputs

- Source: `1be424d` plus the working-tree changes of each variant; the committed candidate is v82c.
- Opponent: frozen heuristic@79 (`artifacts/ai-promotion/frozen-v79/dist`, from `93df378`); both sides on the candidate's engine.
- Settings: 32×24, six divisions (two armored) per side, eight turns, `--air NONE --air-transport NONE`, `--swap --trace`.
- Development seeds: MEETING 1300000–1300007 (TEMPERATE_INLAND) and 1300100–1300107 (EASTERN_EUROPE); AXIS_ATTACKS
  1300200–1300207 and 1300300–1300307 (8 pairs per engagement).
- Wide seeds, v82c only: TEMPERATE_INLAND 1310000–1310009 and EASTERN_EUROPE 1310100–1310109 (10 pairs per engagement). These
  were already used to choose heuristic@81, so they are not independent.
- Baselines: frozen v79 self-play on the development seeds (`v79-baseline-development`, all four groups) and on the wide attack
  seeds (`v79-baseline-wide`), for `scripts/ai-role-margin.mjs` and the paired rear-SP comparison.
- Commands: the four `ai-match.mjs` groups of `docs/ai/evaluation.md` (standard procedure, settings), then
  `node scripts/ai-logistics-study.mjs <attack dirs> --gate <policy>`, `node scripts/ai-fuel-study.mjs <attack dirs> --gate <policy>`,
  `node scripts/ai-role-margin.mjs <baseline> <candidate> …`. The truck-drop and paired rear-SP counts were one-off replays of
  the saves (definitions in [results.json](results.json)).

## Observed

Every batch: all games FINISHED, replay ok, 0 failed. Paired VP margins (per pair, ± SE); "attacking" and "defending" are
`ai-role-margin` changes against v79 self-play (positive is better than v79).

| Variant | Change from heuristic@81 | Meeting | Attack | All | Attacking | Defending | Rear SP gate | Unreachable SP gate |
|---|---|---|---|---|---|---|---|---|
| v81 (promotion batch) | — | −4.00 | +1.25 | −0.69 ± 1.40 | −7.0 ± 3.4 | +8.25 ± 3.4 | 6.3 vs 1.3 FAIL | 4.0 vs 0.2 FAIL |
| v82a | HQs and trucks follow the effort chosen first (as v79), not the strongest | −1.38 ± 2.04 | +1.88 ± 1.74 | +0.25 ± 1.36 | −4.5 ± 4.3 | +8.25 ± 3.4 | 4.1 vs 1.3 FAIL | 0.9 vs 0.2 FAIL |
| v82b | v82a without SP pricing | −1.38 ± 2.04 | +2.00 ± 1.10 | +0.31 ± 1.20 | −2.0 ± 2.9 | +6.0 ± 2.3 | 4.8 vs 2.4 FAIL | 1.0 vs 0.7 FAIL |
| **v82c** | v82a; the attacker of an attack engagement plays v79 exactly: no effort guns, `crowding` for assault members, SP at full price | −1.38 ± 2.04 | +4.13 ± 1.70 | **+1.38 ± 1.47** | **0.00** | +8.25 ± 3.4 | 5.4 vs 1.3 FAIL | 1.7 vs 0.2 FAIL |
| v82c, wide seeds | | +5.10 ± 1.29 | +1.20 ± 0.61 | **+3.15 ± 0.83** | **0.00** | +2.40 ± 1.22 | | |

- **Identity.** In the 8 development attack games v82c attacks, the final state hash equals that of v79 self-play on the same
  match index (8/8, same action counts), so v82c's attacker plays v79's games and its attacking change is exactly 0. The
  wide attack games give 0.00 for all 10 as well.
- **What moved the trucks** (v81 promotion batch, attacker from Game Turn 3): v81 unloaded at 8.4 different hexes a game
  against v79's 5.4, and 32 of 66 turn-to-turn drop moves were 6 hexes or more (v79 13 of 38). Ordering efforts by strength
  changed which effort the HQs and trucks followed from turn to turn. In the game that dominated v81's rear SP (1300307),
  rail kept landing SP at the 22,11 station while the trucks chased leads at 21,2, 13,10, 19,8 and 16,7; it held 38 SP by
  turn 8.
- **The supply gates measure the candidate's defence.** Both gates compare the candidate's attacker with v79's attacker in the
  same batch, and that v79 attacker plays against the candidate's defender. v82c's attacker plays v79's own games and still
  fails both. Against v79 self-play on the same seeds (per game, same match index), the rear SP of the candidate's attacker is
  lower than v79's: v82a 4.14 against 5.42 (−1.28 ± 1.23), v80q 6.76 against 8.26, v80n 5.52 against 8.26. The in-batch
  v79 attacker leaves 1.3 rear SP against v82c's defender and 5.4 against itself: rear SP counts dumps 6 hexes or more from
  the enemy, and a defender that stays close keeps the attacker's dumps out of that count.
- **Meeting.** v82a and v82c play identical meeting games (16/16 hashes). The development meeting games are −1.38 a pair, the
  wide ones +5.10.
- Full checks of the committed candidate: typecheck clean; `tests/ai` 76 passed.

## Raw data

Saves, traces and gate outputs: the ignored `artifacts/ai-assault/` (`v82a-development`, `v82b-development`,
`v82c-development`, `v82c-wide`, `v79-baseline-development`) of the `ai-truck-shuttle` worktree.
