# S1, second round: the rear-SP gate, why SP stays out of the front's reach, HQ bridges

Boundary: replays and rollouts of saved games on development positions; no new game, no registered batch, no check
read. The standard policy is unchanged (heuristic@86; every change is behind a weight that defaults to 0). This record
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S1 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#2-s1-補完-v86-的補給例外). Previous round: [S1 check](../ai-s1-check-2026-11-14/README.md).

The user, after the failed S1 check (2026-11-14): 「繼續拆解，gate 照你建議改」 — go on breaking the gap down, and change
the rear-SP gate as proposed (count only rear SP no front unit can draw).

## Inputs

- Development positions: the 80 maps of 2100400–2100479 and 2100100–2100179 (the latter was the first S1 check and is now
  spent as a check), the even-numbered match of each seed, rollouts of Game Turns 1–6 (`ai-theater-rollout.mjs --starts 1
  --through 6`). Baselines: heuristic@86 and heuristic@85 rollouts of the earlier records on the same positions.
- Build of this record's commit; Node v26.9.0. Full test suite 820 passed, 7 skipped; with default weights four standard self-play games (2199400–2199403) reach the same final state hashes as frozen heuristic@86. Scripts: `scripts/ai-supply-gap-study.mjs` (now also each pile's distance
  to the nearest front unit), `scripts/ai-logistics-study.mjs` (new gate measure), and in this folder `rail-cut-why.mjs`,
  `hq-bridge.mjs`, `plan-bridges.mjs`, `bridge-exec.mjs`, `bridge-follow.mjs`.

## The rear-SP gate now counts SP no front unit can draw

`ai-logistics-study.mjs` measures rear SP left (dumps 6+ hexes from enemy combat units other than garrisons, not a
garrison stock) and counts for the gate only the dumps no front unit can draw from (the supply gate's front: a combat unit
other than an HQ within 4 hexes of an enemy combat unit, drawing directly or through an HQ throw, `queryFeedCoverage`).
All rear SP stays in the report. Recomputed on earlier rollouts:

| Positions, attacker | Rear SP left, all | of which no front unit can draw (gate) | heuristic@85 (gate) |
|---|---:|---:|---:|
| 2100400 set, heuristic@86 + entry fix | 4.8 | 1.0 | 1.0 |
| 2100100 set, heuristic@86 + entry fix (S1) | 5.1 | 1.4 | 0.8 |
| 2100100 set, heuristic@86 | 5.1 | 1.5 | 0.8 |

## Why SP stays out of the front's reach

**Not cut rail lines.** The S1 check named `rail-cut` (SP on a rail hex that rail could not carry forward when the
segment began) as the theater attacker's largest identified category. `rail-cut-why.mjs` asks why for every attacker dump
of 8T or more on a rail hex, 6+ hexes from the enemy, with no legal forward rail move at the segment's first decision
(Game Turns 3–6), SP per segment (piles):

| Attacker | Station ahead not detrainable | Pile's hex not entrainable | Rail path blocked |
|---|---:|---:|---:|
| 2100100 set, heuristic@86 | 0.67 (18) | 0.29 (13) | 0.64 (6) |
| 2100100 set, heuristic@85 | 0.74 (19) | 0.29 (14) | 0.22 (5) |
| 2100400 set, heuristic@86 | 0.78 (14) | 0.42 (20) | 0.67 (5) |
| 2100400 set, heuristic@85 | 2.15 (29) | 0.34 (21) | 0.78 (8) |

Paths blocked by enemy units or ZOC are few and as common with heuristic@85. Mostly the stations ahead are not yet the
attacker's or hold enemy units (13.3c, 13.3h): the SP is at the railhead, in both policies. What differs is whether a front
unit can draw it there.

**The theater army is farther from the railhead.** SP no front unit can draw, per segment, by its distance to the nearest
front unit (2100100 set): heuristic@86 0.23 (5 hexes or less), 0.21 (6–8), 1.09 (9–12), 0.49 (13+); heuristic@85 0.11,
0.09, 0.54, 0.26. SP front units can draw is about the same (15.7 against 16.5).

**Trucks are not the lever.** Trucks load 4.0 against 3.9 SP a segment and rail carries 9.8 against 10.5; SP no front unit
can draw that an empty truck idle in the segment could have reached is 0.36 against 0.26.

**HQs are.** `hq-bridge.mjs`: at the segment's end, could an own HQ have stood (Move Mode reach from where it began, 3+ hexes
from the enemy) where it draws the pile and, fed, throws to a front unit? SP per segment, 2100100 set:

