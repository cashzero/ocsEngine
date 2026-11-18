# S11: the defender's objectives that the attacker walks into

Boundary: replays of recorded games; no new game. The standard is heuristic@90 and is unchanged. This record changes no
row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S11 (section 9) of the [AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-17): 「全部做完」.

## Result

**Not implemented: the defender's own share is at most 0.35 VP a game.** Almost every objective the attacker walks into
had its garrison eliminated earlier in the same player turn: the attacker's two-step capture, not a defender's gap.

| Defender, 80 games each of heuristic@88's independent batch | heuristic@88 defending | heuristic@86 defending |
|---|---:|---:|
| Objectives walked into, a game (VP) | 1.25 (3.13) | 1.13 (2.75) |
| — the garrison was eliminated, in the same player turn | 1.16 (2.86) | 1.01 (2.48) |
| — the garrison moved away, in the same player turn | 0.09 (0.26) | 0.11 (0.28) |
| Empty when the defender's last Movement Segment before the loss began | 0.49 | 0.46 |
| — with a defending combat unit within 3 hexes | 0.26 | 0.28 |
| — with one that could move into it | **0.17 (0.35 VP)** | 0.21 (0.54 VP) |

The last row is an upper bound: the unit that could have moved in had other duties, and the attacker could have
attacked it there. heuristic@88's defender has one more objective walked into than heuristic@86's every 8 games, in
games where the attacker is heuristic@86 and attacks more successfully against it (the batch's VP +2.04 a pair includes
the defender role).

The threshold is the 0.5 VP a game of S5.4a's registered stop rule; it was not registered for S11 before the data were
read.

## Method

[defender-empty.mjs](defender-empty.mjs) on `artifacts/ai-promotion/frozen-v88-independent/attack-{western,eastern}`
(160 games, build `55aff4c`). An objective is walked into when its control passes from the defender to the attacker by a
`MOVE_PIECE`. The garrison's departure is the last action that left the hex without a defending combat unit.

## Raw data

`artifacts/ai-next/defender-empty.txt` of the `ai-truck-shuttle` worktree.
