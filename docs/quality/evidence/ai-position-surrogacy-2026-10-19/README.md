# Position metrics as surrogates across policy variants (plan P8)

Boundary: new headless bot-against-bot games of weight-perturbed variants and offline analysis. No policy change to
the standard; changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md). The user asked to run the most promising of the
assessed methods (2026-10-19); trial-level surrogacy decides whether position metrics can serve as a reward.

## Registration

Committed before any game was played: [registration.json](registration.json) (variants with weight values and file
SHA-256, commands, power estimate, analysis command, questions, script SHA-256).

- Variants: 24, each changing one heuristic@85 weight to half or double: `capture`, `crowding`, `contactBad`,
  `outOfSupply`, `attackThreshold`, `combatSupply`, `assaultRatio`, `garrisonThreatened`, `holdRatio`,
  `progressObjective`, `defenderLoss`, `hqWithArmy`.
- Games: each variant against the standard in Axis attacks, seat-swapped pairs on the same 8 seeds (match numbers
  1600000–1600007 temperate, 1600100–1600107 eastern, never used before): 384 games. A pair's value is the mean over its
  two games from the variant's side, so map and seat effects cancel.
- Surrogates: at the first row of Game Turn 4 (primary; 3 and 5 secondary), the final-margin predictions of the P6 models
  M0 (VP), M1 (+ steps, out of trace) and M2 (+ objective reach and risk), fitted on the P5 record only, from the
  variant's side; and single metric differences.
- Power: per-pair SD about 4 VP from existing seat-swapped attack batches, spread of variant means beyond noise about
  2.6 VP; 8 pairs give a variant effect SE about 1.4 VP. With 24 variants a true trial-level R² of 0.5 is detectable
  (attenuated r about 0.58, interval about [0.18, 0.84]); 0.25 is borderline.

| Id | Question | Pass |
|---|---|---|
| Q0 | Variants differ in final VP effect beyond noise | Permutation p of the one-way F test below 0.05 |
| Q1 | The Game Turn 4 M2 surrogate predicts variant effects on the final margin | 95% interval of trial-level R² (variants resampled) with lower bound above 0.05 |
| Q2 | M2 beats the Game Turn 4 VP margin (M0) as surrogate | 95% interval of the R² difference above 0 |

Secondary surrogates are reported without a pass rule. If Q0 fails, Q1 and Q2 are reported but not interpreted.

## Results

Not yet run.
