# One-turn transport inflow bound (plan P11.2)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md). The
[fuel precheck](../ai-theater-fuel-check-2026-10-21/README.md) of the same games motivated covering fuel as well as
combat supply; the bound below counts Tokens regardless of their use.

## What was run

- Inputs: the 48 Western Europe Axis-attack games of the [theater survey](../ai-theater-survey-2026-10-21/README.md).
- Engine: `dist` built with `npm run build` from `cc0c68f`; Node v26.9.0. Scripts as committed with this record:
  `scripts/ai-theater-supply.mjs` (SHA-256 `0f88b79d…`), `scripts/ai-theater-inflow-check.mjs` (`14c06c59…`).
- Command, 3 min 42 s:

```sh
node scripts/ai-theater-inflow-check.mjs dist artifacts/ai-theater-inflow-check/inflow-western.json artifacts/ai-position-confirmation/attack-temperate
```

- Output: `artifacts/ai-theater-inflow-check/inflow-western.json` (SHA-256 `e08409c1…`, not committed);
  [summary.json](summary.json) holds the counts below.

## Instrument

- Zone: each theater's front zone is the hexes within 3 of its objectives, a hex near several going to the nearest
  objective (`theaterZones`).
- Window: from the phasing player's Movement segment entry to the Combat segment entry of the same player turn
  (entries inside an `ADVANCE_SEQUENCE` rebuilt from lifecycle transitions).
- Actual inflow: the net change of the player's Tokens (dumps, and truck cargo at the truck's hex) in the zone, summed
  over the actions that leave the player's total Tokens unchanged; actions that spend, gain or lose Tokens (fuel,
  rations, recovery, capture) are left out. Negative nets count as zero.
- Bound, at the Movement entry (`inflowBound`): the smaller of the Tokens outside the zone and rail plus trucks. Rail is
  twice the Rail Cap quarters left (one quarter per Token, halved on all-multi-track routes). Trucks are those whose
  rule movement range touches the zone, each counting its cargo plus one full load per load-and-unload pair its MA
  pays for (unbounded when loading is free).

The first full run counted rail at one Token per quarter and found 3 windows above the bound, all Allied rail moves on
multi-track lines (32 Tokens for 16 quarters). The bound omitted the multi-track halving of rule 4.7b; it was corrected
to two Tokens per quarter and the run repeated. No other change was made between the runs.

## Results

| Check | Observed |
|---|---|
| Games replayed to the saved final hash | 48 of 48 |
| Theater windows | 1,083 (Axis 568, Allied 515); 8 Movement entries dropped because their Combat entry could not be rebuilt |
| Windows above the bound | **0** (acceptance) |
| Windows with inflow | 420 (Axis 202, Allied 218) |
| Actual over bound, windows with inflow | 10%: 0.03, median 0.36, 90%: 0.87, max 1.00 |
| Bound set by the Tokens outside / by transport | 1,011 / 72 windows |
| Tokens moved in / bound, all windows | 8,767 / 80,428 (Axis 5,020 / 58,717; Allied 3,747 / 21,711) |

## Conclusions

- The bound meets the P11.2 acceptance: transport never moved more into a theater's zone in one turn than it allows.
- It is loose: transport capacity binds in 72 of 1,083 windows; otherwise the Tokens outside the zone set it. Where
  inflow happened, the median window moved about a third of the bound. As an allocation input it is a ceiling, not a
  forecast of what will arrive.

## Limits

- The bound is per theater. Rail Cap and trucks are shared, so the bounds of two theaters cannot be added.
- Truck reach uses the movement range at the entry, not routes through loading points; the trip count ignores the MP
  spent driving, so it can only overstate.
- One policy (heuristic@85) self-play, one map size, Western Europe Axis attacks only.
