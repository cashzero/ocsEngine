# Attacker supply gates for the theater allocation, and the rail fix

Boundary: offline analysis of saved games and rollouts from recorded states; no registered batch. The standard policy
is unchanged (heuristic@85, weight `theaterAllocation` 0); this record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Gates: [attacker logistics gate and attacker supply
gate](../../../ai/evaluation.md#攻方運補-gate). Batch: [drops outside trace in play](../ai-theater-untraced-games-2026-11-13/README.md).

The user asked to promote the theater allocation as the standard (2026-11-13: 「既然如此 promte此solution 並且commit and
push」). A candidate that changes trucks and HQ placement must also pass the two attacker supply gates. They failed;
asked how to proceed, the user chose to find the cause before deciding (「先查原因再決定」). The promotion is not done.

## Gates on the registered batch

The gates read the batch's Western Europe attack games (2100400–2100479) where the theater policy attacked, against
heuristic@85's self-play on the same seeds (`--swap`, played for this record from `02bc90c`'s build;
`artifacts/ai-theater-untraced-games/standard-selfplay`, 80 games, all finished and replayed), attacker Movement
segments from Game Turn 3.

```sh
B=artifacts/ai-theater-untraced-games P=heuristic:docs/quality/evidence/ai-theater-untraced-games-2026-11-13/theater-weights.json
node scripts/ai-match.mjs --matches 80 --start 2100400 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic --axis heuristic --swap --parallel 6 --out $B/standard-selfplay
node scripts/ai-logistics-study.mjs $B/attack-western --baseline $B/standard-selfplay --gate $P --out $B/logistics
node scripts/ai-fuel-study.mjs $B/attack-western --baseline $B/standard-selfplay --gate $P --out $B/fuel
```

| Gate check (attacker) | Theater policy | heuristic@85 | Result |
|---|---:|---:|---|
| Rail Cap used of SP railable forward | 100% | 100% | pass |
| Rear SP left after moving, per segment | 9.3 | 5.6 | **fail** |
| Garrison stock loaded or railed | 0 | 0 | pass |
| SP no front unit can draw, per segment | 3.9 | 1.7 | **fail** |
| Units unable to fuel (reported, no threshold) | 13.5 a game (14%) | 9.6 (11%) | — |
| Dry HQs (reported) | 10% | 5% | — |

## Where the SP is

For each attacker Movement segment from Game Turn 3, the SP no front unit can draw were split by where they lie and
what happened at their hex in the segment (a development script; the measure is the supply gate's).

- Theater policy 3.87 SP a segment, heuristic@85 1.67. Of the theater policy's, 3.01 lie 10+ hexes from the enemy and
  3.60 are 7+ hexes from any front unit.
- The theater army advances further (objectives held at the segment start 2.07 against 1.07), but that does not
  explain it: in the segments where both hold as many objectives, 3.32 against 1.20.
- The largest piles stand at map-edge entry hexes, 50–130T, where heuristic@85 holds nothing in the same game and turn.
  Half of the theater policy's stranded SP is at hexes a truck loaded from in that segment.

**Cause found.** For a placed truck, rail did not move any SP from the hex where the plan counted its load. A truck
loads 4–12T; the entry hexes hold far more, and the rest stayed there, turn after turn. The rule also held when the
truck, choosing again when it moved, loaded elsewhere.

**Fix.** Rail leaves at that hex what the placed, still empty trucks counting on it carry (a full load each) and may
move the rest.

## Rollouts with the fix

`scripts/ai-theater-rollout.mjs --starts 1 --through 6 --save-dir <dir>` plays each of the batch's 80 games from the
attacker's first Movement decision of Game Turn 1 to the end of its sixth player turn (Game Turns 1–6), heuristic@85 as
the other seat, and writes the saves so that the gate scripts can read them. Three attackers from the same states: the
theater policy with the fix, without it (`c2e9713`'s build, `--dist`), and heuristic@85 (`--standard`). The gates then
compare each theater arm with the heuristic@85 arm over Game Turns 3–6.

```sh
R=artifacts/ai-theater-rail-fix
for i in 0 1 2 3 4 5; do node scripts/ai-theater-rollout.mjs $B/attack-western --weights <weights> --out $R/fixed/rows-$i.jsonl --shard $i/6 --starts 1 --through 6 --save-dir $R/fixed/saves --policy-label theater-fixed & done; wait
# the same with --dist <build of c2e9713>/dist --policy-label theater-unfixed, and with --standard; merge each summary-*.json into summary.json
node scripts/ai-logistics-study.mjs $R/fixed/saves --baseline $R/standard/saves --gate theater-fixed
node scripts/ai-fuel-study.mjs $R/fixed/saves --baseline $R/standard/saves --gate theater-fixed
node scripts/ai-theater-rollout.mjs --compare $R/fixed $R/standard
```

Node v26.9.0. All 240 rollouts reached the end of the attacker's sixth player turn. Sorted row SHA-256: fixed
`634279d0424b…`, unfixed `ecbdb0a7a716…`, heuristic@85 `30e576c6c4eb…`.

| Attacker, Game Turns 3–6 of the rollouts | Without the fix | With the fix | heuristic@85 |
|---|---:|---:|---:|
| Rear SP left after moving, per segment | 8.3 | 6.5 | 4.9 |
| SP no front unit can draw, per segment | 3.2 | 2.4 | 1.5 |
| Units unable to fuel, per game | 7.4 (12%) | **5.8 (9%)** | 6.3 (11%) |
| Dry HQs | 10% | 8% | 6% |
| Rail Cap used | 71% | 80% | 70% |
| Objective points gained over six attacker turns, minus heuristic@85, per map | +2.98 [1.40, 4.55] | +2.80 [1.23, 4.37] | — |

With the fix minus without, per map: objective points −0.17 [−0.65, +0.30], defender steps lost −0.38 [−1.20, +0.45],
attacker steps lost +0.78 [−0.22, +1.77]. Both gates still fail with the fix.

**Not the cause of what remains.** One rollout had an enemy unit beside the rail line out of an entry hex, which left
no destination. Across the rollouts that is rare and as common as with heuristic@85: piles of 8T or more with no rail
destination 4+ hexes away in 18 of 400 segments (0.71 SP a segment) against 20 (0.77). The rest of the gap is not
explained yet. With the fix, the theater policy's stranded SP lies further from the enemy (6–9 hexes 0.49 against
0.12, 10+ hexes 1.57 against 0.91), at hexes trucks loaded from (1.02 against 0.70) and at older piles (1.19 against
0.72).

## Checks

- Full test suite: 816 passed, 7 skipped.
- The standard policy is unchanged: four standard-against-standard games (1900000–1900003) replayed with this build
  reach the final state hashes recorded for them.

## Limits

- The gates with the fix are read on rollouts from recorded Game Turn 1 states, not on a development batch of new games.
- The registered batch's VP observation is of the version without the fix; the rollouts show no difference in
  objective points between the two.
- The remaining gap is not attributed.
