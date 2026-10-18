# Advanced metric contract checks

Boundary: source inspection and three executable allocation checks against the frozen v81 engine. No new matches, replay batches, policy changes or predictive comparisons were completed in this run. The multi-outcome extraction and comparison remain unimplemented.

The inspected checkout is `787d631`. Source hashes and the frozen allocator module hash are recorded in [results.json](results.json). The historical input cohort remains the [80-game pilot inventory](../ai-vp-metrics-inventory-2026-10-18/inventory.json). This run does not add independent evidence about which indicator predicts improvement.

## Expected and observed

| Check | Expected | Observed |
|---|---|---|
| Two consumers each needing 8 RE ticks share one token | Each is individually affordable, but both together are infeasible | `groups: null`, `exhausted: false` |
| Two consumers each needing 4 RE ticks share one token | Group payment costs one token; individual rounding would cost two | One group containing both consumers, costing one token |
| A feasible one-consumer allocation with search limit zero | Unknown due to exhausted search, distinguishable from infeasibility | `groups: null`, `exhausted: true` |

All three assertions passed with Node.js. The command completed in approximately 0.73 seconds without errors. This timing is execution cost, not a performance comparison. Imports also confirmed `pieceHasTrace`, `dumpsReaching`, `isOnMapCombatUnit`, `reTicksOf`, `usageOf`, `afterRequiredRecovery` and `rationPlan` are callable in the frozen engine.

The source inspection establishes these contract constraints.

- `scripts/ai-match.mjs` counts `STEP_LOST` events and reports the opponent's count as `stepsKilled`. Loss causes need separate measurement.
- `ration-budget.ts` pays mandatory internal recovery before planning rations. Its allocation uses shared source capacities and grouped RE costs. The selected consumers follow the existing priority, so the witness is not a maximum-strength solution.
- `supply-phase.ts` assigns supply status before queuing attrition choices. Measurements taken after those choices can lose units from the sample.
- `fuel.ts` limits fuel options to the legal phase and actor. An empty query in a different phase does not diagnose absent fuel.
- `strength.ts` exposes hypothetical attack strength under stated mode and supply assumptions. It does not establish immediately executable combat readiness.

These findings determine the [current experiment contract](../../../ai/vp-metrics.md#四種結果與補給前置條件). That document owns the definitions and limitations. The work breakdown and open implementation remain in the roadmap and TODO inventory.

## Reproduce the allocation checks

From the repository root with the frozen historical artifacts present, run this Node.js module body using `node --input-type=module`.

```js
import assert from 'node:assert/strict';
import { assignRations } from './.claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/frozen-v81/dist/rules/supply/ration-budget.js';
import { eatOffMapCost } from './.claude/worktrees/ai-truck-shuttle/artifacts/ai-promotion/frozen-v81/dist/index.js';

const demands = ticks => [
  { id: 'a', ticks, sources: ['dump'] },
  { id: 'b', ticks, sources: ['dump'] },
];
const stock = [{ id: 'dump', tokens: 1 }];
assert.deepEqual(assignRations(demands(8), stock), { groups: null, exhausted: false });
const grouped = assignRations(demands(4), stock);
assert.equal(grouped.groups.length, 1);
assert.equal(grouped.groups[0].tokens, 1);
assert.equal(grouped.groups[0].pieceIds.length, 2);
assert.equal(eatOffMapCost(4) + eatOffMapCost(4), 2);
assert.deepEqual(assignRations(demands(8).slice(0, 1), stock, 0),
  { groups: null, exhausted: true });
```
