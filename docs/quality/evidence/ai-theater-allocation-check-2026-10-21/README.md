# Allocation search against enumeration (plan P11.4)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## What was run

- Inputs: the 48 Western Europe Axis-attack games of the [theater survey](../ai-theater-survey-2026-10-21/README.md);
  the frozen [capture model](../ai-theater-capture-model-2026-10-21/model.json).
- Engine: `dist` built from `cc0c68f`; Node v26.9.0. Scripts as committed with this record:
  `scripts/ai-theater-allocation.mjs` (SHA-256 `f6e2c1c2…`), `scripts/ai-theater-allocation-check.mjs` (`3ac73ecd…`).
- Command, 4 min 40 s:

```sh
node scripts/ai-theater-allocation-check.mjs dist docs/quality/evidence/ai-theater-capture-model-2026-10-21/model.json artifacts/ai-theater-allocation-check/allocation-western.json 7 artifacts/ai-position-confirmation/attack-temperate
```

- Output: `artifacts/ai-theater-allocation-check/allocation-western.json` (SHA-256 `2a4fa0f6…`, not committed);
  [summary.json](summary.json).

## Instrument

`allocationProblem` projects the state to the player's Movement segment (nothing moved, this phase's fuel cleared).
Allocatable units are the player's combat units with a combat strength, not in strategic mode and not standing on an
objective the player holds (garrisons stay). Each unit's fuel status comes from the engine's fuel options (needed and
payable, needed and stranded, or not needed); its reach is the rule movement range with fuel paid, or its own hex when
stranded. A unit can be sent against an objective the player does not hold if it can enter it when empty, or reach an
adjacent hex not held by the enemy from which its combat supply can be paid on its own.

The value of a group sent to a defended objective is its points times the frozen capture probability, computed from
the group placed on its best adjacent hexes: column (odds with defenders paying), DRM with the highest-rated unit
leading, whether the defenders can pay, hedgehog and line, all from the rules' odds calculation. An enterable empty
objective is worth its points (every objective gained without an attack in P5 and P7 was held at turn end). Movers that
need fuel must be fueled together from the dumps' Tokens (HQ or formation options covering two or more movers first,
then one Token per remaining mover). The final allocation settles each group's combat supply jointly; a group that
cannot pay together is worth 0.

`allocate` assigns units greedily by marginal expected VP, then moves pairs of units to a defended objective, single
units and removals until none improves. `exhaustive` enumerates every assignment of the given units.

The check takes the phasing player's first Movement state of Game Turns 2–7 in each game, runs the full search, and
compares `allocate` and `exhaustive` on the 7 usable units with the most steps. Every call asserts the serialized state
is unchanged.

During development on three of the games, greedy plus single moves reached the optimum in 17 of 29 cases with value
(mean gap 16%); adding pair moves raised it to 24 of 29 (mean gap 2.3%). Checking each unit's combat supply on its own
during the search, with the joint settlement on the final groups, cut the 90th-percentile full search from 20 s to
0.37 s without changing any result. The run below uses that final version.

## Results

| Check | Observed |
|---|---|
| Cases (player turns) | 576: Axis 288, Allied 288; mean 20.3 allocatable units, 2.4 objectives not held |
| Subproblems with value | 412 (Axis 273, Allied 139) |
| Search equal to the optimum | 346 of 412 (84%; Axis 224 of 273, Allied 122 of 139) |
| Relative gap, subproblems with value | mean 3.0%, 90%: 5.1%, max 48% |
| Expected VP lost to the search | 5.84 of 425.98 (1.4%) |
| Final groups that could not pay jointly | 0 |
| Full search time | median 51 ms, 90%: 282 ms, max 782 ms |

## Conclusions

- On subproblems small enough to enumerate, the search loses 1.4% of the optimal expected VP and is optimal in 84% of
  them; it is fast enough to run at every player turn of a recorded game.
- No final group failed the joint combat-supply settlement, consistent with the Combat-entry check.

## Limits

- The gap on the full problem (about 20 units) is not measured; enumeration is only feasible for 7 units.
- Placement ignores stacking limits and other units' moves; reach is each unit's own range from the start, with no
  ZOC change from friendly moves. The value is an estimate of what an allocation could take this turn, not a legal plan.
- One policy family, Western Europe Axis attacks only.
