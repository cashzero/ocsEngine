# R10 Rule Engine Integration Report

Status: **REOPENED (2026-09-30)**. The completion claim below is disproven by
`docs/reports/rules-ui-audit-2026-09-30.md`: 28 of 30 OCS 4.3 conformance probes
(`scripts/audit/rules-conformance-probe.mjs`) fail on features the manifest marks
`IMPLEMENTED`. The original text is preserved as the historical evidence trail. The Rule Engine was rebuilt on 2026-10-01 (`ocs-rebuild-2026-10-01.md`); the probe now reports 35/35 conforming, but R10 stays IN PROGRESS because several features are PARTIAL or DEFERRED in `src/rules/manifest.ts`.

## Gate result (original, disproven)

The OCS 4.3 ground/logistics Rule Engine MVP is complete as a deterministic, headless package. It consumes the Foundation scenario model and exposes action families, bounded candidates, legality/explanations, immutable transitions/events, viewer projection, strict snapshots, and action replay. It has no Gameplay, UI, random-generation, AI, React, or browser dependency.

## Exercised scenario

The integration gate drives only public `GameAction` values through this sequence:

`setup -> Weather/First Player/Reinforcement -> Movement -> Supply -> Reaction -> Artillery Barrage -> Combat -> Retreat -> Advance -> Exploitation -> Clean Up -> second Player Turn -> turn end -> turn-limit completion`

The scenario proves:

- movement path cost, ZOC stop, stacking, usage, and Hex control;
- trace supply plus two separately reserved and committed supply expenditures;
- artillery declaration, resource decision, commit-point 2d6, and result closure;
- regular combat odds/AR calculation, resource decision, retreat, DG, advance, and control;
- exactly four rules-RNG draws and exactly two resource-consumption events;
- every successful action increments `GameState.revision` once and passes invariants;
- final state and ordered events are reproduced from the initial state and action log;
- canonical snapshot bytes and SHA-256 are identical after replay.

An additional regression proves that a defender with no legal retreat destination receives a non-empty forced step-loss decision instead of deadlocking.

## Persistence, candidate, and boundary proofs

- A live pending resource decision and active transaction survive strict canonical save/reload.
- Unknown top-level and nested snapshot fields are rejected.
- Action candidates are deterministic, de-duplicated, legality-filtered, and budget-bounded.
- Cache-enabled and cache-disabled query execution returns the same semantic value; disabling the cache retains no entries.
- Every executable `IMPLEMENTED` manifest row names existing test evidence.
- Every R0-R10 study output exists.
- `src/rules` is scanned for Gameplay, UI, generation, AI, React, and browser imports.
- Deferred rail/sea/air movement, advanced logistics, air, naval, optional rules, and game-specific victory tables remain explicit in the manifest rather than approximated.

## Automated evidence

- `tests/rules/rule-engine-integration.test.ts`
- `tests/rules/kernel-sequence-query.test.ts`
- `tests/rules/mode-stacking-zoc.test.ts`
- `tests/rules/movement.test.ts`
- `tests/rules/transaction-supply.test.ts`
- `tests/rules/combat.test.ts`
- `tests/rules/lifecycle.test.ts`
- `tests/rules/manifest.test.ts`
- `tests/dist-smoke.mjs`

Verified on 2026-08-30 with `npm run check`: TypeScript checking passed, 18 test files / 105 tests passed, declaration/JavaScript build passed, and the public-package smoke test passed. No percentage coverage threshold is configured; acceptance is manifest-, scenario-, invariant-, replay-, and boundary-based.
