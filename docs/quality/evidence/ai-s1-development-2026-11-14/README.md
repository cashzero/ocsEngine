# S1 development: the SP entry fix, rail in the allocation, Game Turns 4–8 and next-step groups

Boundary: rollouts and replays of saved games on the development positions; no new game, no registered batch. The
standard policy is unchanged (heuristic@86; every change is behind a weight that defaults to 0). This record changes no
row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S1.2–S1.5 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#2-s1-補完-v86-的補給例外). The user asked to complete S1 (2026-11-14:
「完成$1」, read as 「完成S1」).

## Inputs

- Development positions: the 40 maps of the registered batch 2100400–2100479, the even-numbered match of each seed
  (`artifacts/ai-s1/dev-even`). The two seat-swapped rollouts of a seed are identical (S1.1), so one per map is enough.
- Rollouts: `scripts/ai-theater-rollout.mjs --starts 1 --through 6`, Game Turns 1–6 from the attacker's first Movement
  decision, heuristic@86 in the other seat (its defence is heuristic@85's). Weights in `artifacts/ai-s1/weights/`.
- Baselines reused: the rail-fix record's arms (`artifacts/ai-theater-rail-fix/{fixed,standard}`). With the build of this
  record, heuristic@86 (`theaterAllocation` 1) on 2100474 and 2100400 and heuristic@85 (`theaterAllocation` 0) on 2100474
  reach the final state hashes of those arms.
- Node v26.9.0.

```sh
S1=artifacts/ai-s1
for arm in v86-entry v85-entry; do for i in 0 1 2 3 4 5; do node scripts/ai-theater-rollout.mjs $S1/dev-even \
  --weights $S1/weights/$arm.json --out $S1/$arm/rows-$i.jsonl --shard $i/6 --starts 1 --through 6 \
  --save-dir $S1/$arm/saves --policy-label $arm & done; done; wait   # then merge summary-*.json into summary.json
node scripts/ai-logistics-study.mjs $S1/v86-entry/saves --baseline artifacts/ai-theater-rail-fix/standard/saves --gate v86-entry
node scripts/ai-fuel-study.mjs $S1/v86-entry/saves --baseline artifacts/ai-theater-rail-fix/standard/saves --gate v86-entry
node scripts/ai-theater-rollout.mjs --compare $S1/v86-entry artifacts/ai-theater-rail-fix/fixed
```

## S1.2 Arriving SP at an entry hex rail can carry forward

**Change.** A new rule query, `queryRailArrivalReach`, gives the stations SP arriving in a hex this turn could reach by
rail as the map stands: 13.6b lifts the entraining requirements for this turn's arrivals, so only the rail path (13.3e)
and the detraining hex (13.3c) count; phase and Rail Cap are not checked. The bot reads it as `railArrivalReach`. With the
weight `arrivalRailForward` above 0, arriving SP prefers a railroad entry hex only when a station it reaches lies at least
3 hexes nearer the front and 3 or more from the enemy (railStep's rule); otherwise the hex counts as off the railroad and
the nearest entry wins. Test: `tests/ai/sp-entry-rail.test.ts` (the recorded 2100474 position of Game Turn 3: the query
gives only 19,21 from 20,22 and eight stations from 25,12; the policy places the SP at 20,22 by default and at 25,12 with
the weight).

**Rollouts** (40 maps, attacker Game Turns 3–6 for the gates):

| Attacker | Rear SP left | SP no front unit can draw | Units unable to fuel, per game | Dry HQs | Rail Cap used |
|---|---:|---:|---:|---:|---:|
| heuristic@86 | 6.5 | 2.4 | 5.8 | 8% | 80% |
| heuristic@86 + `arrivalRailForward` | **4.8** | **1.3** | 5.0 (8%) | 5% | 82% |
| heuristic@85 + `arrivalRailForward` | 4.4 | see below | — | — | 74% |
| heuristic@85 | 4.9 | 1.5 | 6.3 (11%) | 6% | 70% |

Both gates pass for heuristic@86 with the weight against heuristic@85 on these positions (rear SP 4.8 ≤ 4.9, SP no front
unit can draw 1.3 ≤ 1.5, garrison stock 0, rail 100% of the SP railable forward).

| Per map, Game Turns 1–6 | Objective points | Defender steps lost | Attacker steps lost |
|---|---|---|---|
| heuristic@86 + weight − heuristic@86 | +0.40 [−0.09, +0.89] (4 maps up, 0 down) | +0.78 [−0.10, +1.65] | −0.23 [−0.62, +0.17] |
| heuristic@86 + weight − heuristic@85 | +3.20 [+1.58, +4.82] | +5.88 [+1.86, +9.89] | +0.70 [−1.88, +3.28] |
| heuristic@85 + weight − heuristic@85 | +0.07 [−0.08, +0.23] (1 up, 0 down) | +0.30 [−0.12, +0.72] | +0.00 [−0.07, +0.07] |

The weight changes 4 of the 40 maps with heuristic@86, the maps where S1.1 found SP placed at a cut entry hex. With it,
the S1.1 categories (`ai-supply-gap-study.mjs`) of heuristic@86 against heuristic@85 are −0.20 [−1.51, +1.10] SP no front
unit can draw and −0.13 [−2.53, +2.28] rear SP; `rail-cut` falls from 0.73 to 0.23 and `loaded-now` from 0.75 to 0.17.
The second item planned for S1.2, piles trucks loaded from and rail did not move, was mostly the same entry piles; it and
the third item (breaking down what remains) are not needed.

## S1.3 Rail capacity in the allocation: no effect, not implemented

The allocation was given a fifth supply source for a test: SP rail carries this step to a station whose draw (12.3a)
covers attack positions, sharing the Rail Cap left and the stock trucks load from, taken after the HQ and before trucks;
railStep would make the planned moves first. Planning with and without it at the attacker's first Movement decision of
Game Turns 1–6 on the 40 maps (`plan-potential.mjs` in this folder; the allocation side of the test is
[rail-source-allocation.patch](rail-source-allocation.patch); the policy passed it the legal SP rail moves to stations 3+
hexes from the enemy, not from an objective or a garrison stock, with each move's Rail Cap per Token and the Rail Cap
left from the rules' `rail.cost` and `rail.remaining` facts, under a weight `theaterRail`):

| Positions | Expected VP of the plan, per turn | Plans changed | Rail moves planned |
|---|---|---:|---:|
| 240 | 2.13 both | 0 | 0 |

Rail options were there (on 2100400, 9 at Game Turn 2 and 17 at Game Turn 3, three to six of them covering an
objective's attack positions), but no station's draw covered an attack position of a member that needed supply. The
reason is in the rules: a detrainable rail hex is a Supply Source (12.6a), so what is within draw range of a station is
already in trace, and SP railed there feed no attack position that trace does not. By the plan's rule (measure first; skip
the implementation when the measure shows nothing), the source is not kept; its code was removed. Sea capacity cannot be
measured: the promotion settings have no sea. P11.4 is split: rail is answered here; sea and the comparison of the
allocation with HQs and SP against the exhaustive optimum stay open (`bot-theater-allocation`).

## S1.4 Game Turns 4–8 (S1.4a)

From the registered batch's records (`artifacts/ai-theater-untraced-games/rows`, `ai-theater-realized.mjs`; the version
before the rail fix), attacker player turns:

| Game Turns 4–8 | Theater attacker | heuristic@85 attacker |
|---|---:|---:|
| Potential | 1.40 | 2.05 |
| Realized at Combat entry | 1.14 | 1.27 |
| Share | 0.82 | 0.62 |
| Units out of trace, per turn | 3.49 | 4.04 (difference −0.54 [−2.08, +0.99] per map) |
| Of these, no SP to eat | 2.21 | 2.31 (−0.10 [−1.51, +1.30]) |

The plan's rule: the share is not lower and the potential is lower, so the later turns gain no more because what could
be taken was taken; and units out of trace are not left unfed more often. S1.4b, planned supply for units out of trace
after their attack, is not done.

## S1.5 Next-step groups: not overvalued, no calibration

The plan was to estimate how often next-step groups turn into this-step attacks and multiply that into their value, so
that groups that rarely convert would stop taking main-effort slots. `ai-theater-hq-follow.mjs` now records each group's
planned chance (the THEATER debug line's `p`, the capture probability times the next-turn discount for a next-step group);
it was run again on the registered batch's games where the theater policy attacked (the plan is re-made with this build;
the actions are the recorded ones), and `next-step-calibration.py` in this folder compares the share held with the mean
planned chance, with a bootstrap over the 40 maps:

| Defended groups | Groups | Planned chance | Held | Held ÷ chance | Turned into a this-step attack next turn | Dropped next turn |
|---|---:|---:|---:|---:|---:|---:|
| This-step, Game Turns 1–3 (held at the turn's end) | 45 | 0.85 | 0.62 | 0.73 | — | — |
| Next-step, Game Turns 1–3 (held at the end of the next turn) | 82 | 0.52 | 0.50 | 0.96 | 0.20 | 0.59 |
| This-step, Game Turns 1–7 | 60 | 0.82 | 0.62 | 0.75 | — | — |
| Next-step, Game Turns 1–7 | 112 | 0.57 | 0.56 | 0.98 | 0.21 | 0.58 |

Next-step over this-step ratio: 1.30 [0.92, 1.74] (Game Turns 1–3), 1.31 [1.04, 1.69] (1–7). Next-step groups are held as
often as planned even though four in five do not become a this-step attack: their objectives fall to whatever group the
next turn's plan makes. Lowering their value would move the plan away from what happens. This-step groups are held less
often than planned (0.62 against 0.85): the capture model, fitted on heuristic@79-era attacks, is optimistic for them.
That is S3.3's recalibration of the capture model, not S1.5. By the plan's rule, S1.5 is recorded and not implemented.

## Limits

- Development rollouts on positions used for S1.1 and for these changes; the check positions are read once, in the S1
  check record.
- Rollouts of six attacker turns from Game Turn 1 states, not full games.
- The entry fix acts only where an entry hex's line out is cut, 4 of 40 maps here.

## Raw data

The ignored `artifacts/ai-s1/` of the `ai-truck-shuttle` worktree.
