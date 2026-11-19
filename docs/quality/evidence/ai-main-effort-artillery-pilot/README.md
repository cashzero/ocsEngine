# Main-effort artillery pilot

Base commit `c58d748` with the artillery candidates in the working tree. Both sides used the ground barrage fix. The Axis variant routed its three nearest available guns to the current primary effort, changed their mode by the old v81 distance thresholds and applied v81's local SP pricing to ground combat and artillery against units. The underlying theater plan chose the main effort. This differs from the historical candidate's new assault planner and its gun assignments to secondary efforts.

## Continuations

Input selection fixed before the run. Two existing Western attack positions and two existing Eastern attack positions, all at the attacker's regular Movement Segment in Game Turn 6. In each style the two inputs are the first two games in the source batch with the Axis attacker on the candidate seat. Two common dice streams per position. The Allied opponent always used the baseline; only the Axis policy was changed. [Branches](branches.jsonl) · [Baseline](baseline.json) · [Candidate](candidate.json)

```sh
node scripts/ai-continue-batch.mjs \
  --branches docs/quality/evidence/ai-main-effort-artillery-pilot/branches.jsonl \
  --variant base=heuristic:docs/quality/evidence/ai-main-effort-artillery-pilot/baseline.json \
  --variant guns=heuristic:docs/quality/evidence/ai-main-effort-artillery-pilot/candidate.json \
  --opponent heuristic:docs/quality/evidence/ai-main-effort-artillery-pilot/baseline.json \
  --dice 2 --horizons 1 --jobs 4 --out-dir artifacts/ai-main-effort-artillery-pilot
```

All 16 continuations reached FINISHED in about 2.8 minutes. The runner logged zero failed runs and zero unfinished continuations. Terminal candidate minus baseline, averaging dice within each map:

| Style | Maps | VP margin | Regular attacks | Ground barrages | Total SP spent |
|---|---:|---:|---:|---:|---:|
| Western Europe | 2 | +4.00 | +1.50 | +0.50 | +4.25 SP |
| Eastern Europe | 2 | 0.00 | 0.00 | 0.00 | 0.00 SP |
| All | 4 | +2.00 | +0.75 | +0.25 | +2.12 SP |

All the VP gain came from seed 1300201. Axis minus Allied final VP changed from +14 to +22 on both dice streams. Both styles were unchanged at the first horizon on VP. Total SP includes fuel, combat and other tracked spending. The first Movement Segment of the four continuations had zero gun mode changes in either variant. The candidate designated three guns on Eastern seed 2800303 at `-6,19`. This late-game pilot leaves the contribution of gun placement, gun orientation and local SP pricing unresolved.

## Movement checks

The [movement-only replay](movement-check.mjs) used the recorded dice and bot seeds. On Western seed 1300205 the candidate assigned three guns to `9,8` in Game Turn 2 and to `6,11` in Game Turn 4. At the end of the second-turn Movement Segment, five guns could still reach `12,12`, compared with eight for the baseline. On Eastern seed 2800303 in Game Turn 2, the candidate assigned no artillery. No gun switched mode in these three replays.

Typecheck and build passed. The focused barrage, facility barrage and theater-allocation suite passed 20 tests. Further testing stopped at the user's request.
