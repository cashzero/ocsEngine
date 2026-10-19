# Independent statistical review

The implementation and recorded experiment support an exploratory historical transfer result. I found no remaining blocking statistical or correctness defect in the reviewed sources. They do not establish a qualified predictor of new-policy VP improvement. This review does not close the broader research goal or a product acceptance gate.

The review is independent of the implementation and design authorship. Its scope is the two transfer scripts, the accepted design and protocol, the completed synthetic controls, and the recorded empirical run. I changed only this review file. Prove It Works determined the verification method. I recalculated recorded predictions and losses rather than accepting the report's status field. The long Monte Carlo run was inspected and independently summarized, not repeated.

## Prediction boundary and provenance

The primary contrast is the frozen historical P6 identity M0 MSE minus identity M2 MSE. Positive values favor M2. Each predictor receives the held variant's GT4 early values from four development map pairs. Its target is the same variant's mean final VP margin on the four disjoint evaluation pairs. This is a seat-balanced margin against the standard opponent, not an independently observed difference from default self-play.

Both climates contribute two pairs to each side of every split. The 36 oriented splits contain 18 complementary partitions. Every map appears in development 18 times. The 864 predictions are dependent evaluations of 24 variants on eight maps.

Each secondary OLS fit uses one development mean for each of 22 variants. Both members of the held weight family are excluded. The historical P6 fit uses only its recorded training games and rejects overlap with P8 map seeds. Neither evaluation outcomes nor evaluation features enter fitting. The direct development-final baseline intentionally reads the held variant's completed development outcomes and is labeled accordingly.

The input loader checks historical source hashes, weight hashes, row and summary hashes, opposite variant seats, identical paired seed identities, shared starting identities, complete GT4 boundaries, finite metrics, saved action counts, saved endpoints, and historical replay status. Its identity scope correctly states that this run performed no new engine replay or state-hash recomputation.

The empirical audit records 192 pair effects, 384 game records, 6,144 player-turn rows, and 230 distinct trajectory identities. The game records are not 384 independent trajectories. Repeated trajectories remain compatible with the specified equal-variant finite-panel estimand, but further limit inference across supposedly independent policies or families.

The audit records exact reproduction of all 240 full-precision historical means, with maximum absolute error zero. Fifty-seven committed values require the documented four-decimal comparison. I read these audit values and independently reconciled every final pair target to its two variant-signed game margins in the 48 source summaries. I did not independently rerun the full raw-metric extraction.

## Executed independent checks

The following checks passed against the recorded files and current source.

- Recomputed all 864 evaluation targets and all four identity predictions per target from `panel.json`.
- Recomputed all 3,888 secondary OLS fits and all 7,776 secondary predictions from the development panel. Calibration membership matched the required 22 variants in every fold.
- Recomputed MSE for all 16 methods from the prediction ledger.
- Recomputed the primary 10,000-draw family-resampling limits with the frozen seed.
- Verified the report's panel, prediction, fold, protocol, and implementation hashes against the actual files.
- Compared cached and direct calculations in all 432 folds on an independent synthetic panel. Results and coefficients were identical.
- Recalculated both climate MSEs independently. The averages of the complementary-partition, climate, and family-deletion primary contrasts each matched the pooled primary contrast.
- An exact stable-signal panel gave zero identity and mapped prediction error. Across 36 perturbed folds, changing evaluation values left surrogate predictions and coefficients unchanged. Changing held-family development outcomes changed the direct-final baseline by the planted amount while leaving surrogate predictions unchanged.
- Common map offsets of `100 * (seed - 3.5)` in X and `-30 * (seed - 3.5)` in Y left every observed, same-seed, and cross-seed covariance or variance term unchanged within absolute tolerance `1e-10`.

## Synthetic controls

The completed `self-test.json` retains 500 replicate records for each of four modes. Every reported mean and Monte Carlo standard error exactly matched my recalculation from those records. Independent synthetic panels are the Monte Carlo replication units. The repeated folds are not treated as independent Monte Carlo samples.

| Control | Identity gain over zero, mean and MCSE | Mapped gain over zero, mean and MCSE | Assessment |
| --- | ---: | ---: | --- |
| Genuine transfer | 5.92421, 0.08537 | 7.88973, 0.11367 | Both beat zero and the development training mean. Mean mapped slope is 1.99719. |
| Shared noise only | -0.25414, 0.00262 | -0.25414, 0.00262 | Same-panel correlation is exactly one. Both disjoint predictors lose to zero. |
| Reversed transfer | -9.96501, 0.13804 | 7.95882, 0.11056 | Identity fails while the fitted slope reverses to -1.99689. |
| Independent family directions | -3.47874, 0.23644 | -1.86097, 0.16086 | Proper family exclusion loses. The deliberately leaky within-family fit gains 14.52538 with MCSE 0.13242. |

The shared-noise control has analytic expected gain `-0.25`, because independent four-map means each have variance `0.25`. Its observed gain is 1.58 Monte Carlo standard errors from that expectation. With theta variance two, the positive and reversed identity controls have analytic expected gains `5.9975` and `-10.0025`. Both observed values agree within one Monte Carlo standard error. These checks support the measurement procedure, not empirical surrogate success.

