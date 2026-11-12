# Drops outside trace, this-step trucks, and rollouts of the theater allocation from recorded states

Boundary: offline analysis and rollouts from the saved games of the
[HQ and truck allocation batch](../ai-theater-hq-games-2026-10-30/README.md) (2100300–2100379), plus tests; no
registered game was played and nothing here was registered in advance. The standard policy is unchanged (heuristic@85,
weight `theaterAllocation` 0); this record changes no row of `docs/quality/03-product-operation-verification-plan.md`.
Design: [theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). Earlier record:
[truck execution](../ai-theater-truck-execution-2026-11-11/README.md), whose build (`1a80498`) is "the previous
version" below.

## Which restriction limits the allocation

The previous version formed 0.7 defended groups a turn in Game Turns 1–3. To find what holds it there, the allocation
was recomputed at the attacker's first Movement decision of every player turn of the 80 saves (640 turns, 240 of them
in Game Turns 1–3) with one supply restriction lifted at a time. The switches for this were development code and are
not in the repository, so this table cannot be rebuilt from it. Values are the plan's own expected VP (points times
chance, groups with chance 0.25 or more), per turn.

| Game Turns 1–3, per turn | Expected VP | Defended groups, this step | Defended groups, next step | Truck placements |
|---|---:|---:|---:|---:|
| Previous version | 1.75 | 0.38 | 0.36 | 0.07 |
| Truck capacity and rear stock unlimited | 1.77 | 0.38 | 0.37 | 0.07 |
| HQ need not keep the units only it supplies | 1.74 | 0.38 | 0.35 | 0.06 |
| Drops need not be in trace (within 10 hexes of the objective) | 2.85 | 0.37 | 1.00 | 0.94 |
| … and a unit no group uses may be the stager | 2.92 | 0.37 | 1.04 | 0.99 |
| … and trucks also supply this-step groups (the change below) | 3.06 | 0.52 | 0.90 | 0.97 |
| No supply needed at all (upper bound) | 4.90 | 0.93 | 1.55 | — |

In Game Turns 4–8 the same rows give 1.55, 1.56, 1.56, 1.98, 2.00, 2.04 and 2.39. The restriction that binds is the
drop having to lie inside trace; truck capacity and the HQ rules alone change almost nothing.

## Change

- **Plan.** A drop need not be in trace; it lies 3+ hexes from the enemy and within 10 of the objective. The stager is
  a member of a next-step group or a unit no group uses. Where nothing feeds the stager at the drop, the group's first
  truck also carries what it eats this step (12.6c). Trucks supply this-step groups as well as next-step groups. A
  unit that cannot move now and has no fuel to pay stays where it is this step.
- **Execution.** The stager may leave trace for its drop. The order of movement is HQs, stagers, placed trucks, the
  other combat units, so those see the SP on the map when they leave trace. A placed truck may deliver to its drop
  outside trace once a combat unit or dump stands there. Members of a group that trucks supply may leave trace for
  any hex where the unloaded SP feed them.

Two faults were found and fixed on the way, on a 20-game subset of Movement-segment rollouts (`--shard i/24`,
`--trucks-only`, development builds that are not commits):

| Truck placements, 20 games | Drops outside trace, first build | Delivery fixed | With the new order and stagers |
|---|---:|---:|---:|
| Placements (segments) | 42 (29, stopped early) | 102 (57) | 98 (59) |
| Planned Tokens unloaded at the drop | 4 | 85 | 88 |
| Stager at the drop | 39 | 88 | 87 |
| Stagers out of trace with no SP to eat | 19 of 30 | 0 of 68 | 0 of 69 |

- First build: the truck's delivery list held only traced hexes, so it unloaded elsewhere and the stager starved.
- Of the 17 placements still short after that fix, 14 had the stager not at the drop: most could not pay fuel (now
  checked in the plan); in one map the stager's move would have cost an artillery unit its trace and the move step
  refused it.

## Rollouts from recorded states

`scripts/ai-theater-rollout.mjs --through n` cuts each save at the attacker's first Movement decision of the start
turns, loads the cut save as a session and lets both seats play until the attacker's n-th player turn from there has
ended. The other seat is the standard heuristic. Three attackers play from the same states: this build, the previous
version (`1a80498`, built into another directory and loaded with `--dist`) and the standard heuristic (`--standard`).
`--compare` pairs two of them by state, averages the differences over each map (the two seat-swapped games of a map
and its start turns are one cluster; 40 maps) and gives a 95% t interval.

```sh
B=artifacts/ai-theater-hq-games W=docs/quality/evidence/ai-theater-hq-games-2026-10-30/theater-weights.json
run() { mkdir -p $B/$1; for i in 0 1 2 3 4 5; do node scripts/ai-theater-rollout.mjs $B/attack-western --weights $W --out $B/$1/shard-$i.jsonl --shard $i/6 --starts $2 --through $3 $4 $5 & done; wait; }
run two-turn/final 1,3 2; run two-turn/committed 1,3 2 --dist <build of 1a80498>/dist; run two-turn/standard 1,3 2 --standard
run four-turn/final 1 4;  run four-turn/committed 1 4 --dist <build of 1a80498>/dist;  run four-turn/standard 1 4 --standard
node scripts/ai-theater-rollout.mjs --compare $B/two-turn/final $B/two-turn/standard   # and the other pairs
node scripts/ai-theater-rollout.mjs --summarize $B/two-turn/final/shard-*.jsonl
```

Node v26.9.0. Every rollout reached the end of its last attacker player turn. Sorted row SHA-256, two turns: this
build `5e5b5852c75a…`, previous `2a12f2ae74a7…`, standard `0b50f8f3f9b5…`; four turns: `4e65d8036937…`,
`dd2b6530fe0c…`, `1f49191947ce…`.

