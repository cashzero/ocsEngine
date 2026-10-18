# Fix: fuel payments took the SP a cut-off unit needed to recover its internal stocks

Boundary: rules-layer fact `supply.rationCommitmentsPreserved` for optional supply spending (fuel, hedgehog), its rules test,
and headless bot-against-bot games through the Gameplay Engine. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`.

## Defect (error item E2, [policy-errors](../../../ai/policy-errors.md))

Recorded meeting game 1300000 (`artifacts/ai-assault/v84-development`, v79 self-play), Allied Movement Segment of turn 3:
an Axis move (action 194) cut the Allied anti-tank unit at 20,3 off its trace. Its internal stocks were not full, and its
required recovery in the coming Supply Phase (12.10e) would draw the last Token it could reach,
`independent-supply-2#load24#load220`. Because the required recovery is applied before the ration plan, the unit was not a
ration consumer, so the ration check counted 0 committed units and let action 231 pay another unit's fuel from that Token.
The anti-tank unit then neither recovered nor ate and lost a step to attrition at the end of the segment (action 240).

## Fix

`src/rules/supply/ration-budget.ts`: `requiredRecoveryOutcome` returns the internal stocks level each required recovery
reaches; for a fuel or hedgehog payment, `rationBudgetFacts` reports `supply.recoveryLoweredUnits`, the units without trace
whose recovered level would fall, and `supply.rationCommitmentsPreserved` is false when any does. The bot already refuses
fuel payments that do not preserve the commitments, so no policy change was needed.

## Verification

- `tests/rules/ration-recovery-commitment.test.ts` with the recorded position (`tests/rules/fixtures/ration-recovery-1300000.state.json.gz`):
  the recorded payment now reports `recoveryLoweredUnits` 1 and is not preserved; another fuel payment in the same state stays
  preserved. Full suite 801 passed, 8 skipped; typecheck clean.
- Games: the 32 development games of heuristic@85 against frozen heuristic@79 (seeds 1300000–1300307, 32×24, six divisions,
  eight turns, no on-map air), on the engine before (`artifacts/ai-promotion/frozen-v85-development`) and after the fix
  (`artifacts/ai-continue/ration-fix-games`), with `node scripts/ai-supply-study.mjs <dir>`. Per game, both sides:

  | | Before | After |
  |---|---|---|
  | Attrition losses whose ration was taken by a fuel payment of the same side | 4.53 | 2.00 |
  | All attrition losses | 13.88 | 12.28 |
  | Steps lost | 37.59 | 35.94 |

  All 32 games FINISHED with matching replays. The games are not paired by dice (the fix changes play), so the attrition
  and step totals are indications, not tests.
- The remaining cases inspected are shortages: the ration plan cannot feed every unit without trace and admits them by
  priority (HQ, combat strength); a payment may take SP a unit outside the plan could have eaten (game 1300004, Axis
  f5-combat-1, action 439). That is the priority rule under a shortage, not the defect fixed here.

## Raw data

The ignored `artifacts/ai-continue/ration-fix-games` and `artifacts/ai-promotion/frozen-v85-development` of the
`ai-truck-shuttle` worktree.
