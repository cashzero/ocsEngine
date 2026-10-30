# Why next-step theater groups do not convert

Boundary: offline replay of the movement-execution games (2100200–2100279); no new game was played. This record
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層); batch:
[movement-execution observation](../ai-theater-execution-games-2026-10-30/README.md). The user (2026-10-30) asked
why that change did not help (「再思考一下 為何沒有改進」) and then for the analysis (「進一步分析」).

## Questions

1. Is the plan's trace filter stricter than the move step's friendly-supply gate? The plan judges trace before HQs
   move and does not count rations the gate would accept.
2. Once a group is put on the next step, does the next player turn follow through? Does the plan keep the objective,
   does supply come up, and does the attack happen?

## Method

Source `47040c2` plus the new script, `dist` built from `bdda951` (same policy code), Node v26.9.0.

```sh
B=artifacts/ai-theater-execution-games W=docs/quality/evidence/ai-theater-execution-games-2026-10-30/theater-weights.json
for i in $(seq 0 11); do node scripts/ai-theater-next-step.mjs $B/attack-western --weights $W --out $B/next-step/shard-$i.jsonl --shard $i/12 & done; wait
node scripts/ai-theater-next-step.mjs --summarize $B/next-step/shard-*.jsonl
```

`ai-theater-next-step.mjs` replays the 40 games in which the theater policy attacks. All 40 reached their saved final
hash. It plans each attacker player turn at the first Movement decision, as the bot does, and takes the defended
groups the allocation puts on the next step: 393 groups. The rows are 393 lines, sorted SHA-256 `290765d48b19…`.

## Results

| Measure | Game Turns 1–3 | Game Turns 4–8 |
|---|---:|---:|
| Next-step defended groups / members | 248 / 918 | 145 / 572 |
| **At planning** | | |
| Members with a free hex beside the objective in reach, trace ignored (current, Move or Combat mode) | 0.77 | 0.90 |
| … with one such hex inside their trace now | 0.08 | 0.16 |
| Groups where every member had beside in reach, so deferred only by trace | 0.52 | 0.70 |
| **When the member moved that step (after HQs that moved first)** | | |
| Members offered a move ending beside the objective | 122 of 861 | 128 of 351 |
| … untraced at planning but reachable: gate lets a beside move through | 0.23 (18/77) | 0.49 (37/75) |
| **Next attacker player turn, objective still not held (236 / 129)** | | |
| Allocation keeps it this step | 0.04 | 0.05 |
| Allocation puts it on the next step again | 0.53 | 0.67 |
| Allocation drops it | 0.43 | 0.29 |
| Members with a traced hex beside it in reach (mean share) | 0.17 | 0.11 |
| Nearest attacker HQ to the objective, hexes: planning → next turn | 16.2 → 13.5 | 11.6 → 10.3 |
| Attacked during the next turn | 0.16 | 0.16 |
| Held at the end of the next turn (all groups) | 0.13 | 0.22 |
| … when kept this step / next step again / dropped | 7/10, 11/125, 3/101 | 4/6, 10/86, 2/37 |

## Conclusions

- **Question 1: the trace filter is not much stricter than the gate in Game Turns 1–3.** Take the members that were
  untraced but reachable at planning and that were offered a beside move: when they moved, after any HQ had moved,
  the gate passed only 23% of them. In Game Turns 4–8 it passed 49%, so there the filter does defer some attacks the
  gate would allow.
- **Question 2: the next step does not come.** Supply does not follow:
  - The nearest HQ is 16 hexes from the objective in Game Turns 1–3 and closes about 3 hexes a turn.
  - At the next turn only 17% of the members can reach a traced hex beside the objective.
  - So the allocation keeps the objective this step in only 4% of the cases. It defers again in 53% and drops it in
    43%.
  - The group is attacked 16% of the time and held 13%.
- **The design gap:** for this step the allocation requires trace, but for the next step it requires none. It assumes
  HQs bring supply by then. Every attack position outside trace therefore becomes a next-step group, valued at 0.79–0.94
  of a this-step one (the next-turn discount), which keeps it above the 0.25 cut-off.
  - Those groups take the effort slots and units from the usual efforts.
  - They then roll from turn to turn without attacking.
  - This matches the batch's fewer step losses inflicted in Game Turns 4–8.

## Limits

- One batch, the theater policy attacking only.
- Reach at planning is the union of the current, Move and Combat modes with fuel paid, so it can overstate what the
  policy's chosen mode allows.
- Only 14% of the Game Turn 1–3 movers were offered a beside move: most t2 members move in the mode the policy picks
  for a far target. The gate test therefore covers 77 members in Game Turns 1–3.
- The next-turn facts are taken at the attacker's next first Movement decision. Supply rations promised later in
  that step are not counted.
