# S3.1–S3.3: force concentration under heuristic@86, error E6 and approachAttack

Boundary: replays, continuations and rollouts from recorded positions; no new game. The standard policy is unchanged
(heuristic@86; `approachAttack` defaults to 0). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S3 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#4-s3-在戰區配置內做兵力集中); TODO `bot-force-concentration`, error list
[E4/E6](../../../ai/policy-errors.md#目前的清單). The user asked to complete S3 (2026-11-15: 「完成S3」).

## S3.1 Census (analysis only)

`s3-census.mjs` (this folder) replays the registered batch's 40 games where the theater policy attacked (2100400–2100479,
320 attacker turns). At each attacker turn's first Movement decision it plans as the bot did (THEATER debug line, which now
also gives each group's planned column and the groups dropped below THEATER_MIN_PROBABILITY; no behavior change) and
follows the turn. `ai-theater-hq-follow.mjs --summarize` on the same games (run for S1.5) gives arrival:

| Stop-rule condition | Measured | Holds |
|---|---|---|
| This-step groups arrive in full in 80% or more | 81% (50/62; 38/45 in Game Turns 1–3, 12/17 in 4–8) | yes |
| Best declared column not below the planned one | lower 16, same 23, higher 16; mean −0.2 columns (planned about 9) | yes |
| Strength of units no group uses that could reach beside a defended objective this step, under one group's worth | 62.8 a turn (9.1 units) against 45.1 for a group's members | **no** |

So concentration has room. Two causes were checked:

- **Weak groups dropped after the allocation:** 1.2–1.3 a turn with 4–5 units, but their capture probabilities are tiny
  (median 0.02–0.05, nine in ten below 0.16), and turns with two or more dropped this-step groups are rare (4 of 120 in
  Game Turns 1–3). Units spread over hopeless groups are not the cause.
- **Error E6:** units of no group whose target (ASSAULT, HUNT or CAPTURE) is a defended hex stop two or three hexes short
  although a hex beside it was within reach this step: 2.9 a turn (19 strength) in Game Turns 1–3, 4.0 (29) in 4–8.

This-step groups are held less often than planned (0.62 against 0.85) although their column is on plan; see S3.3 for the
capture model.

## S3.2 E6 continuation test (registered)

[registration.json](registration.json), committed in `b2ef338` before any continuation. Weight `approachAttack`
([approach-weights.json](approach-weights.json)): a unit of no theater group closes in beside its defended ASSAULT, HUNT or
CAPTURE target without the crowding and exposure penalties (contact is still judged). Branch points: the attacker's first
Movement decision of Game Turn 2 in all 160 games of 2100400–2100479 and 2100100–2100179 ([branches.jsonl](branches.jsonl));
variants `none` and `approach` for the attacker, frozen heuristic@86 defending, 2 dice; Node v26.9.0. All 640
continuations finished the game.

| approach − none, attacker, end of the game | Difference | mean − 2.1 SE | Rule | Result |
|---|---|---:|---|---|
| VP margin | +2.00 ± 0.59 | +0.75 | > 0 (either) | yes |
| Kill − Loss | +1.29 ± 0.84 | −0.46 | > −1.5 (the other) | yes |

By the registration E6 is an error. Reported: the attacker ends with 0.67 ± 0.22 more attacks, 0.32 ± 0.08 more objectives
and 1.00 ± 0.30 more VP; at the next Game Turn it has 0.90 ± 0.33 fewer units out of trace.

## S3.3 Changes, one at a time

- **`approachAttack`** (above), rollouts of Game Turns 1–6 on the 80 development maps against heuristic@86's play of the
  same positions (`s3-concentration.mjs` for the concentration measures, per attacker turn):

  | approachAttack − heuristic@86, per map | Difference |
  |---|---|
  | Objective points over six attacker turns | +1.43 [+0.43, +2.42] (34 maps up, 18 down) |
  | Defender steps lost / attacker steps lost | +0.76 [−1.60, +3.12] / −0.35 [−1.84, +1.14] |
  | Strength beside defended objectives at the start of Combat | +11.7 [+6.5, +16.9] (42.9 against 31.3) |
  | Defended objectives with own units beside them | +0.16 [+0.05, +0.28] |
  | Regular attacks at column index 6 or more | +0.10 [0.00, +0.19] |
  | Regular attacks | +0.10 [−0.02, +0.22] |

- **Capture model recalibration: not adopted.** `ai-theater-capture-extract.mjs` (which now groups rollout games by seed
  pair when the summary names no map seed) on 629 attacks made by heuristic@86 (the registered batch's theater-attacker
  games and two rollout sets), map-grouped ten-fold validation: frozen model Brier 0.1412, linear recalibration 0.1387
  (gain +0.0025 [−0.0001, +0.0051]), full refit 0.1406 (+0.0007); constant 0.2421. On actual combat facts the model is
  close to calibrated (mean predicted 0.41, held 0.43 on the batch); the this-step groups' shortfall comes mostly from
  the 11% of groups that did not attack and from noise on 45 groups.
- **Barrage SP for the groups (E9): nothing to change.** `s3-barrage.mjs` on the same 40 games: defended objectives the
  attacker does not hold, with its units beside them and a legal barrage on them at the start of a Barrage Segment, 1.62
  a game; 91% of them were barraged.

The check on positions not used for development is the [S3 check](../ai-s3-check-2026-11-15/README.md).

## Limits

- Western Europe attack games, 32×24, six attacker turns in the rollouts; continuations against one defender (frozen
  heuristic@86).
- E6 was branched in Game Turn 2 only; the variant then plays the rest of the game.

## Raw data

The ignored `artifacts/ai-s3/` of the `ai-truck-shuttle` worktree (`census/`, `e6/`, `dev/`, `concentration/`,
`capture/`, `barrage/`).
