# S13.4: one Extender for the attacker, measured on recorded positions

Boundary: registered continuations of recorded games; no new game. The standard is heuristic@91 and is unchanged
(`extenderPlan` stays 0). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
S13.2–S13.4 (section 10) of the [AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user
(2026-11-18), on the [S13.1 result](../ai-s13-trace-front-2026-11-18/README.md): 「選A 開始執行S13.2」.

## Result

**Not established, and the estimates lean negative. The Extender does carry the attacker's trace forward, but its trucks
then no longer bring SP to the front, so the attacker attacks less and takes fewer objectives.** By the registered reading
the candidate neither raises nor lowers VP in either style, so S13.5 is not proposed.

Final margins, extender − v91, dice averaged per branch, SE over maps:

| At the end of the game | Eastern Europe (34 branches, 4 dice) | Western Europe (27 branches, 2 dice) |
|---|---:|---:|
| **VP margin** | **−0.74 ± 0.50** | −1.41 ± 1.23 |
| Objectives margin | −0.65 ± 0.27 | −0.37 ± 0.33 |
| Kill − Loss | +0.51 ± 1.56 | −3.76 ± 1.62 |
| Attacker's units out of trace | −3.18 ± 0.80 | +0.69 ± 1.19 |

Registered reading:
- East: −0.74 − 2.1 × 0.50 < 0 < −0.74 + 2.1 × 0.50, so not established.
- West: harm is not established (−1.41 + 2.1 × 1.23 > 0).

As a per attack game estimate, including the games that never trigger: East −0.63 (34 of 40 games), West −0.95 (27 of 40).

### The change did change the play

The attacker's events after the branch, and its position at the end (extender − v91):

| | Eastern Europe | Western Europe |
|---|---:|---:|
| Units out of trace, end | −3.18 ± 0.80 | +0.69 ± 1.19 |
| — of those, with nothing to eat | −1.82 ± 0.57 | +0.37 ± 0.46 |
| Attrition steps lost | −1.36 ± 0.88 | +2.26 ± 1.06 |
| Attacks | −0.71 ± 0.25 | −0.46 ± 0.37 |
| SP spent | −3.67 ± 1.00 | −0.28 ± 1.30 |
| SP on the map that no front unit can draw, end | +6.51 ± 1.59 | +1.90 ± 0.97 |
| HQs no dump reaches, end | +0.41 ± 0.10 | +0.09 ± 0.16 |
| Objective VP in reach at the next Game Turn | −0.89 ± 0.30 | −0.13 ± 0.30 |

- **In the East the trace moves forward as S13.1 predicted**: fewer units out of trace, fewer starving, less attrition.
- **But the SP stays behind.** Five of the attacker's six Transport Points are the Extender, so less SP reaches the front:
  - SP piles up where the front cannot draw it, and more HQs have no dump;
  - the attacker spends less SP and makes fewer attacks;
  - in the Game Turn of the branch the trucks drive to the site instead of hauling, so fewer objectives are in reach at the next one.
- **S13.1 left out exactly this cost.** Its bound counted where trace reaches, not the SP that combat and fuel need.
- In the West the trace barely moves and the attacker loses more steps to attrition.

Exploratory, not registered: the East's VP effect by the Game Turn of the branch is −1.15 ± 0.58 for branches in Game
Turn 3 (24) and +0.25 ± 0.95 in Game Turn 4 (10). Forming the Extender earlier costs more of the offensive.

### A rule-engine error found on the way

Three of the candidate's 380 continuations stopped with `FAILED_ACTION`: 2800317 dice 1 and 2800357 dice 2 (East), and
2800239 dice 2 (West).
- **What happened**: an Extender had collapsed (9.14d) back into a five-point truck. That counter, combined from 3 + 1 + 1
  points, was offered a 20 T load (4 T a point, 13.2a). The state invariant then refused it: it checked the printed
  three-point counter's 12 T.
- **Fix**: the invariant now scales the printed capacity by the counter's current size (`status:transport-points`). A
  rules test covers a counter combined beyond its printed size.
- **The three runs**: only the three branch × variant files of these runs were rerun with the fixed build. Every row
  that had finished before is identical, and the three stopped ones now finish the game.
- **Why the rest stands**: no other run is affected. heuristic@91 never combines trucks, and the error only ever stopped
  a run; it never changed a choice.

## Method

Registration (committed before any continuation): [registration.json](registration.json). Branches:
`find-branches.mjs` over the 80 games heuristic@88 attacked in its independent batch. The branch is the first attacker
Movement segment where the candidate's first decision serves the Extender plan: 34 Eastern and 27 Western games. 19
games never trigger ([no-trigger.txt](no-trigger.txt)).

```sh
npm run build
E=docs/quality/evidence/ai-s13-extender-2026-11-18
node $E/find-branches.mjs $E/extender-weights.json artifacts/ai-promotion/frozen-v88-independent/attack-eastern artifacts/ai-promotion/frozen-v88-independent/attack-western
# the two ai-continue-batch.mjs commands and the comparison in registration.json
python3 scripts/ai-continue-compare.py artifacts/ai-s13/continue/*.jsonl --baseline v91 --by-style --cluster-by-map --metrics margin.vp,margin.objectives,margin.killLoss,loss,own.outOfTrace
```

The event and position measures above are paired the same way from the continuation rows (`events` and `metrics` of the
attacker), dice averaged per branch, SE over branches.

Run time: 37 minutes for the East, 18 for the West, and 5 to rerun the three stopped files.

## Limits

- The branch positions come from heuristic@88's games against heuristic@86. The opponent here is frozen heuristic@91.
- The West has 2 dice a branch and detects only large harm.
- One design was measured: one Extender for the side, formed once, at least 3 hexes from the enemy, worth at least 2 VP,
  from empty trucks. Its constants were set before the measurement and not tuned.

## Raw data

`artifacts/ai-s13/` in the main checkout:
- `continue/`, `continue-compare.{txt,json}`, and the logs;
- `continue-failed-prefix/`: the three files stopped by the rule-engine error.
