# S15.1: why attacker HQs do not move to hexes throwing trace onto open objectives

Boundary: replays of recorded games; no new game. The standard is `heuristic@91` and is unchanged. This record changes
no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S15.1](../../../roadmap/19-ai-strategy-improvement-wbs.md#11-s15-hq-投送擺放與前推執行中).
The user (2026-11-19) chose Route A (`bot-hq-logistics-plan`) ahead of S14.

## Result

**The stopping rule does not trigger: Western Europe has 0.76 VP/turn of actionable open objectives in Game Turns 3–6
(Eastern Europe 0.41 VP/turn), and 82–86% of them are HQs that were unassigned by the theater plan and moved elsewhere
under `with-army` / `cover`.** Dependency locking (`keepsDependents`) is tiny (0.06–0.08 VP/turn), so multi-HQ handoff
is not the bottleneck.

Data: the 80 attack games `heuristic@88` attacked in its independent batch (40 a style), replayed via
`scripts/ai-hq-placement-study.mjs`. For every attacker Movement Phase (Game Turns 1–8) and every open objective still
outside trace at the end of the phase (`dTrace > 1`), when at least one attacker HQ could reach a fed hex in Move Mode
that throws within 1 hex of the objective, the objective is classified by the first blocking constraint in order:

1. `enemy<3`: no candidate hex is at least 3 hexes from enemy combat units (`HQ_SAFE_DISTANCE`);
2. `noFuel`: no safe HQ can move or pay fuel at phase start (`12.5a`);
3. `depend`: moving any safe, movable HQ drops trace for a unit that depends solely on it (`keepsDependents`);
4. `noTroop`: no friendly non-HQ combat unit is within 6 hexes of the objective at phase start or end;
5. `actionable` (`actStay` / `actMove`): safe, movable, keeps all dependents, and friendly combat units are nearby.

VP per game by Game Turn:

### Western Europe (40 games)

| GT | total | enemy<3 | noFuel | depend | noTroop | actStay | actMove | **actionable** | withDumpDraw |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2.83 | 1.85 | 0.23 | 0.17 | 0.00 | 0.57 | 0.00 | **0.57** | 0.57 |
| 2 | 2.50 | 1.27 | 0.00 | 0.00 | 0.20 | 0.00 | 1.02 | **1.02** | 0.95 |
| 3 | 2.60 | 0.47 | 0.97 | 0.17 | 0.30 | 0.00 | 0.68 | **0.68** | 0.68 |
| 4 | 2.02 | 0.38 | 0.55 | 0.07 | 0.20 | 0.00 | 0.82 | **0.82** | 0.72 |
| 5 | 1.50 | 0.23 | 0.17 | 0.00 | 0.15 | 0.10 | 0.85 | **0.95** | 0.68 |
| 6 | 1.10 | 0.00 | 0.38 | 0.00 | 0.15 | 0.20 | 0.38 | **0.57** | 0.57 |
| 7 | 1.18 | 0.25 | 0.17 | 0.23 | 0.15 | 0.00 | 0.38 | **0.38** | 0.38 |
| 8 | 0.45 | 0.00 | 0.20 | 0.00 | 0.00 | 0.00 | 0.25 | **0.25** | 0.25 |
| **GT3–6 avg** | **1.81** | 0.27 | 0.52 | 0.06 | 0.20 | 0.07 | 0.68 | **0.76** | 0.66 |

### Eastern Europe (40 games)

| GT | total | enemy<3 | noFuel | depend | noTroop | actStay | actMove | **actionable** | withDumpDraw |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.47 | 0.28 | 0.03 | 0.03 | 0.07 | 0.07 | 0.00 | **0.07** | 0.07 |
| 2 | 1.00 | 0.50 | 0.00 | 0.05 | 0.07 | 0.10 | 0.28 | **0.38** | 0.38 |
| 3 | 0.97 | 0.30 | 0.15 | 0.07 | 0.00 | 0.13 | 0.33 | **0.45** | 0.45 |
| 4 | 1.43 | 0.33 | 0.33 | 0.20 | 0.00 | 0.00 | 0.57 | **0.57** | 0.47 |
| 5 | 1.10 | 0.42 | 0.28 | 0.03 | 0.05 | 0.00 | 0.33 | **0.33** | 0.28 |
| 6 | 0.95 | 0.15 | 0.50 | 0.03 | 0.00 | 0.00 | 0.28 | **0.28** | 0.07 |
| 7 | 0.25 | 0.00 | 0.23 | 0.03 | 0.00 | 0.00 | 0.00 | **0.00** | 0.00 |
| 8 | 0.33 | 0.05 | 0.23 | 0.00 | 0.00 | 0.00 | 0.05 | **0.05** | 0.05 |
| **GT3–6 avg** | **1.11** | 0.30 | 0.31 | 0.08 | 0.01 | 0.03 | 0.38 | **0.41** | 0.32 |

### Trace breakdown of actionable rows (all turns)

Checking the recorded `MOVE_PIECE` breakdown of the candidate HQ in the 97 actionable rows (56 West across 25 games, 41
East across 21 games):

| Style | `unassigned_with_army` | `assigned_theater_hq_or_bridge` | `stayed_no_move` | other |
|---|---:|---:|---:|---:|
| Western Europe | **49 rows (181 VP, 86%)** | 3 rows (13 VP) | 3 rows (12 VP) | 1 row (4 VP) |
| Eastern Europe | **33 rows (70 VP, 82%)** | 3 rows (6 VP) | 5 rows (9 VP) | 0 |

Most actionable hexes (West 0.66/0.76, East 0.32/0.41) also have a dump within draw range (`withDumpDraw`), so
`hqOffRail` is not what kept the HQ away. The HQ simply had no theater assignment and followed `with-army` + `cover`
behind existing combat units instead of throwing trace forward onto open objectives.

## Method

```sh
npm run build
P=artifacts/ai-promotion/frozen-v88-independent
node scripts/ai-hq-placement-study.mjs $P/attack-eastern $P/attack-western --out artifacts/ai-s15/hq-placement.json
```

Raw output: `artifacts/ai-s15/hq-placement.json` (gitignored).

## S15.3 Continuation Result (`hqAdvanceTrace = 1` vs `heuristic@91`)

Registered in [registration.json](registration.json) before any continuation was run: 60 triggered branches (28 Western,
32 Eastern) across the 80 attack games, 3 common-dice streams each (360 continuations total), opponent frozen
`heuristic@91`. All 360 continuations finished cleanly with 0 failures and 0 unfinished games; 56 of 60 branches diverged
from `v91` (26/28 West, 30/32 East).

| Style | Branches (changed) | Final VP (`hqAdvance - v91`) | Objectives | Kill − Loss | Attacker Loss | Out of Trace |
|---|---:|---:|---:|---:|---:|---:|
| Western Europe | 28 (26) | **−0.60 ± 0.52** (t −1.15) | −0.12 ± 0.14 | **−2.43 ± 0.76** (t −3.18) | **+1.37 ± 0.43** (t +3.17) | +0.24 ± 0.64 |
| Eastern Europe | 32 (30) | **+0.94 ± 0.81** (t +1.16) | +0.12 ± 0.45 | +2.70 ± 1.81 (t +1.49) | −1.34 ± 1.31 (t −1.03) | −0.72 ± 0.56 |
| **Combined (50/50)** | **60 (56)** | **+0.17 ± 0.48** (t +0.36) | +0.00 ± 0.23 | +0.13 ± 0.98 (t +0.14) | +0.01 ± 0.68 (t +0.02) | −0.24 ± 0.42 |

**Judgment**: **Not established** (combined VP +0.17 ± 0.48, t +0.36; neither style establishes positive VP). In Western
Europe, pulling unassigned HQs away from `with-army` / `cover` toward uncovered objectives significantly increased
attacker step losses (+1.37 ± 0.43, t +3.17) and worsened Kill − Loss (−2.43 ± 0.76, t −3.18), because the active
fighting cluster lost HQ support. In Eastern Europe, where trace is sparser, the point estimates are positive (VP +0.94,
Kill − Loss +2.70, out-of-trace −0.72) but not established. By the pre-registered reading, no independent batch is
proposed; `hqAdvanceTrace` remains at default `0`.

Raw continuation outputs: `artifacts/ai-s15/continue/` and `artifacts/ai-s15/continue-compare.json` (gitignored).

