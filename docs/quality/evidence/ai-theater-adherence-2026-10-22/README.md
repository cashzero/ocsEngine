# Does the theater allocation change what the attacker does (plan P11.8)

Boundary: offline replay of existing headless bot-against-bot games; no new game was played. This record changes no row
of `docs/quality/03-product-operation-verification-plan.md`. Plan: [P11.8](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md#策略上層). The user's acceptance for P11.8
(2026-10-22): 「在西歐對局中觀測是否有幫助」.

## Question

The [observation batch](../ai-theater-allocation-games-2026-10-21/README.md) (80 Western Europe Axis-attack games,
2100000–2100079) did not establish help, and the attacker's Game Turn 1–3 realized share did not move. This replay asks
why: how different the theater policy's plan is from the standard's, and whether the plan is carried out.

## Method

Source `98fa863` (`src` unchanged since the batch's `2a2f749`), `dist` rebuilt from it, Node v26.9.0.
`scripts/ai-theater-adherence.mjs` replays each game. In each attacker player turn, at the attacker's first Movement
segment decision, it lets both the theater policy (`theater-weights.json` of the batch) and the standard heuristic plan
the step from that state. A plan is the units whose target is ASSAULT or CAPTURE on an objective the attacker does not
hold, grouped by objective. A theater group counts as from the allocation when its objective is in the policy's THEATER
debug line; the rest are the usual efforts that fill the slots. Each plan is checked against what the policy that
actually moved did. The other policy's plan is a counterfactual.

```sh
for i in $(seq 0 11); do node scripts/ai-theater-adherence.mjs artifacts/ai-theater-allocation-games/attack-western --weights docs/quality/evidence/ai-theater-allocation-games-2026-10-21/theater-weights.json --out artifacts/ai-theater-adherence/shard-$i.jsonl --shard $i/12 & done; wait
node scripts/ai-theater-adherence.mjs --summarize artifacts/ai-theater-adherence/shard-*.jsonl
```

All 80 games reached their recorded final state hash; all 640 Combat segment entries were rebuilt; planning left every
state unchanged. Rows SHA-256 (shards concatenated in name order) `b8a00b481927…`, in `artifacts/ai-theater-adherence/`.

## Results

| Measure | Value |
|---|---:|
| Attacker player turns | 640 |
| Turns whose two plans target the same objectives | 638 |
| Turns whose two plans also have the same group sizes | 543 |
| Theater-plan groups from the allocation | 135 of 2,135 |
| Game Turn 1–3 turns with at least one allocation group | 50 of 240 |

| Mover | Game Turns | Theater groups | From the allocation | Turns with one | Allocation: defended attacked | Allocation: defended held at end | Allocation: empty held at end | Other own groups: defended held at end |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| theater | 1–3 | 487 | 35 | 26 of 120 | 0.79 (33) | 0.67 (33) | 1.00 (2) | 0.03 (452) |
| theater | 4–8 | 576 | 36 | 35 of 200 | 0.71 (17) | 0.59 (17) | 1.00 (19) | 0.08 (533) |
| standard | 1–3 | 482 | 32 | 24 of 120 | 0.87 (30) | 0.70 (30) | 1.00 (2) | 0.03 (450) |
| standard | 4–8 | 590 | 32 | 27 of 200 | 0.59 (17) | 0.71 (17) | 1.00 (15) | 0.05 (546) |

Counts in parentheses are groups. In the standard rows the allocation groups are counterfactual: what the standard did
on the objectives the allocation would have picked.

| Mover | Game Turns | Plan | Defended: members in place at Combat | Defended: attacked | Planned VP held at end |
|---|---|---|---:|---:|---:|
| theater | 1–3 | theater | 0.12 | 0.17 | 0.07 |
| theater | 1–3 | standard (counterfactual) | 0.11 | 0.17 | 0.07 |
| standard | 1–3 | standard | 0.14 | 0.18 | 0.07 |
| theater | 4–8 | theater | 0.22 | 0.24 | 0.11 |
| standard | 4–8 | standard | 0.22 | 0.23 | 0.09 |

## Conclusions

- The theater weight barely changes the attacker's plan. Only 6% of the theater plan's groups come from the allocation;
  the rest are dropped below a capture probability of 0.25 and refilled by the usual efforts, which pick the same
  objectives as the standard. In 638 of 640 turns both plans target the same objectives.
- The allocation keeps only objectives that can be reached and attacked well in one Movement segment, and those are the
  ones the standard takes anyway: on them the standard, without the weight, attacks 0.87 and holds 0.70 of the defended
  ones in Game Turns 1–3, against 0.79 and 0.67 for the theater policy.
- The Game Turn 1–3 gap lies in the other groups. Their members are seldom beside the objective at Combat (about 0.1),
  and they hold 0.03 of their defended objectives. Neither policy's plan closes it, because they are the same plan.
- So the batch's null result says this 1-turn allocation is nearly inactive. It does not test whether planning by
  theater helps: no objective that needs more than one turn of build-up is planned by it.

## Limits

The plan is rebuilt at the first Movement decision from a fresh policy memory, as the bot plans each step; later
decisions of the step are not replayed. Members in place count only the end of Movement, not overruns or Exploitation.
The 0.25 threshold and the 1-turn window are the frozen candidate's; other settings were not tried.
