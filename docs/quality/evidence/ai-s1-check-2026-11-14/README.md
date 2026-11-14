# S1 check: the end condition on positions not used for development

Boundary: rollouts from recorded positions; no promotion, no registered game batch. The standard policy is unchanged
(heuristic@86). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S1 end
condition of the AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#2-s1-補完-v86-的補給例外).
Development: [S1.2–S1.5](../ai-s1-development-2026-11-14/README.md).

**Result: S1's end condition is not met.** Both attacker supply measures are worse than heuristic@85 on the check
positions. By the registration, S1 stays open, S4 is not registered and the result goes to the user.

## Registration

[registration.json](registration.json), committed in `0d1e288` before any check rollout was run. Candidate S1:
heuristic@86 with [s1-weights.json](s1-weights.json) (`arrivalRailForward` 1). Arms S1, heuristic@86 and heuristic@85
(`theaterAllocation` 0) as the attacker; heuristic@86 in the other seat. Positions: the 40 maps of 2100100–2100179, the
even-numbered match of each seed, from the attacker's first Movement decision of Game Turn 1; these were not used to
develop S1.1–S1.5.

```sh
C=artifacts/ai-s1/check
for arm in S1 v86 v85; do for i in 0 1 2 3; do node scripts/ai-theater-rollout.mjs artifacts/ai-s1/check-even \
  --weights $C/$arm.json --out $C/$arm/rows-$i.jsonl --shard $i/4 --starts 1 --through 6 --save-dir $C/$arm/saves \
  --policy-label $arm & done; done; wait   # then merge summary-*.json into summary.json
node scripts/ai-logistics-study.mjs $C/S1/saves --baseline $C/v85/saves --gate S1
node scripts/ai-fuel-study.mjs $C/S1/saves --baseline $C/v85/saves --gate S1
node scripts/ai-theater-rollout.mjs --compare $C/S1 $C/v86
```

Build `0d1e288`, Node v26.9.0. All 120 rollouts reached the end of the attacker's sixth player turn.

## Observed

| Registered condition | S1 | heuristic@86 | heuristic@85 | Result |
|---|---:|---:|---:|---|
| Rear SP left after moving, per segment ≤ heuristic@85 | 5.1 | 5.1 | 3.8 | **fail** |
| SP no front unit can draw, per segment ≤ heuristic@85 | 2.3 | 2.0 | 1.0 | **fail** |
| Units unable to fuel, per game ≤ heuristic@85 | 6.3 (10%) | 7.1 (12%) | 7.5 (12%) | pass |
| Objective points, S1 − heuristic@86 per map: lower end > −0.75 | +0.15 [−0.21, +0.51] | — | — | pass |
| Every rollout to the end of the sixth attacker turn | 40/40 | 40/40 | 40/40 | pass |
| Full test suite; default weights play as frozen heuristic@86 | 818 passed, 7 skipped; 4/4 final hashes equal | — | — | pass |

Reported: objective points against heuristic@85, S1 +3.17 [+1.36, +4.99] and heuristic@86 +3.02 [+1.27, +4.78] per map;
defender steps lost +3.35 and +3.27. Rail Cap used of the SP railable forward is 100% for all three, garrison stock 0.

The identity check: `ai-match.mjs --matches 4 --start 2199400 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8
--size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE`, both seats `heuristic` and both seats
`heuristic@artifacts/ai-promotion/frozen-v86/dist`; all eight games finished and replayed, and each pair of final state
hashes is equal.

## What the check shows

Read after the result, with `scripts/ai-supply-gap-study.mjs` on the three arms (the positions are spent as a check, so
this is diagnosis only):

| SP no front unit can draw, per segment | S1 | heuristic@86 | heuristic@85 | heuristic@86 − heuristic@85 per map |
|---|---:|---:|---:|---|
| rail-cut | 0.38 | 0.35 | 0.05 | +0.30 [+0.07, +0.54] |
| railed-now | 0.54 | 0.18 | 0.06 | +0.12 [−0.18, +0.41] |
| loaded-now | 0.38 | 0.38 | 0.23 | +0.14 [−0.18, +0.47] |
| other | 0.67 | 0.73 | 0.35 | +0.38 [−0.04, +0.80] |
| **total** | 2.33 | 2.03 | 1.00 | **+1.02 [+0.22, +1.83]** |

- **Unlike the development positions, the gap is established here and spread out.** heuristic@86 is worse than
  heuristic@85 on 25 maps and better on 9; without its three largest maps the gap is still +0.57 SP a segment. On the
  development positions it was +0.89 [−0.02, +1.80] and mostly one map.
- **Rail lines cut out of the theater attacker's piles.** SP that rail could not carry forward from the start of the
  segment: 57 SP over the segments for heuristic@86, 8 for heuristic@85, about half at entry hexes and half at interior
  stations. The theater attacker's lines are cut far more often. The entry fix acts only at entry hexes, and only where
  another entry's line is open, so it leaves most of this in place (0.38 against 0.35).
- **The entry fix backfired on one map.** On 2100112, S1 placed the SP at another entry, and rail took it to the station
  17,20, which no front unit could draw from (9–29 SP in Game Turns 3–5). That map alone makes S1 worse than
  heuristic@86. Over the other maps S1 − heuristic@86 is −0.08 SP a segment. The fix asks only that rail carry the SP 3
  hexes nearer the front, not that a front unit can draw it at the station.
- Rear SP left is not established per map (S1 − heuristic@85 +1.28 [−0.60, +3.16]); its largest named part is `rail-cut`
  and an unattributed remainder.

## Limits

- Rollouts of six attacker turns from Game Turn 1 states, one set of 40 maps.
- The diagnosis reads positions that were the check; further development cannot use them as a check again. Other
  recorded batches (2100000–2100079, 2100200–2100279, 2100300–2100379) still offer Game Turn 1 positions that no S1 work
  has read.

## Raw data

The ignored `artifacts/ai-s1/check/` of the `ai-truck-shuttle` worktree.