| Attacker | No front unit can draw | Some HQ could bridge | An HQ that could move could bridge |
|---|---:|---:|---:|
| heuristic@86 | 1.92 | 1.49 | 0.95 |
| heuristic@85 | 0.95 | 0.67 | 0.44 |

Without what any HQ could bridge, heuristic@86 − heuristic@85 is +0.14 [−0.18, +0.46] per map. Many HQs cannot move: they
have no fuel to pay where they stand (12.5a), often because the SP they would fuel from is the stranded pile.

## Changes (behind weights that default to 0)

- **`hqBridge`** (`policies/theater.ts`, `bridgesFor`): after the allocation, HQs no group uses go, best bridge first, to
  the hex of this step's Move Mode reach (3+ hexes from the enemy, fed) that draws the most SP of piles no front unit can
  draw now (front: own combat units within 4 hexes of the enemy, and the groups' attack positions) and throws to the
  front; each pile is bridged once; at least 4T. An HQ stays if it bridges a pile where it stands, if it cannot move or pay
  fuel now, or if the bridge's throw would not cover a unit it covers now without direct trace (other HQs may move first).
  The HQ is pulled there as a placed HQ (THEATER_HQ_ARRIVE, THEATER_HQ_PULL). Tests: `tests/ai/hq-bridge.test.ts` (2100130,
  Game Turn 3: one bridge of 56T; the HQ ends the step at its hex). Two versions were corrected during development: without
  the fuel check, the plan sent HQs that could not move; without the throw check, the move was refused by the supply guard
  because another HQ had moved first.
- **`arrivalRailForward`** now also asks that the forward station be within draw range of a combat unit near the enemy or of
  an own HQ. The S1 check found it sending SP to a station no one drew from (2100112).

On the 2100100 positions, the plan bridges in 23 of 200 attacker turns (Game Turns 2–6), 0.92 SP a turn, with the plan's
expected VP unchanged; the 8 largest bridges, played out, all ended with the HQ at its hex.

## Rollouts (80 maps)

SP per segment, attacker Game Turns 3–6; per-map differences with a 95% t interval:

| Measure | S1b (entry fix with station check + `hqBridge`) | `hqBridge` only | heuristic@86 | heuristic@85 | S1b − heuristic@85 |
|---|---:|---:|---:|---:|---|
| SP no front unit can draw | 1.61 | 2.17 | 2.20 | 1.24 | +0.37 [−0.34, +1.08] |
| Rear SP no front unit can draw (gate) | 1.23 | 1.81 | 1.77 | 0.94 | +0.30 [−0.30, +0.90] |
| Rear SP, all (reported) | 5.56 | 6.21 | 5.79 | 4.36 | +1.20 [−0.20, +2.60] |

By position set: 2100400, S1b 1.44 and 1.21 against heuristic@85's 1.48 and 1.03; 2100100, S1b 1.78 and 1.26 against 1.00
and 0.85.

Objective points over six attacker turns, minus heuristic@86 per map: S1b +0.42 [−0.24, +1.09] (2100400) and −0.03
[−0.74, +0.69] (2100100); `hqBridge` only +0.30 [−0.15, +0.75] and +0.13 [−0.63, +0.88].

**Bridges alone barely move the total** (2.17 against 2.20). `bridge-follow.mjs` on S1b's 2100100 rollouts: 25 bridges, 23
HQs at their hex at the segment's end; segments with a bridge end with 0.79 SP no front unit can draw, segments without one
1.97, and in those 0.53 SP a segment was drawable when the segment began and is not when it ends: the front moves away from
it. Bridges work where a mobile HQ can make one, which is in a sixth of the segments.

## What this shows

- With the entry fix's station check and the bridges, the theater attacker's gap to heuristic@85 is no longer established
  per map on the 80 development maps (+0.37 and +0.30 SP, intervals include 0), but the means are still above
  heuristic@85's on one of the two position sets, and the gates compare means.
- The remaining gap has two parts that these changes do not reach: the front moving beyond the SP during the segment, and
  piles no HQ that can move this step could bridge.

## Limits

- Development positions only; the 2100100 set is read for the second time.
- `hq-bridge.mjs` is an upper bound: one HQ, one pile at a time, ignoring what moving the HQ costs elsewhere.

## Raw data

The ignored `artifacts/ai-s1/` of the `ai-truck-shuttle` worktree (`railcut/`, `bridge/`, `plan-bridges/`, `dev2/`,
`bridge-follow/`).
