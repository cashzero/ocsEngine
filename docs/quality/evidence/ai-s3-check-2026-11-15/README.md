# S3 check: approachAttack on positions not used for development

Boundary: rollouts from recorded positions; no new game, no promotion. The standard policy is unchanged (heuristic@86).
This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S3.3 of the AI strategy
improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#4-s3-在戰區配置內做兵力集中). Development:
[S3.1–S3.3](../ai-s3-e6-approach-2026-11-15/README.md).

**Result: the check fails.** Concentration rises as on the development maps, but the objective-point gain does not
repeat, and neither objective points nor Kill − Loss clear their non-inferiority bounds. By the registration,
`approachAttack` does not go to S4 and the result goes to the user.

## Registration

[registration.json](registration.json), committed in `f2118be` before any check rollout. Candidate S3: heuristic@86 with
[s3-weights.json](s3-weights.json) (`approachAttack` 1), against heuristic@86. Positions: the 40 maps of 2100000–2100079,
the even-numbered match of each seed, from the attacker's first Movement decision of Game Turn 1
(`artifacts/ai-theater-allocation-games/attack-western`); read before only by the P11.8 one-turn observation and its plan
replay. heuristic@86 defending.

```sh
K=artifacts/ai-s3/check
for arm in S3 v86; do for i in 0 1 2 3 4 5; do node scripts/ai-theater-rollout.mjs artifacts/ai-s1/check2-even \
  --weights $K/$arm.json --out $K/$arm/rows-$i.jsonl --shard $i/6 --starts 1 --through 6 --save-dir $K/$arm/saves \
  --policy-label $arm & done; done; wait   # then merge summary-*.json into summary.json
node scripts/ai-theater-rollout.mjs --compare $K/S3 $K/v86
node docs/quality/evidence/ai-s3-e6-approach-2026-11-15/s3-concentration.mjs . S3=$K/S3/saves v86=$K/v86/saves
```

Build `f2118be`, Node v26.9.0. All 80 rollouts reached the end of the attacker's sixth player turn.

## Observed

| Registered condition, S3 − heuristic@86 per map (40 maps) | Result | Threshold | Pass |
|---|---|---|---|
| Objective points over six attacker turns | +0.00 [−1.48, +1.48] (16 up, 10 down) | lower end > −0.75 | **no** |
| Attacker Kill − Loss (defender minus attacker steps lost) | +0.40 [−2.90, +3.70] | lower end > −1.5 | **no** |
| Strength beside defended objectives at the start of Combat | +14.2 [+6.5, +21.9] (45.7 against 31.5) | mean > 0 | yes |
| Regular attacks at column index 6 or more, per attacker turn | +0.03 [−0.10, +0.17] | mean > 0 | yes |
| Every rollout to the end of the sixth attacker turn | 80/80 | all | yes |

Reported: regular attacks +0.07 a turn [−0.10, +0.24]; defended objectives with own units beside them +0.23 [+0.07,
+0.40]; attacker steps lost −0.68, defender steps lost −0.28.

## What this shows

- The change does what it is for: units close in, and more defended objectives have attackers beside them.
- What that buys is not settled. The registered continuation test (160 branch points, whole games from Game Turn 2) found
  +2.00 ± 0.59 VP margin; the development rollouts +1.43 [+0.43, +2.42] objective points over six turns; these check
  rollouts +0.00 [−1.48, +1.48]. With 40 maps the check's interval is ±1.5 points, so passing a −0.75 bound needed a gain
  near +0.8.

## Limits

- One set of 40 maps, six attacker turns from Game Turn 1.
- By the plan's rule, failed checks are not topped up with more positions.

## Raw data

The ignored `artifacts/ai-s3/check/` of the `ai-truck-shuttle` worktree.
