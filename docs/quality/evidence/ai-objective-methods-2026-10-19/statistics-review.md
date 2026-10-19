# Independent statistical correctness review

Scope: read-only review of `scripts/ai-objective-study.py`, `scripts/ai-objective-replay.mjs`, frozen `contract.md` and `protocol.json`, with supporting inspection of the existing input validator, original recorder boundary, and engine combat-odds API. No statistical implementation authored by this reviewer. No engine replay restarted.

Reviewed source SHA256:

- Python runner: `5d83ca0ddfdb25c17a075ae86aa51b6995b2a179ddf6287b3437ab671e8e6af6`.
- JS extractor: `09876e10c2666124b3bcc5d3a3d0ad692b4f7a6ab9ceeaae97d4b64dcf41e0e2`.
- Contract: `7154092d61b8b62c2817812f102adcac5eae81dbedc5f8d12138a9473ba4f271`.
- Protocol: `d58f55bacf889981b7176455c2a6303f5d66f5e8460b5a04e78f773ca4f67301`.

## Finding

**MEDIUM — Equal-seed calibration bins change the population weighting.** `scripts/ai-objective-study.py:399-406`, together with `382-390`.

Headline equal-seed target scores average the complete target-row mean for each seed. Each row therefore has weight proportional to `1 / total_target_rows_in_its_seed`. Calibration selects a bin first and calls `weighted_mean` on that subset, giving each represented seed equal weight again, regardless of how much of that seed is inside the bin. It also reports pooled occupancy `len(cell) / len(rows)` for both weighting modes. Consequently, the equal-seed calibration table is not conditional calibration of the equal-seed population used for headline scores, and its event rates cannot generally be aggregated using its occupancy to recover the overall event rate.

Exact reproduction, using the reviewed module:

```python
import importlib.util
spec = importlib.util.spec_from_file_location('study', 'scripts/ai-objective-study.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
rows = []
for seed, n, hit in [(0, 10, 1), (1, 20, 18)]:
    for i in range(n):
        rows.append({'mapSeed': seed, 'y': int(seed == 0 and i < hit),
                     'points': 1, 'probabilities': {'M1': .15 if i < hit else .9}})
r = m.score_targets(rows, 'M1', 'equalSeed')
print(r['calibration'][2])
print(r['eventRate'])
print(sum(b['occupancy'] * b['eventRate'] for b in r['calibration'] if b['count']))
```

Observed for `[.1,.2)`: count `19`, occupancy `0.6333333333333333`, event rate `0.5`, bias `-0.35`, Brier `0.37249999999999994`. Under the complete equal-seed population, bin occupancy is `0.5`, event rate `0.1`, bias `0.05`, and Brier `0.0925`. The reported overall event rate is `0.05`, while occupancy-weighting the reported bin event rates gives `0.31666666666666665`.

Recommended correction: determine seed row counts from the complete scoring subset before binning. For equal-seed calibration, use row weights `1 / (number_of_seeds * complete_subset_rows_for_that_seed)`; occupancy is the sum of these weights in the bin, and each bin's event rate, mean probability, bias, and Brier is its weighted sum divided by that occupancy. Keep raw count and represented-seed count as descriptive fields. Empty-bin metrics remain null. Alternatively, report calibration explicitly as pooled only, without presenting it as equal-seed calibration. A reproduction covering unequal seed sizes and unequal bin occupancy should verify the fix.

This defect does not change fitted models, out-of-fold predictions, primary Brier differences, window VP scores, or paired intervals. Existing verified observations can be re-scored; no engine replay or model-specification change is necessary. It blocks a claim that the existing equal-seed calibration tables are correct; it does not block execution or interpretation of the primary model comparison. Parent has accepted the finding for correction.

## Other reviewed calculations

No other correctness or scope blocker found in these paths:

- `257-322`: stable Bernoulli negative log likelihood plus half the squared slopes, intercept excluded; gradient/Hessian implement lambda 1 on the sum-loss convention. Cholesky solve and subtractive Newton direction are consistent. Armijo backtracking uses the directional decrease and a small floating-point tolerance. Explicit gradient convergence is required and iteration/line-search failure aborts. The one-class M0 fallback is intentional and flagged (`326-338`).
- `221-243`, `326-370`: medians, means and scales use training rows only. Null-only columns use zero; constant columns map to zero. Every outer fold removes all target rows of the held-out map seed. Alias trajectories are deduplicated upstream using initial/final/action identity. All roles use the same pooled model and fixed outer predictions. Neither declarations nor labels enter the feature whitelist.
- `373-397`, `412-432`: un-clipped Brier, scoring-only clipped log loss, points-times-probability VP expectation, target VP errors, and window sums/MAE/signed bias are consistent with retained initially enemy-held target acquisition. Empty-target windows are retained with zero observed/expected acquisition. M0 is the stated training-rate baseline; zero is reported separately.
- `435-482`: bootstrap resamples complete seed clusters with multiplicity and uses paired M3-minus-M1 errors. Pooled estimates divide by resampled row count; equal-seed estimates average complete cluster means. The same is true for role subsets. No other field silently changes the equal-seed error estimand; raw counts, positive counts, represented-seed counts, and zero-target-window counts are descriptive counts. Intervals explicitly exclude refitting and model-selection uncertainty.
- Extractor `64-128`, `241-274`: fixed start-of-window features use current real units only; subsequent declarations remain audit fields. Snapshot/query immutability and per-action observer-disabled state/event equivalence are checked. The turn boundary matches `scripts/ai-position-record.mjs:41-81`, including the action that advances into the next turn.
- Extractor `131-171`, `174-217`, `220-282`; Python `90-218`: authoritative configured objective IDs and points, all-target coverage, linked control transitions, end holders, capture/recapture labels, both players' gross counts/VP, and signed endpoint reconciliation are checked. Save/action/trace identities, original eligible windows, aliases and full replay endpoints are checked. Current adjacent-formation odds are explicitly conditional; neither the contract nor output claims joint payability or a legal multi-action plan.

## Executed checks and acceptance limit

`python3 scripts/ai-objective-study.py --self-test` passed: signal Brier M1 `0.25`, M3 `0.0003198103340208376`; null M1 `0.2509665975765306`, M3 `0.2523561186105116`. These support implementation verification and are not empirical acceptance.

Independent central finite differences on a five-row, two-slope fit gave gradient approximately `[-2.91e-9, -8.06e-9, 4.00e-10]` at convergence; the optimizer reported infinity norm `8.03e-9` after four iterations.

The available real `extractor-smoke/observations.json` was passed through `validate_observations` with `smoke-worklist.json`: one trajectory, 13 windows, 78 configured-target observations, 38 primary enemy-held rows, 3 retained positives; 40 initially own-held observations. This verifies the available real artifact against its target/accounting boundary, not the full cohort.

The full empirical run was still executing when this review was written. This review does not claim its completion, full-cohort replay success, empirical model superiority, cross-policy qualification, full net VP prediction, all eight statistical families, or any product/UI gate. The frozen first per-target binary experiment and fixed-error interval scope are appropriate to the claims actually made.