**Two attacker player turns, from Game Turns 1 and 3 (160 states):**

| Measure | This build | Previous | Standard | This − standard, per map | This − previous, per map | Previous − standard, per map |
|---|---:|---:|---:|---|---|---|
| Objective points gained by the attacker | 3.83 | 3.12 | 2.49 | **+1.34 [0.67, 2.01]** | +0.71 [0.13, 1.28] | +0.63 [0.09, 1.17] |
| Defender steps lost | 7.34 | 5.84 | 5.81 | +1.53 [0.70, 2.36] | +1.50 [0.71, 2.29] | +0.03 [−0.51, 0.57] |
| Attacker steps lost | 2.93 | 2.16 | 1.97 | +0.96 [0.54, 1.38] | +0.78 [0.43, 1.12] | +0.19 [−0.09, 0.46] |
| Attacker regular attacks | 5.38 | 4.49 | 4.41 | +0.97 [0.46, 1.49] | +0.89 [0.43, 1.36] | +0.08 [−0.25, 0.41] |

This build minus the standard, objective points: +1.48 [0.63, 2.32] from Game Turn 1 and +1.20 [0.26, 2.14] from Game
Turn 3.

**Four attacker player turns, from Game Turn 1 (80 states):**

| Measure | This build | Previous | Standard | This − standard, per map | This − previous, per map | Previous − standard, per map |
|---|---:|---:|---:|---|---|---|
| Objective points gained by the attacker | 7.50 | 6.08 | 5.00 | **+2.50 [0.56, 4.44]** | +1.43 [−0.32, 3.17] | +1.07 [0.05, 2.10] |
| Defender steps lost | 16.10 | 13.45 | 11.43 | +4.67 [2.15, 7.20] | +2.65 [−0.23, 5.53] | +2.02 [0.41, 3.64] |
| Attacker steps lost | 6.70 | 5.75 | 4.65 | +2.05 [1.05, 3.05] | +0.95 [−0.31, 2.21] | +1.10 [0.14, 2.06] |
| Attacker regular attacks | 10.32 | 9.32 | 8.32 | +2.00 [0.86, 3.14] | +1.00 [−0.20, 2.20] | +1.00 [−0.01, 2.01] |

**Plans and their follow-through at the 160 starting segments of the two-turn rollouts:**

| Measure | This build | Previous |
|---|---:|---:|
| Defended groups per segment, this step / next step | 0.71 / 0.91 | 0.52 / 0.36 |
| Plan's expected VP per segment | 3.52 | 2.03 |
| This-step groups: attacked in the first turn / held when the second ends | 105 and 88 of 114 | 76 and 71 of 83 |
| Next-step groups: attacked in the first / second turn / held when the second ends | 39, 55 and 53 of 146 (0.36) | 30, 17 and 29 of 57 (0.51) |
| Truck placements: planned Tokens unloaded at the drop | 167 of 175 | 10 of 13 |
| HQ placements at their hex | 33 of 37 | 35 of 38 |
| Stagers when Movement ends: in trace / out with SP to eat / out with none | 16 / 116 / 1 of 133 | 10 / 0 / 0 of 10 |

The build has 2.5 times the next-step groups of the previous version and holds a smaller share of them (0.36 against
0.51), 53 objectives against 29.

## Tried and not kept

Each arm below is the build above plus one change, in the same rollouts (development builds, not commits).

- **Supplied staging hexes.** The plan assumes a next-step member first moves to the hex of its reach nearest the
  objective; that hex is often outside trace, and the member stops at the edge of trace instead. In a smoke game the
  stager stood at the drop 3 hexes from the objective while the other members were still 16 away, and the group was
  next-step again a turn later. With the staging hex required to have supply (trace, a dump or the drop's draw) and
  the trucks carrying what a member staging outside trace eats: next-step groups held 60 of 143 (0.42), objective
  points −0.27 [−0.79, +0.26] over two turns and −0.28 [−0.93, +0.38] over four. No difference shown, so the simpler
  plan was kept.
- **Eight drops tried per objective.** Defender steps lost −0.66 [−1.10, −0.22] and attacks −0.34 [−0.63, −0.04] over
  two turns; not adopted.
- **Without the rule that members of a trucked group may leave trace for fed hexes**: objective points +0.03
  [−0.37, +0.42] over two turns; the rule changes nothing measurable and is kept because it lets members follow the SP.

## Checks

- Full test suite: 816 passed, 7 skipped. `tests/ai/theater-allocation.test.ts` checks that a stager is a member of a
  next-step group or belongs to no group, that the trucks carry its meal where nothing feeds it at the drop, and that
  a unit without fuel is planned from where it stands.
- The standard policy is unchanged: four standard-against-standard games (1900000–1900003) replayed with this build
  reach the final state hashes recorded for them.
- Development smoke games (2199000–2199015, seat-swapped, not a registered batch): all 16 finished and passed the
  replay check. In the 8 games the theater policy attacked in, 16 trucks were placed and all unloaded, 11 at the drop;
  all 10 this-step groups attacked; of the 16 next-step groups of Game Turns 1–3, 5 were held at the end of the next
  turn.

## Limits

- Development rollouts: not registered in advance, several measures and several builds read on the same 160 states,
  all from one batch (half from games the previous theater version attacked in), one opponent, Western Europe Axis
  attacks only.
- At most four attacker player turns. Units pushed beyond trace live on the SP unloaded for them; whether they are
  kept supplied afterwards, and the whole game's VP, are not observed here. The attacker also loses more steps.
- Next-step groups are held less often than before; their members often cannot follow the stager out of trace.
- Whether theater planning helps is to be answered by a registered batch of new games.
