# Truck points from supply income (attack logistics)

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record supports the
generator decision in `docs/oob/random-oob.md`; it changes no row of `docs/quality/03-product-operation-verification-plan.md`
and does not close `attack-balance` in `docs/quality/05-todo-inventory.md`.

## Inputs

- Baseline: `42300ae` (one five-point truck per three divisions, Rail Cap 0.75 per division), built in a detached worktree.
- Change: the commit that adds this folder (truck points = half the expected Supply Table income, one starting counter of
  half the points plus one-point arrivals; Rail Cap 0.6 per division; trucks of one nationality combine, 13.2c).
- Both sides `heuristic@78`; 32×24, six divisions (two armored) per side, eight turns, no aircraft; AXIS_ATTACKS on
  TEMPERATE_INLAND (seeds 1300200–1300207) and EASTERN_EUROPE (1300300–1300307), `--swap`: 16 games per build.

```sh
common="--matches 8 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE \
  --engagement AXIS_ATTACKS --allied heuristic --axis heuristic --swap"
node scripts/ai-match.mjs $common --start 1300200 --style TEMPERATE_INLAND --out <dir>/attack-temperate
node scripts/ai-match.mjs $common --start 1300300 --style EASTERN_EUROPE --out <dir>/attack-eastern
node scripts/ai-logistics-study.mjs <dir>/attack-temperate <dir>/attack-eastern --out <dir>/logistics
node scripts/ai-truck-trips.mjs <dist of that build> <dir>/attack-temperate <dir>/attack-eastern
```

## Expected

Every game FINISHED with a matching replay hash. With the change, the attacker's trucks run near capacity and SP is left
behind the front (rear SP after moving rises), while the attacker still moves supply forward.

## Observed

All 32 games FINISHED, replay ok, 0 failed (baseline 313 s and 279 s per group; change 238 s and 233 s).

| Attacker, from Game Turn 3 | Baseline | Trucks by income |
|---|---|---|
| Truck points on the map per Movement Segment | 14.9 | 4.9 |
| Loads per truck per segment | 0.56 | 1.05 |
| SP loaded per segment | 6.1 | 4.7 |
| SP loaded per truck point | 0.41 | 0.94 |
| Rail Cap used | 24% | 32% |
| Rear SP left after moving (≥ 6 hexes from the enemy) | 1.6 | 6.2 |
| SP within 4 hexes of the enemy | 9.8 | 7.2 |
| Attacker wins | 4 / 16 | 6 / 16 |

The defender's trucks went from 10.4 to 3.3 points per segment; its rear SP after moving rose from 4.9 to 11.4 and its SP
near the enemy fell from 5.6 to 3.5. Win counts over 16 games are not a balance measurement.

JSON: [base-logistics.json](base-logistics.json), [trucks-by-income-logistics.json](trucks-by-income-logistics.json).
Saves: the ignored `artifacts/ai-logistics/truck-income/` of the `ai-truck-shuttle` worktree.
