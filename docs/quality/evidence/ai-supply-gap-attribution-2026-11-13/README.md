# Where the theater attacker's SP stays behind (S1.1)

Boundary: offline analysis of saved rollouts; no game is played, no policy changes. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S1.1 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#2-s1-補完-v86-的補給例外). Gates: [attacker logistics gate and attacker
supply gate](../../../ai/evaluation.md#攻方運補-gate).

## Question

With the rail fix, rollouts of the registered batch's 40 maps still fail both attacker supply gates
([record](../ai-theater-supply-gates-2026-11-13/README.md)): rear SP left 6.5 a segment against heuristic@85's 4.9, SP no
front unit can draw 2.4 against 1.5. Where does that SP stay, and what happened at those piles? The plan named four
hypotheses: H1 fewer truck trips, H2 rail holds back too much at pickup hexes, H3 assigned HQs leave the dumps, H4 old drop
points keep leftovers. Acceptance: the categories cover both gaps, each with SP and examples; when more than 30% is
unattributed, break it down further before S1.2.

## Inputs

- Saves: the three arms of the rail-fix rollouts (`artifacts/ai-theater-rail-fix/{fixed,unfixed,standard}/saves`), each 80
  rollouts of Game Turns 1–6 from the batch 2100400–2100479's first attacker Movement decision: the theater policy with the
  rail fix (`fixed`, heuristic@86), without it (`unfixed`, `c2e9713`'s build) and heuristic@85 (`standard`), heuristic@85 in
  the other seat.
- Build: `1aba7d4` (heuristic@86; only replays and rule queries are used). Node v26.9.0.
- Script: `scripts/ai-supply-gap-study.mjs` (new, reusable); `sp-entry-all.mjs`, `rail-dest.mjs` and `rail-explain.mjs` in this
  folder for the follow-up checks.

```sh
R=artifacts/ai-theater-rail-fix
for i in 0 1 2 3 4 5; do node scripts/ai-supply-gap-study.mjs --arm fixed=$R/fixed/saves --arm unfixed=$R/unfixed/saves \
  --arm standard=$R/standard/saves --from 3 --to 6 --shard $i/6 --out artifacts/ai-supply-gap/rows-$i.jsonl & done; wait
node scripts/ai-supply-gap-study.mjs --summarize artifacts/ai-supply-gap/rows-*.jsonl --baseline standard --json summary.json
node docs/quality/evidence/ai-supply-gap-attribution-2026-11-13/rail-dest.mjs . fixed=$R/fixed/saves standard=$R/standard/saves
node docs/quality/evidence/ai-supply-gap-attribution-2026-11-13/sp-entry-all.mjs . <arm> <even-numbered saves...>
```

960 attacker Movement segments (Game Turns 3–6, 320 an arm); sorted row SHA-256 `ce82d4784b3e…`. Each segment's totals equal
the gate scripts' measures: SP no front unit can draw 2.37 (fixed), 3.16 (unfixed), 1.48 (standard); rear SP left 6.49, 8.31,
4.93.

**Clustering.** The two seat-swapped games of a seed start the rollout from the same position, and all 120 pairs of rows are
identical, so the sample is 40 maps. Differences are means per map with a 95% t interval over the 40 maps, as in
`ai-theater-rollout.mjs --compare`. A first summary that treated the 80 games as independent gave intervals √2 too narrow;
the numbers below are clustered.

## Categories

At each segment's end, each attacker pile (a dump that is not a garrison stock, or SP on a truck) is measured as each gate
measures it and given the first category that applies:

| Category | What happened at the pile |
|---|---|
| truck | SP still on a truck |
| drop-now | a truck unloaded at its hex in this segment |
| railed-now | rail delivered SP to its hex in this segment (not loadable this phase, 12.2a) |
| rail-cut | its hex is on the rail net, but when the segment began, with Rail Cap unspent, no legal RAIL_MOVE could carry SP from it forward |
| rail-could | at the segment's last decision a legal RAIL_MOVE could still carry SP from it forward, and rail left it (H2) |
| loaded-now | a truck loaded from it in this segment and the rest stayed |
| old-drop | a truck unloaded at its hex in an earlier segment (H4) |
| hq-moved | a front unit could draw it had the attacker's HQs stayed where they began the segment (H3; rule query on the state with those HQs put back) |
| idle-truck | a truck that was empty when the segment began and loaded nothing could have reached its hex (H1) |
| other | none of the above |

"Forward" is the logistics gate's definition: a destination at least 3 hexes nearer the enemy and at least 3 hexes from it.

## Observed

SP per segment; the difference is fixed − standard per map ([summary.json](summary.json)).

| Category | SP no front unit can draw: fixed | standard | difference | Rear SP left: fixed | standard | difference |
|---|---:|---:|---|---:|---:|---|
| truck | 0.09 | 0.10 | −0.01 [−0.11, +0.09] | — | — | — |
| drop-now | 0.16 | 0.06 | +0.10 [−0.08, +0.29] | 0.65 | 0.32 | +0.33 [−0.05, +0.70] |
| railed-now | — | — | — | 2.54 | 1.35 | +1.19 [−0.35, +2.74] |
| rail-cut | 0.73 | 0.68 | +0.05 [−0.82, +0.92] | 1.11 | 1.91 | −0.80 [−2.63, +1.03] |
| rail-could | 0.03 | 0.00 | +0.03 [−0.01, +0.06] | 0.09 | 0.10 | −0.02 [−0.14, +0.11] |
| loaded-now | 0.75 | 0.22 | +0.53 [−0.08, +1.13] | 1.08 | 0.55 | +0.53 [−0.15, +1.20] |
| old-drop | 0.05 | 0.11 | −0.07 [−0.19, +0.06] | 0.10 | 0.13 | −0.03 [−0.18, +0.11] |
| hq-moved | 0.05 | 0.00 | +0.05 [−0.01, +0.12] | 0.05 | 0.00 | +0.05 [−0.01, +0.12] |
| idle-truck | 0.15 | 0.10 | +0.05 [−0.12, +0.21] | 0.29 | 0.13 | +0.16 [−0.07, +0.39] |
| other | 0.37 | 0.21 | +0.16 [−0.15, +0.48] | 0.58 | 0.43 | +0.14 [−0.25, +0.54] |
| **total** | 2.37 | 1.48 | **+0.89 [−0.02, +1.80]** | 6.49 | 4.93 | **+1.56 [−0.98, +4.09]** |

Unattributed (`other`): 18% of the first gap, 9% of the second.

Flows per segment, fixed against standard: trucks load 4.06 against 4.08 SP and unload 3.73 against 3.79; trucks empty at the
start that load nothing 1.04 against 1.15; rail carries 10.21 against 9.21 SP, forward 9.14 against 7.89 (+1.26 [+0.05, +2.46]).

### What this shows

- **Neither gap is established per map.** Both intervals include 0; the gates compare means, so they fail. The gaps are
  concentrated: one map (2100474) gives 44% of the first (+15.8 SP a segment on that map, +0.40 of the +0.89); without the
  three largest maps the first gap is +0.26. The second gap has its five largest maps at +9 to +19 and its five smallest at
  −6 to −28.
- **Rear SP that front units can draw.** Of the +1.56 rear gap, +0.52 is SP that a front unit can draw and +1.04
  [+0.19, +1.89] is SP that none can. The first part is mostly `railed-now`: the fixed arm rails more SP forward, to
  stations 6–9 hexes (+63 SP over the 160 segments) and 10+ hexes (+103 SP) from the enemy, and at the segment's end 98% of
  the SP railed is at a pile some front unit can draw (standard 100%). The rear gate counts it because it is 6 or more hexes
  from the enemy. The SP that is both in the rear and out of every front unit's reach, +1.04, is the only part whose interval
  is above 0, and it is nearly all of the first gap (SP no front unit can draw within 6 hexes of the enemy: −0.15).
- **H1 (truck trips): not supported.** Loads, unloads and idle empty trucks per segment are the same in both arms. Idle
  empty trucks could reach more of the fixed arm's rear piles (flag, overlapping: +1.50 [+0.36, +2.64]), but those piles are
  mostly in earlier categories.
- **H2 (rail holds back too much): removed by the rail fix.** `rail-could` is 0.48 without the fix and 0.03 with it.
- **H3 (HQs leave the dumps): small**, 0.05. **H4 (old drops): no**, −0.07.
- **Rail cut at the entry hex.** The largest single pile, the fixed arm's on 2100474, sits at the map-edge entry hex 20,22
  (16–20 SP, Game Turns 3–6). At Game Turn 3 the only rail move from there is to the adjacent 19,21: there is no rail path to
  23,11 free of enemy units and ZOC, and 14,20 is not detrainable (13.3c, 13.3e). heuristic@85's attacker on the same map
  rails 28–40T a turn from 20,22 to 14,20 or 23,11; from its Game Turn 3 position, 11 destinations. Cuts like this occur in both
  arms, on different maps (rail-cut 0.73 against 0.68).

## The arriving SP's entry hex

The policy places arriving SP on a railroad entry hex when it can (heuristic@79; `reinforcementStep`), by the map's rail
lines, without asking whether rail can carry SP forward from it this turn. For every attacker SP placement in Game Turns 2–6
of the 40 maps, `sp-entry-all.mjs` places the SP at each legal entry hex in turn, replays the rest of the Reinforcement Phase
as recorded and counts forward rail moves from that hex at the first attacker Movement decision:

| Attacker | Placements | At a hex with no forward rail | …while another entry hex had one |
|---|---:|---:|---:|
| fixed (heuristic@86) | 200 | 11 (132 SP) | 9 (110 SP), 4 maps |
| standard (heuristic@85) | 200 | 21 (253 SP) | 14 (166 SP), 6 maps |

On 2100474 at Game Turn 3, SP placed at 25,12 could have gone by rail to 20,16 (4 hexes from the enemy), 19,5 (5) and six other
stations. This is an error of the shared placement rule, more frequent with heuristic@85 than with heuristic@86.

## Conclusion for S1.2

- The categories cover both gaps; unattributed below 30%. S1.1's acceptance is met.
- Of the four hypotheses only H2 was a cause, and the rail fix removed it.
- What remains is not a systematic gap per map. Its largest identified sources are:
  - SP placed at an entry hex whose rail line is cut, a rule error that both arms share;
  - in the rear gate, SP that rail brings to stations 6 or more hexes from the enemy, which front units can draw.
- S1.2 in the order of this record:
  - place arriving SP at an entry hex from which rail can carry it forward this turn;
  - then look again at `loaded-now`, piles that trucks loaded from and rail did not move, +0.53 per segment, mostly on
    two maps.
- The rear gate counting SP that front units can draw is a property of the gate, not a policy error. Changing the gate is
  the user's decision.

## Limits

- Rollouts from Game Turn 1 states of one batch, 40 maps, Game Turns 3–6; not new games.
- The categories describe what happened at a pile, not a cause proven by a continuation; `idle-truck` and `hq-moved` are
  reachability checks, not plans.
- `rail-cut` is decided at the segment's first decision; a line opened or cut during the segment is not seen.
- The entry-hex check replays the rest of the Reinforcement Phase as recorded after moving one placement; it does not replay
  the turn's Movement.

## Raw data

The ignored `artifacts/ai-supply-gap/` of the `ai-truck-shuttle` worktree: `rows-*.jsonl` (one row per segment), `entry-*.jsonl`
(one row per SP placement).