The protocol amendment restores the accepted design's family-direction control, retained replicate statistics, baseline comparisons, and sensitivity outputs. The original positive-control scale mismatch is preserved. The selected real-data predictors and primary contrast remain unchanged.

## Covariance and uncertainty

The signed decomposition is algebraically correct. Within climate c, its noise term is one quarter times the sum of residual covariances divided by `n_c * (n_c - 1)`. Subtracting this term leaves the mean covariance over ordered distinct seed pairs within each climate, together with the ordered cross-climate terms. The code verifies the equality directly.

The fold-local calculation excludes evaluation maps and the held family. The full eight-map version is labeled contextual. Neither version enters prediction, feature selection, or a corrected slope. Negative corrected variances remain visible. Interpreting cross-seed covariance as stable policy-effect covariance still requires seed-sampling assumptions that these eight historical maps do not establish.

The primary interval resamples 12 family mean loss differences after predictions are fixed. Its label correctly says descriptive, conditional on these maps, without refitting or map-population coverage. It is not a conventional confidence guarantee for new maps or policy architectures. The 36 split results, 18 partition means, and family-deletion results are sensitivity summaries, not replications. The climate reports correctly retain the same climate-balanced prediction and change only the evaluation target.

## Empirical finding and claim limits

| Predictor | MSE in VP squared |
| --- | ---: |
| Zero | 3.32726 |
| Development training mean | 3.45244 |
| Identity M0 | 3.25288 |
| Identity M1 | 3.02555 |
| Identity M2 | 3.14990 |
| Direct development-final | 4.95486 |
| Mapped M2 | 3.94825 |

The frozen M2 advantage over M0 is `0.102984` VP squared. The descriptive fixed-prediction family interval is `[-0.575689, 0.864610]`. M2 improves 17 of 36 dependent splits. Its climate contrast is `-0.491635` in Eastern Europe and `+0.697603` in Temperate Inland. Dropping the progressObjective family reverses the overall contrast to `-0.175232`. Dropping crowding reverses it to `-0.046907`.

M2 has a pooled point advantage over zero and the training-mean baseline, but the family and climate sensitivity does not establish reliable improvement prediction. All nine secondary mapped predictors have larger pooled MSE than both zero and the training mean. Identity M1 has the lowest observed MSE among the reported methods, but it is a secondary result. Selecting M1 after inspecting this panel would require new confirmation. No method is qualified for policy promotion or reward optimization by this run.

The report's `REPORTED_EXPLORATORY` status and explicit exclusions of prospective, latent-effect, and reward qualification match the evidence. The broader goal of predicting which policy changes improve VP remains open.

## Reviewed identities

The following SHA-256 values identify the reviewed files. The empirical report separately binds its full historical input audit.

| File | SHA-256 |
| --- | --- |
| `scripts/ai-surrogate-transfer.py` | `b352e3bec5691076d6cd29fded6dad8ab832c1d5f32f47032934b0fc2c00268d` |
| `scripts/ai-surrogate-transfer-inputs.py` | `c83d81482735707f38ce05b94d240af6ad0e89d526592916eb54cba84e301d4a` |
| `artifacts/ai-surrogate-transfer-study/protocol.json` | `403881d74579830d79da135a86d1acf0f294dd00795ea592a253caede68975ff` |
| `artifacts/ai-surrogate-transfer-study/synthesis.md` | `42581bc593cfac80c0e8ed9b87c2e5d98c6fe4e15716eee828d35bc6083838d0` |
| `artifacts/ai-surrogate-transfer-study/decisions.tsv` | `d15eb9d2b99ea19449c2c3614719f53497b6b2d6fb756c2657a7159668c3187c` |
| `artifacts/ai-surrogate-transfer-study/design-a/design.md` | `f46acca4565b4c33dae4eb5cc9584911ae111ecaafb843ecb6a920d121a2716c` |
| `artifacts/ai-surrogate-transfer-study/design-b/design.md` | `07bc7d66b72b22f2b17c87da2162bb4de073bf0355fc9797ae835634bbadeedf` |
| `artifacts/ai-surrogate-transfer-study/design-judge.md` | `2b7e1947a32e6b710aafcdb8180e43b4d0390a3024d73515372e6f6a788a8ac3` |
| `artifacts/ai-surrogate-transfer-study/self-test.json` | `1df90dc2ccd151c7b3820d920ddf532c57e7deba72a834531a58b7aeddcca183` |
| `artifacts/ai-surrogate-transfer-study/run/analysis.json` | `b14c47c9b70eb5711a890f5c37e4d0d213dbed4f4668a72e4a09f66bab4d664f` |
| `artifacts/ai-surrogate-transfer-study/run/panel.json` | `7a848393510d83306d2062af1c3a406591064fc3a3084646e0b64bbe51677398` |
| `artifacts/ai-surrogate-transfer-study/run/predictions.json` | `467a536567a492300e9eae0803cdf80097c32b27d1789ca54c1b5e094effba0c` |
| `artifacts/ai-surrogate-transfer-study/run/folds.json` | `e04065784b1e9b78bc5816b0d653db13d1e4a6c14f0553b36edb0adbae139de5` |
