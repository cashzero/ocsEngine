# Attacker truck shuttle development (candidate heuristic@78)

Source: base `4222bbe` plus the commit that adds this folder (branch `ai-truck-shuttle`), built with `npm run build`
in the worktree; the opponent is the frozen standard build `artifacts/ai-vp/baseline-75/dist` (heuristic@75).
The candidate replaces the truck logic only: each truck runs fetch → deliver → return legs within one Movement
Segment, and the rules' LOAD_SUPPLY candidates now offer the Tokens a dump may still load after 12.2a.

Inputs: the registered attacker logistics gate (`docs/ai/evaluation.md`, 攻方運補 gate) on the known development seeds,
16 swapped-seat games, eight turns, 32×24, six divisions (two armored), no aircraft or air transport, Axis attacks:

```sh
node scripts/ai-match.mjs --matches 8 --start 1300200 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 \
  --air NONE --air-transport NONE --style TEMPERATE_INLAND --engagement AXIS_ATTACKS --allied heuristic \
  --axis heuristic@/home/cashlin/ocsEngine/artifacts/ai-vp/baseline-75/dist --swap --trace --out artifacts/ai-logistics/v78-try3/attack-temperate
# same with --start 1300300 --style EASTERN_EUROPE --out .../attack-eastern; both groups ran concurrently
node scripts/ai-logistics-study.mjs artifacts/ai-logistics/v78-try3/attack-temperate artifacts/ai-logistics/v78-try3/attack-eastern --gate heuristic
node scripts/ai-supply-study.mjs <group dir>; node scripts/ai-compare.mjs <group dir>
node docs/quality/evidence/ai-logistics-truck-shuttle-development-2026-10-16/haul-ceiling.mjs . <both group dirs>
```

Expected: every game FINISHED with a matching replay hash and no rejected action; supply audit violations 0; the gate
passes all four checks.

Observed:

- 16/16 games FINISHED, replay hash ok, 0 rejected actions, no FAILED_ACTION, BOT_STALLED or BOT_BUDGET_EXCEEDED.
- Gate ([logistics-gate.json](logistics-gate.json), [logistics.json](logistics.json)): **FAIL**. Truck haul 0.38 (needs
  0.60; v75 attacker in the same batch 0.25). Rail Cap of SP railable forward 1.00 (PASS). Rear SP left after moving
  2.6 vs 12.0 (PASS). Garrison stock loads/rails 0/0 (PASS).
- Haul limiter (`haul-ceiling.mjs`, 48 candidate attacker segments): income 9.0 SP per segment; 15.2 truck points
  on the map (v75 13.0, it loses more trucks); SP loadable at the first truck action (dumps ≥ 5 hexes from the enemy,
  not garrison stock, less SP railed or unloaded this phase) 8.4 SP, so the ceiling is 0.55; loaded 5.9 SP. Even if
  every arriving SP were trucked once, 9.0 ÷ 15.2 = 0.59. SP unloaded in a phase cannot be loaded again in it (12.2a),
  so a relay cannot count the same SP twice in one segment. v75 measured 0.25 against 13.8 loadable SP per segment.
- Remaining waste: trucks trapped beside cut-off groups (1300303 turn 7: six legal moves, none nearer the rear) and
  segments with no traced drop nearer the army than the rear dump (1300301 turns 6-8), where loading is pointless.
- Supply audit (`ai-supply-study.mjs`, counted as `scripts/ai-promotion/verify.py` does): preview mismatches, other-unit
  trace breaks, relocation trace breaks, feed breaks and unpreserved ration spending all 0 in both groups;
  own-action attrition 0.
- VP (`ai-compare.mjs`): candidate 121, v75 107 (+14). Temperate 70–62 (candidate as attacker 24, as defender 46),
  Eastern 51–45 (as attacker 5, as defender 46). Paired margin +1.00 ± 1.58 and +0.75 ± 0.75 per game.
- Decision latency (traces, both groups, 8 concurrent workers): candidate p50 35 ms, p95 283 ms, p99 688 ms, max 3.9 s;
  v75 p50 32 ms, p95 293 ms, p99 687 ms, max 3.3 s.
- Quality: `npm run typecheck` and `npm run build` pass; `npm test` 746 passed, 2 failed, 8 skipped. The two failures are
  single-trajectory continuation tests: `reinforcement-supply` (reference-opponent, needs ≥ 2 VP, got 0) and
  `vp-capture` 1210002 (needs 8 VP, got 3). Replaying each from the same position under 12 rules-RNG seeds (seed 0 is
  the recorded one): `vp-capture` v75 80 VP, candidate 83 VP (5 better, 3 worse, 4 equal); `reinforcement-supply`
  v75 38 VP, candidate 24 VP (10 equal, seeds 0 and 11 worse). In both reinforcement-supply seeds the divergence starts
  when an empty truck no longer drives to SP unloaded that phase (12.2a) and takes a 2T relief load from a forward dump
  instead; the dice then differ and the turn-8 initiative changes.

Final state: the candidate is not promoted; the gate stays failed on truck haul.
