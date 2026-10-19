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

## Run

Commands exactly as registered, scripts of `b885e4d`, dist built from src as of `eee03e2`. All 384 games finished and
passed the replay check (88 min, 3 runs of 4 processes at a time); recording 384 games, 0 skipped (26 min); analysis as
registered. Per-variant row and summary hashes: [manifest.json](manifest.json). Effects, surrogacy and intervals:
[results.json](results.json).

## Results

| Id | Result | Verdict |
|---|---|---|
| Q0 | One-way F 1.77, permutation p 0.022; variance of variant means 2.14, mean squared SE 1.21, between-variant variance about 0.93 | Pass |
| Q1 | Game Turn 4 M2 surrogate: trial-level R² 0.517 [0.188, 0.763] (r +0.719) | Pass |
| Q2 | Game Turn 4 M2 over M0: R² difference +0.326 [−0.012, +0.594] | Fail |

Secondary, trial-level R² [95%]:

| Surrogate | Game Turn 3 | 4 | 5 |
|---|---|---|---|
| M0 VP margin | 0.260 [0.014, 0.621] | 0.191 [0.002, 0.559] | 0.261 [0.002, 0.787] |
| M1 + steps, out of trace | 0.121 [0.001, 0.526] | 0.485 [0.223, 0.732] | 0.625 [0.301, 0.859] |
| M2 + objective reach and risk | 0.354 [0.144, 0.629] | 0.517 [0.188, 0.763] | 0.648 [0.331, 0.851] |
| Steps difference | 0.193 | 0.262 [0.118, 0.474] | 0.483 [0.258, 0.697] |
| Out-of-trace difference | 0.000 | 0.315 [0.025, 0.644] | 0.229 |
| `objectiveReachColumn` difference | 0.021 | 0.033 | 0.002 |
| `objectiveVpAtRisk` difference | 0.073 | 0.005 | 0.000 |
| `stacksExposedAllocated` difference | 0.078 | 0.025 | 0.001 |
| `hqsInReach` difference (r) | −0.368 | −0.406 | −0.596 |

Leaving one variant out, Game Turn 4 R² ranges 0.41–0.56 (M1), 0.40–0.57 (M2) and 0.11–0.29 (M0). Three variants
(`capture` halved and doubled, `outOfSupply` doubled) had no Game Turn 4 surrogate difference; both `capture` variants
also had no final difference, so about 21 variants changed play. Largest final effects from the variant's side (8 pairs
each, SE about 1.1 VP): `progressObjective` doubled +4.00, `crowding` doubled +2.62 (out-of-trace difference +5.88),
`contactBad` halved and `hqWithArmy` doubled +1.62, `garrisonThreatened` halved −3.00, `defenderLoss` doubled −1.75.

## Conclusions

- Variants of single weights do change the final margin (Q0), but the real spread is small (SD about 1 VP), below the
  2.6 VP assumed in the power estimate; with an SE about 1.1 VP per variant, the variant effects are measured with
  reliability about 0.44, which lowers every observed trial-level R².
- A final-margin model's prediction at Game Turn 4 tracks variant effects on the final margin (Q1, R² about 0.5): a
  variant's early effect on the predicted margin is a usable surrogate across policy changes of different directions.
- The surrogacy comes mostly from steps and out-of-trace units (M1 0.485); objective reach and risk add about 0.03, and
  M2 does not beat the Game Turn 4 VP margin with confidence (Q2). Single position metrics have near-zero trial-level
  R²: they predict events within a game, but a policy's effect on them does not track its effect on VP.
- Variants that leave the opponent's HQs more exposed did worse (negative r), a lead, not a tested mechanism.
- The large single-variant effects are leads for policy changes, not promotions; they need the promotion process.

## Limits

One engagement (Axis attacks), single-weight variants against one standard, 8 pairs per variant; the M models were
fitted on v79-family games. Attenuation by measurement error is not corrected: with 24 variants a correction would be
unstable.
