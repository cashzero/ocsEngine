# Why theater groups do not reach their objective (plan P11.8 follow-up)

Boundary: offline replay of the existing two-step observation games (2100100–2100179); no new game was played. This
record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). The user asked (2026-10-30) to improve
movement execution; this record finds where units planned beside a defended objective this step are lost.

## Correction of the two-step record

The [two-step record](../ai-theater-two-step-games-2026-10-22/README.md) says 31% of the units the allocation places
beside a defended objective are there at Combat (16% when the standard moves). Its groups were every unit with an
ASSAULT or CAPTURE target on the objective. `planTargets` also gives far units a CAPTURE target on the same objective
for a later step, so those groups mixed in units the allocation never sent this step. Counting only the policy's own
group (its effort's units, `notes.effort` and `notes.secondary`), Game Turns 1–3 with the two-step policy moving:

| Defended this-step allocation groups | Groups | Units per group | Members in place at Combat (mean per group) | All members in place | Attacked | Held at end |
|---|---:|---:|---:|---:|---:|---:|
| Two-step policy moving | 99 | 2.98 | 0.40 | 0.27 | 0.41 | 0.32 |
| Standard moving (counterfactual groups) | 91 | 2.85 | 0.18 | 0.03 | 0.33 | 0.30 |

Per unit, 145 of the 295 members (49%) are beside the objective at Combat.

## Method

Source `7f31c3f`, `dist` built from it, Node v26.9.0.

```sh
B=artifacts/ai-theater-two-step-games W=docs/quality/evidence/ai-theater-two-step-games-2026-10-22/theater-weights.json
for i in $(seq 0 11); do node scripts/ai-theater-adherence.mjs $B/attack-western --weights $W --out $B/execution/shard-$i.jsonl --shard $i/12 --execution & done; wait
for i in 1 3 5 7 9 11; do node scripts/ai-theater-move-terms.mjs $B/attack-western --weights $W --out $B/move-terms/shard-$i.jsonl --shard $i/12 --turns 3 & done; wait
```

`ai-theater-adherence.mjs --execution` follows each member of the policy's own this-step defended groups through its
Movement segment: whether, when it began to move, the rules' range (with the stack it moved in) held a hex beside the
objective, where it stopped, why it did not move, and where it stands at Combat. `ai-theater-move-terms.mjs` replays the
40 games the two-step policy attacks in and lets the policy decide every attacker Movement decision of Game Turns 1–3
on the recorded state with its step memory, as the seat runner does: all 7,990 decisions equal the recorded actions.
When it moves a member of a this-step group, it records the stay score, the chosen destination's terms, the best
destination beside the objective with its terms, and what the friendly-supply gate (`keepsFriendlySupply`) said about
each destination beside the objective it checked. Every game reached its saved final hash.

## Results

Moves of members of this-step defended groups, Game Turns 1–3, two-step policy moving (310 moves):

| Outcome of the move | Moves | Share |
|---|---:|---:|
| Stopped beside the objective | 140 | 0.45 |
| Every destination beside it that was checked was refused by the friendly-supply gate | 77 | 0.25 |
| No destination beside it reachable at that moment (most changed from Move to Combat Mode first, lowering MA) | 32 | 0.10 |
| Beside it was reachable but not among the policy's move candidates (about 257 scored) | 23 | 0.07 |
| Another destination scored higher | 23 | 0.07 |
| Beside it was not better than staying (overstack) | 15 | 0.05 |

- All 77 refusals have `supply.relocationMoverHasTrace` false and a trace and feed loss: the hex beside the objective
  is outside the mover's trace supply and no SP is promised to feed it there. Each of those destinations also carries
  the out-of-supply term (−60).
- Where another destination scored higher, the mean difference (chosen minus beside) is out-of-supply +57, exposure
  +21, progress −30 and assault-position −20: again mostly supply.

## Conclusions

- Supply is the largest loss: about a third of the moves (25% refused by the gate, most of the 7% outscored) do not
  stop beside the objective because that hex is outside trace supply when the unit moves. The plan's lead is the
  objective and HQs follow it, but the assault hexes are still out of trace.
- About 10% cannot reach because the unit changes mode before it moves; 7% are lost to the move candidate list; 5% to
  stacking.

## Limits

Game Turns 1–3 only, the two-step policy moving, 40 games. The gate's facts describe the state when the unit moves
(HQs move before combat units). The candidate-list loss counts moves where the rules' range held a hex beside the
objective that the policy did not score.
