# S9: why the attacker takes half the objectives in Eastern Europe

Boundary: replays of recorded games; no new game. The standard is heuristic@90 and is unchanged. This record changes no
row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S9 (section 9) of the [AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-17): 「全部做完」.

## Result

**In Eastern Europe the attacker's trace does not keep up with its army: its supply network, not its decisions at the
objectives, limits it.** Data: the 80 games heuristic@88 attacked in its independent batch (40 a style), replayed.

| heuristic@88 attacking, a game | Western Europe | Eastern Europe |
|---|---:|---:|
| Objective points on the map | 16.6 | 11.9 |
| Held at the end | 13.5 (81%) | 6.2 (52%) |
| Not held at the end, defended / empty | 0.80 / 0.05 objectives | 2.67 / 0.10 |
| Not held at the end and never attacked | 0.38 (1.32 VP) | **1.98 (4.28 VP)** |
| — of those, a unit was sent at it, first in Game Turn | 1.0 | 1.2 |
| — its nearest approach: beside / 2–3 hexes / farther | 0.30 / 0.05 / 0.03 | 0.63 / 0.57 / **0.75** |

Objectives not held at the start of each Game Turn (`reach.mjs`): mean hexes to the attacker's nearest combat unit and
to the nearest hex of its trace coverage, and their VP by distance outside the trace.

| Game Turn | West: to unit / to trace | West VP in trace / 1–3 out / 4+ out | East: to unit / to trace | East VP in trace / 1–3 out / 4+ out |
|---:|---|---|---|---|
| 1 | 13.1 / 8.8 | 0.00 / 4.30 / 12.28 | 14.3 / 9.5 | 0.00 / 2.35 / 9.60 |
| 3 | 4.2 / 4.9 | 2.77 / 3.45 / 6.22 | 6.9 / 7.6 | 0.82 / 1.60 / 7.88 |
| 5 | 3.0 / 3.0 | 2.55 / 2.17 / 2.42 | 4.6 / 6.0 | 1.13 / 1.48 / **6.15** |
| 8 | 1.9 / 3.1 | 1.48 / 0.95 / 1.45 | 3.7 / 5.5 | 1.43 / 1.02 / **4.35** |

In the West the trace reaches the objectives by Game Turn 5. In the East it stays about 6 hexes short from Game Turn 5
on, advancing about half a hex a turn, while the army is 4 to 5 hexes from them. The move scoring charges a unit that
ends out of trace with nothing to eat 60 points (`outOfSupply`), so units stop near the trace edge; the units sent at the
far objectives (0.75 a game) never come within 3 hexes. Out-of-trace units stay at 4.4–5.0 a turn in the East against
1.8–4.0 in the West, and front SP is about the same (10.6–14.2 against 10.4–13.7), so the army is not short of SP; it
cannot carry its trace forward.

What does not explain it: the decisions at the objectives. Attacks on objectives are similar per game (5.0 in the East,
6.1 in the West), and the outcomes by Combat Table column are close ([S10.1](../ai-s10-kill-value-2026-11-18/README.md)).

## What would address it (not implemented)

Carrying the trace forward over long distances is a logistics design, not a single wrong expectation: HQ moves that
leapfrog with dumps trucks bring up (`bot-hq-logistics-plan`), and a plan that values pushing the trace front toward
deep objectives several turns ahead. It changes trade-offs, so it is proposed to the user as a design before code.

## Method

```sh
P=artifacts/ai-promotion/frozen-v88-independent
node scripts/ai-attack-progress-study.mjs $P/attack-western $P/attack-eastern --policy heuristic --out artifacts/ai-next/progress-all.json
node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/open-at-end.mjs $P/attack-western $P/attack-eastern
node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/never-attacked.mjs $P/attack-western $P/attack-eastern
node docs/quality/evidence/ai-s9-eastern-attack-2026-11-18/reach.mjs $P/attack-western $P/attack-eastern
```

`scripts/ai-attack-progress-study.mjs` writes the turn table (held VP, objectives open and their distance, units, units
out of trace, SP on the map and at the front, attacks) and every attack on an objective with its column and outcome. Its
`--policy heuristic` keeps the games heuristic@88 attacked. "Sent at it": a trace intent naming the objective.

## Limits

- 40 games a style, against heuristic@86's defender; one batch.
- The trace coverage is the side's (any unit could trace from there), measured at the start of each Game Turn.

## Raw data

`artifacts/ai-next/` (`progress-all.json`, `progress.txt`) of the `ai-truck-shuttle` worktree.
