# Truck execution and transport capacity of the theater allocation

Boundary: offline rollout of single Movement segments from the saved games of the
[HQ and truck allocation batch](../ai-theater-hq-games-2026-10-30/README.md) (2100300–2100379), plus tests and
development smoke games; no registered game was played. The standard policy is unchanged (heuristic@85, weight
`theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). The user (2026-10-30): 「先修卡車執行並依運量分配SP」.

## Method

`scripts/ai-theater-rollout.mjs` cuts each save at the attacker's first Movement decision of Game Turns 1–5, loads the
cut save as a session and lets the bot seat runner play that Movement segment as in a match: the theater policy for the
attacker, the standard heuristic for the other seat. With `--trucks-only` it plays only the segments whose plan places a
truck. It records, when the segment ends, whether each truck's stager stands at the drop and how many Tokens the truck
unloaded there, with the truck's and the stager's actions and debug lines.

```sh
B=artifacts/ai-theater-hq-games W=docs/quality/evidence/ai-theater-hq-games-2026-10-30/theater-weights.json
for i in 0 1 2 3 4 5; do node scripts/ai-theater-rollout.mjs $B/attack-western --weights $W --out $B/rollout-trucks/shard-$i.jsonl --shard $i/6 --trucks-only & done; wait
node scripts/ai-theater-rollout.mjs --summarize $B/rollout-trucks/shard-*.jsonl
```

Node v26.9.0. Every segment was played to its end. Sorted row SHA-256: before `6131e222e956…`, after `237260e1baee…`.

"Before" is the first version of this change, which was not committed: token needs and a stager per truck, with every
empty truck counted for 20T from one pooled rear stock. In the committed batch itself (`9f08f8e`), 5 of 18 truck
placements unloaded within 1 hex of their drop.

## Findings on the first version

38 truck placements in 34 segments; 8 brought the planned Tokens to the drop.

| What happened to the placement | Placements |
|---|---:|
| Planned Tokens unloaded at the drop | 8 |
| The truck went on a relief run for cut-off units instead (1–2T) | 14 |
| At the drop with fewer Tokens than planned | 7 |
| The truck did nothing | 4 |
| The stager did not reach the drop | 4 |
| The truck unloaded short of the drop | 1 |

Causes found in the truck and stager traces:

- **Relief first.** On a step with cut-off units every truck moved before the combat units and took relief runs, so
  placed trucks left their plan, and those that kept it arrived before the stager and could not unload at the drop
  (13.2f).
- **Capacity.** A truck carries 4T a Transport Point; most carried 4T, the largest 12T, not the 20T the plan counted.
- **One dump a run.** The plan pooled the rear stock; a truck loads at one dump.
- **Stock that moves before the trucks.** SP the plan counted at a map-edge Supply Source were railed forward before
  the trucks moved, and SP railed in this step cannot be loaded again this phase (12.2a): trucks drove to a dump and
  found nothing to load.
- **MP.** The plan checked that the drop was in reach, not that the truck could also load and unload on the way.

## Change

- The plan counts a truck by its own capacity, from one rear dump's stock, and only when driving to the dump, loading,
  driving to the drop and unloading fits its MA. A group may take several trucks at one drop. The trucks nearest the
  cut-off groups, one each, are kept for relief and not placed. The stager's drop must be inside its own trace.
- A placed truck moves after the combat units, takes no relief run, and picks its dump when it moves, from the stock
  then loadable. Rail does not move the stock the plan counted for a placed truck, and SP railed in are not counted as
  loadable.

## Result

| Measure, truck placements | First version | After |
|---|---:|---:|
| Segments with a placement / placements | 34 / 38 | 27 / 42 |
| Planned Tokens unloaded at the drop | 8 (0.21) | 37 (0.88) |
| Unloaded at the drop | 15 (0.39) | 38 (0.90) |
| Unloaded anywhere | 28 (0.74) | 42 (1.00) |
| Stager at the drop when Movement ends | 30 (0.79) | 38 (0.90) |
| Tokens planned / unloaded at the drop, mean | 9.16 / 2.71 | 5.71 / 6.26 |

The 5 placements short of the plan after the change: in 4 the stager stopped 1–3 hexes from the drop (two segments)
and the truck unloaded where it stood; in 1 the dump held 9T of the 12T planned by the time the truck loaded.

## Checks

- Full test suite: 816 passed, 7 skipped. `tests/ai/theater-allocation.test.ts` checks, on a Game Turn 3 state with
  truck placements, that each truck's Tokens fit its capacity and its dump's stock, that its run fits its MA, and that
  its stager's drop is in the stager's reach and trace.
- The standard policy is unchanged: four standard-against-standard games (1900000–1900003) replayed with this build
  reach the final state hashes recorded for them.

- Development smoke games (2199000–2199015, seat-swapped, not a registered batch): all 16 finished and passed the
  replay check. Placed HQs reached their hex in 7 of 9 placements. The 8 games the theater policy attacked in had no
  truck placement, so trucks were not exercised in full games.

## Limits

- One Movement segment at a time, from recorded states of one batch; Game Turns 1–5.
- Whether the unloaded SP let the next step's attack happen, and whether games go better, is not observed here.
- The first version is not a commit, so its column cannot be rebuilt from the repository.
