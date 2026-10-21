# Capture probability model (plan P11.3)

Boundary: offline replay of existing saves and model fitting. No new games, no policy call, no change under `src/`;
changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[P11](../../../roadmap/18-position-metrics-wbs.md); design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## Protocol

Rows, candidate models, model choice and acceptance were committed before any fit (commit "Theater supply P11.3: fix
the capture model protocol before fitting"):

- Row: an objective attacked by the phasing player in a player turn, described by its strongest declared regular
  attack (highest column, then highest DRM) through the rules' own facts (`explain`): column index (odds assuming every
  defender pays), DRM, whether the defender can pay combat supply, hedgehog level, combat line. Label: the attacker holds
  the objective when the player turn ends.
- Candidates: constant rate; capture rate per column shrunk toward the overall rate with two pseudo-rows; logistic on
  the column; logistic on all the conditions (standardized, L2 penalty 1 on slopes).
- Choice: lowest map-seed grouped ten-fold log loss on development rows; the chosen model is refitted on all of them
  and frozen ([model.json](model.json), key `frozen`).
- Acceptance: held-out Brier below the constant rate, with a map-seed resampled 95% interval excluding zero.

## What was run

- Development: the Western Europe Axis-attack folders of the [P5 record](../ai-position-metrics-p5-2026-10-19/manifest.json)
  (`ai-assault/defender-1330/{noeffort,v83}-temperate`, `ai-assault/v84-development/attack-temperate`,
  `ai-continue/ration-fix-games/attack-temperate`, `ai-promotion/frozen-{v81-development,v82r-independent,v85-development}/attack-temperate`):
  132 saves, 99 distinct trajectories (33 duplicates skipped), 33 map seeds, 765 attacked-objective rows.
- Retrospective: the 48 P7 Western Europe Axis-attack games, 298 rows, scored without refitting. These games were seen
  in earlier work and are not a prospective test.
- Engine: `dist` built from `cc0c68f`; Node v26.9.0, Python 3.14. Scripts as committed with this record:
  `scripts/ai-theater-capture-extract.mjs` (SHA-256 `eba7f3f3…`), `scripts/ai-theater-capture-model.py` (`2c027c2d…`).
  Every game replayed to its saved final hash.

```sh
node scripts/ai-theater-capture-extract.mjs dist artifacts/ai-theater-capture/p5-western.jsonl <the seven P5 folders>
node scripts/ai-theater-capture-extract.mjs dist artifacts/ai-theater-capture/p7-western.jsonl artifacts/ai-position-confirmation/attack-temperate
python3 scripts/ai-theater-capture-model.py artifacts/ai-theater-capture/p5-western.jsonl artifacts/ai-theater-capture/model.json --retrospective artifacts/ai-theater-capture/p7-western.jsonl
```

Row files (SHA-256 `5bb2489c…` P5, `d0077c3d…` P7) stay in `artifacts/`; extraction took 7 min 49 s and 3 min 58 s.

## Results

| Model | Grouped CV log loss | Grouped CV Brier | P7 log loss | P7 Brier |
|---|---:|---:|---:|---:|
| Constant (rate 0.359) | 0.655 | 0.231 | 0.614 | 0.211 |
| Rate per column | 0.433 | 0.138 | 0.396 | 0.125 |
| Logistic, column | 0.419 | 0.134 | 0.399 | 0.125 |
| **Logistic, all conditions (chosen)** | **0.340** | **0.106** | **0.342** | **0.104** |

- Chosen minus constant, held-out Brier: −0.125 [−0.149, −0.099] (acceptance met). Chosen minus the column-only
  logistic: −0.028 [−0.042, −0.014]; minus the per-column rate: −0.032 [−0.046, −0.018].
- Calibration of the chosen model by prediction quintile (mean predicted / observed): development 0.016/0.033,
  0.065/0.059, 0.207/0.209, 0.565/0.542, 0.947/0.954; P7 0.016/0.034, 0.047/0.033, 0.145/0.153, 0.399/0.333, 0.910/0.900.
- Frozen standardized slopes: column +1.93, DRM +1.21, defender can pay −0.21, hedgehog −0.56, CLOSE −0.42 and OPEN
  −0.41 against VERY_CLOSE; the VERY_OPEN and EXTREMELY_OPEN lines never occurred, so their slopes are zero.
- Objectives gained without a declared attack (entered empty or overrun) were still held at the end of the turn in 118
  of 118 development cases and 49 of 49 P7 cases.

## Conclusions

- The probability of holding an attacked objective at the end of the turn is predictable from the rules' combat facts
  and well calibrated on held-out seeds; the DRM, hedgehog and line add to the column.
- For allocation, an attack's capture probability uses the frozen model; an enterable empty objective counts as held.

## Limits

One policy family, Western Europe Axis attacks only. The label is end-of-turn control, not end-of-game control. Rows
are attacks the bot chose to make; attacks it declined are not in the data, so the model is conditional on attacking.
