# Theater partition survey (plan P11.0)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## What was run

- Inputs: the 48 Western Europe Axis-attack games of the [P7 confirmation](../ai-position-confirmation-2026-10-19/README.md)
  (`artifacts/ai-position-confirmation/attack-temperate`, match numbers 1500000–1500047; their row hashes are in that
  run's manifest). Map 32×24, six divisions per side.
- Engine: `dist` built with `npm run build` from `cc0c68f`; Node v26.9.0. Scripts as committed with this record:
  `scripts/ai-theater-supply.mjs` (SHA-256 `7dafe604…`), `scripts/ai-theater-survey.mjs` (`4241a872…`).
- Command, 46 s:

```sh
node scripts/ai-theater-survey.mjs dist artifacts/ai-theater-survey/survey.json artifacts/ai-position-confirmation/attack-temperate
```

- Every recorded action up to the start of Game Turn 3 was replayed through the rule engine and accepted (11,942
  actions). Full per-game output: `artifacts/ai-theater-survey/survey.json` (SHA-256 `24c5a56c…`, not committed);
  [summary.json](summary.json) is its summary.

## Partition rule

For each player, a breadth-first rail tree starts from the rail hexes within one hex of that player's map-edge supply
sources (neighbors in hex-id order). Each configured objective is anchored to its nearest rail hex. Two objectives share
a theater when their tree paths split fewer than 6 rail hexes before the nearer objective; theaters are the connected
groups. The partition uses the map and the player only, not control, so it does not change during a game.

## Results

| Fact | Observed |
|---|---|
| Rail networks per map | 1 in all 48 maps; median 110 rail hexes of 768, median 10 junctions |
| Objectives off the rail | 0 of 220 (Axis view); every objective has a rail route from the Axis entry, median depth 24 rail hexes |
| Map-edge roots on the rail | Axis 4–8 per map, Allied 4–6 |
| Axis theaters per map (split 6) | 1: 29, 2: 16, 3: 2, 4: 1 |
| Allied theaters per map (split 6) | 1: 34, 2: 10, 3: 4 |
| Axis theaters with split 4 / 8 | 1: 26 / 30, 2: 17 / 17, 3: 4 / 1, 4: 1 / 0 |
| Allied theaters with split 4 / 8 | 1: 22 / 41, 2: 22 / 6, 3: 2 / 1, 4: 2 / 0 |
| Theaters changed by Game Turn 3 | 0 for both players |
| Objectives per Axis theater | 1: 19, 2: 9, 3: 11, 4: 17, 5: 10, 6: 3, 7: 2 theaters |

## Conclusions

- On these maps all objectives lie on one rail network. For the attacker, about 60% of maps form a single theater with
  objectives in series along one line; about 40% have two or more. Theater partition separates objectives on fewer than
  half of the maps; allocation among objectives within a theater applies to all of them.
- The Axis count is insensitive to the split threshold between 4 and 8 rail hexes. The Allied count is sensitive, so a
  defender-side partition needs its own check before use.

## Limits

One map size, Western Europe only, one engagement type (Axis attacks), the P7 generator settings. The partition is a
rule of this plan, not a rule of the game; it says nothing yet about supply capacity or allocation.
