# Fuel at Movement entry (plan P11.2 precheck)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

The [Combat check](../ai-theater-attack-check-2026-10-21/README.md) found that combat supply never blocks an attack at
the Combat segment; what limits attacks is the strength placed adjacent during Movement. Before modelling rail and
truck inflow (P11.2), this run asks whether supply keeps that strength from moving.

## What was run

- Inputs: the 48 Western Europe Axis-attack games of the [theater survey](../ai-theater-survey-2026-10-21/README.md).
- Engine: `dist` built with `npm run build` from `cc0c68f`; Node v26.9.0. Scripts as committed with this record:
  `scripts/ai-theater-fuel-check.mjs` (SHA-256 `a369f9e7…`) and its entry helper in `scripts/ai-theater-supply.mjs`.
- Command, about 4 min:

```sh
node scripts/ai-theater-fuel-check.mjs dist artifacts/ai-theater-fuel-check/fuel-western.json artifacts/ai-position-confirmation/attack-temperate
```

- Output: `artifacts/ai-theater-fuel-check/fuel-western.json` (SHA-256 `ac26baeb…`, not committed);
  [summary.json](summary.json) holds the totals and the per-Game-Turn counts.

## Instrument

At every Movement segment entry (the initial state, which starts in the Axis Game Turn 1 Movement segment, and every
later entry, rebuilt from lifecycle transitions when an `ADVANCE_SEQUENCE` passes through it), for each on-map combat
unit of the phasing player not in strategic mode:

- fuel status, for units that need fuel: already fueled, payable now (its own fuel option, or covered by an HQ's
  option), or stranded (no option at all);
- whether the rule movement range, with fuel assumed paid, reaches the objective or a hex adjacent to an objective the
  player does not hold. Counts are in steps.

Every probe asserts the serialized state is unchanged; every game must reach its saved final hash.

## Results

All 48 games matched their final hash; 768 entries, none unavailable.

| Game Turn | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Axis: stranded share of units needing fuel | 0% | 4% | 7% | 12% | 12% | 14% | 12% | 14% |
| Axis: stranded share of steps that could reach an objective | 0% | 5% | 5% | 8% | 9% | 9% | 9% | 7% |
| Allied: stranded share of units needing fuel | 3% | 10% | 22% | 33% | 36% | 39% | 41% | 40% |
| Allied: stranded share of steps that could reach an objective | 2% | 8% | 14% | 24% | 16% | 22% | 21% | 19% |

Totals: Axis 1,296 stranded of 13,928 unit-entries needing fuel, 946 of 13,424 reaching steps; Allied 1,374 of 5,236
and 590 of 3,564.

## Conclusions

- Supply does bind during Movement: from Game Turn 2 a growing share of motorized units have no way to pay fuel. For
  the attacker it is 5–9% of the strength that could reach an objective; for the defender 14–24% from Game Turn 3.
- Together with the Combat check, the supply limit in these games is fuel for moving to the objective, not combat supply
  at the objective. P11.2's inflow model should cover fuel delivery as well as combat supply.

## Limits

- Payable is judged per unit: two units counted payable may draw on the same dump and not both be paid, so stranded is a
  lower bound on fuel shortage.
- A stranded unit might not have moved even if fueled; reaching an objective's neighborhood is not an attack or a
  capture.
- One policy (heuristic@85) self-play, one map size, Western Europe Axis attacks only.
