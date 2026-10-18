# Error census of heuristic@79

Boundary: offline replays of saved headless bot-against-bot games. No policy change, no promotion. This record changes no row
of `docs/quality/03-product-operation-verification-plan.md`. The findings are kept in [policy-errors](../../../ai/policy-errors.md).

## Question

The user's method (2026-10-18): break the problem down by listing decisions of the standard policy that look wrong, with a
detector and a frequency each, before testing fixes by continuations on common dice.

## Inputs

- Games: `artifacts/ai-assault/v84-development` (`7d88f3d`), heuristic@84 against frozen heuristic@79; v84 plays v79's games
  (both games of every pair end in the same final state), so every side is v79. 32×24, six divisions (two armored),
  eight turns, no on-map air; MEETING 1300000–1300007 and 1300100–1300107, AXIS_ATTACKS 1300200–1300207 and
  1300300–1300307 (32 games, 64 side-games).
- Engine for the replays: the worktree build of `7d88f3d` plus the `defenderMaxEfforts` knob (no change by default).

```sh
D=artifacts/ai-assault/v84-development
node scripts/ai-error-census.mjs $D/meeting-* $D/attack-* --out census.json
node scripts/ai-replay-study.mjs $D/meeting-* $D/attack-* --out replay
node scripts/ai-concentration-study.mjs $D/attack-*
node scripts/ai-objective-flow-study.mjs $D/meeting-* $D/attack-*          # and --defender on the attack games
node scripts/ai-oos-census.mjs $D/meeting-temperate heuristic             # and attack-temperate
node scripts/ai-vp-study.mjs $D/attack-temperate
node scripts/ai-final-capture-study.mjs artifacts/ai-promotion/frozen-v79-freeze.json $D/<group> <out.json>
node scripts/ai-objective-allocation-study.mjs artifacts/ai-promotion/frozen-v79/dist $D/<group> <out.json>
```

## Observed

Per side-game. [census.json](census.json) (`ai-error-census.mjs`), [replay-study.md](replay-study.md) (`ai-replay-study.mjs`).

| | Attacker (16) | Defender (16) | Meeting side (32) |
|---|---|---|---|
| Regular attacks | 12.63 | 6.63 | 7.25 |
| Attacks at column 10+ | 4.38 | 3.63 | 2.50 |
| Attacks at column 12 (the top) | 2.88 | 2.25 | 1.69 |
| Combat Segments | 6.88 | 6.75 | 6.56 |
| Of them with no attack although a column 6+ attack was legal at the start | 0.88 | 1.50 | 0.50 |
| Advances declined / taken | 5.50 / 7.25 | 3.63 / 0.13 | 2.63 / 2.81 |
| Combat units that never moved | 1.38 | 11.50 | 6.63 |

- Step losses by cause (`ai-replay-study`): attrition out of supply 3.0–11.0 steps a side-game by outcome group, often more
  than combat losses (meeting sides that lost: attrition 11.0, combat defending 6.2). Objectives lost while empty: 0.7–1.7.
- Out-of-trace census (`ai-oos-census`, Supply Phases): meeting temperate 176 unit-phases out of trace, 140 with an enemy
  combat unit within 3 hexes and 36 with none; attack temperate 93, 86 and 7.
- Concentration (attacker, 56 Combat Phases from Game Turn 2): strength adjacent to the enemy 116.4, 2–3 hexes 118.3;
  assault groups 1.8 a phase with 2.5 units, 1.2 of them adjacent to the target; guns at the Combat Phase in Move Mode 406
  times, Combat Mode 10; 0.5 barrages a phase.
- Objective attacks (`ai-objective-flow-study`): attacker 6.38 a game at mean column 6.1, the defenders stayed in 3.25;
  meeting sides 4.06 at column 5.4, stayed in 2.13. All regular attacks: mean column 7.4–9.2.
- No finding: higher immediate-VP supply-preserving moves 0 (`ai-vp-study`, 8 games); final-turn captures omitted 0
  (`ai-final-capture-study`); duplicate enemy-free zero-threat capture targets 0.06 a game (`ai-objective-allocation-study`).

## Limits

32 games on development seeds and one board size; counts are candidates and do not establish that a decision is wrong or
how much a fix would gain. The two v79 sides of each game are the same policy, so every number describes v79.

## Raw data

The ignored `artifacts/ai-errors/` of the `ai-truck-shuttle` worktree.
