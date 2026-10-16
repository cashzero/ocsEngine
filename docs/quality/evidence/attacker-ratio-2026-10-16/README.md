# Attacker force ratio 1.5 against 2 (attack games)

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record supports the
`ATTACKER_FORCE_RATIO` decision in `docs/oob/random-oob.md`; it changes no row of
`docs/quality/03-product-operation-verification-plan.md` and does not close `attack-balance` in
`docs/quality/05-todo-inventory.md`.

## Inputs

- Ratio 1.5: the "Trucks by income" games of [truck-income-2026-10-16](../truck-income-2026-10-16/README.md) (`4dd50c9`).
- Ratio 2: `4dd50c9` with `ATTACKER_FORCE_RATIO = 2`, built before `4336a1d` (truck placement by any dump), so its games
  use the earlier truck placement.
- Both sides `heuristic@78`; the same command and seeds as truck-income-2026-10-16 (AXIS_ATTACKS, 32×24, six divisions per
  side before the ratio, eight turns, no aircraft, TEMPERATE_INLAND 1300200–1300207 and EASTERN_EUROPE 1300300–1300307,
  `--swap`): 16 games per ratio. Per-game figures come from each batch's `summary.json`.

## Expected

All games FINISHED with a matching replay hash. No VP target was registered: the run checks whether the bot turns a
larger attacker into VP before the ratio is read off bot games.

## Observed

16/16 FINISHED, replay ok, 0 failed (319 s and 265 s per group).

| Attacker (Axis), per game | Ratio 1.5 | Ratio 2 |
|---|---|---|
| Combat units at the end | 25.6 | 34.2 |
| VP | 4.4 | 3.6 |
| Objectives captured | 1.75 | 1.38 |
| Steps killed / lost | 17.5 / 11.5 | 21.0 / 11.2 |
| Combats declared | 7.5 | 8.8 |
| Wins | 6 / 16 | 4 / 16 |
| Truck SP loaded per point, from Turn 3 | 0.94 | 1.03 |
| Rear SP left after moving | 6.2 | 11.4 |
| SP within 4 hexes of the enemy | 7.2 | 10.0 |

The larger attacker kills more but scores no more VP, and declares about the same few combats a game while SP stands near
the front, so the bot's offence, not its strength or its supply, limits the attacker's VP here (inference from these
figures, not a traced cause). The ratio was set to 2 by the user's decision, not from these results.

JSON: [ratio-2-logistics.json](ratio-2-logistics.json). Saves: the ignored `artifacts/ai-logistics/truck-income/ratio-2/`
of the `ai-truck-shuttle` worktree.
