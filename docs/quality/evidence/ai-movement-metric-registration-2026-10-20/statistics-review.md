# Movement metric statistical implementation review

The registered comparison can proceed after all 80 regenerations satisfy their identity checks. This independent review found no blocking statistical implementation defect in the reviewed scorer. It does not establish a useful predictor, verify the full recorder, or complete the empirical research goal. No newly extracted movement feature or empirical prediction score was read or calculated in this review.

The review used the poteto-mode investigation workflow. The throughput checkpoint is not applicable to this read-only investigation. The Prove It Works principle required independent numerical solutions and mutations of the actual prediction functions. The Explain the Number principle required the exact target, aggregation rule, dependence structure, and baseline definitions before interpreting model errors. No source edits, games, builds, or nested agents were used. This report is the only saved review artifact.

## Reviewed identities

The repository HEAD was `1558390ebefb8236033db17165c60f8357e21e7a`. The source file is new working-tree code, so its content hash is the controlling identity.

| Artifact | SHA256 |
|---|---|
| `scripts/ai-movement-panel-compare.py` | `a4a9550cfec96f1c8df431ef4cb59eb15780b53f5c2fee5559e3aaa2446f6a0d` |
| `artifacts/ai-movement-metric-panel/protocol.md` | `1fd69d65b46b09f9006c4fd5fba28ce4a70a7b87a8d85e3134711f131f447503` |
| `artifacts/ai-movement-metric-panel/cohort.json` | `04931eda9ff831751cebe45f9b2406f781204392981a2765a9b6e5394231f720` |
| `artifacts/ai-movement-metric-panel/analysis-registration.json` | `cb35b9cd97a5804ebf346fccdc46c427c23de81fb30f9aacacd44e901c186cd7` |

The analysis registration matches the reviewed source and protocol bytes. The numerical checks ran against initial analysis source `23fc5cc1d4e9f7923cbabcc450919b0561362c58feae597dbd5658c7466e8460`. The final revision adds raw-player, oriented-game, and pair support output. Inspection confirmed that the fit, prediction, score, and ranking-order logic remained unchanged. The amended registration preserves that previous source identity and the pre-score rationale. The current self-test and a complete synthetic main-path execution were also checked after this amendment. The earlier `measurement-registration.json` intentionally lacks `analysisSha256` and is not the scorer input. Its omission fails closed. The analysis registration states that its source binding precedes new empirical scores. This review does not independently prove a historical absence of other executions.

All 40 frozen cohort rows exactly equal their corresponding rows in `artifacts/ai-surrogate-transfer-study/run/panel.json`, which has 192 original P8 pair rows. This includes historical early predictions, VP outcomes, game identities, and seat orientation. The selected cohort has ten variants, five complete half/double families, the two smallest map seeds per climate, 80 variant-labelled games, and 65 distinct trajectory IDs.

## Mathematical and prediction contract

`fit` minimizes the sum of squared residuals plus the square of the standardized diagnostic coefficient. Its intercept and VP coefficient are unpenalized. Diagnostic standardization uses the training population standard deviation. Centering VP avoids a nonzero constant training predictor acquiring an arbitrary slope. Constant VP has slope zero. A constant diagnostic contributes zero even if its held value differs from the training constant.

For centered VP `v`, centered response `y`, and standardized diagnostic `z`, the code removes the projection of `z` onto `v`, producing `r`. It computes the extra coefficient as `sum(r*y)/(sum(r*r)+1)`, then subtracts the corresponding overlap adjustment from the ordinary VP slope. This is the partially penalized normal-equation solution. When VP is constant, the projection is zero and the diagnostic-alone ridge formula remains valid. The displayed rank describes the unpenalized design rank, not the penalized matrix rank.

`predictions` builds the four oriented development/evaluation seed splits. It averages each training variant's development outcomes and early features before fitting. Both directions of the held family are excluded. Each held prediction uses that variant's development features. Evaluation-seed values supply only the targets. Thus the primary error squares the prediction minus the two evaluation seeds' mean final VP. It does not average two independently squared seed errors. Climate errors preserve the same prediction and substitute the climate's evaluation outcome.

The 30 models are zero, training mean, direct historical M0/M1/M2, fitted VP, all twelve diagnostic-alone fits, and all twelve VP-plus-diagnostic fits. The six path diagnostics and six approach-union diagnostics remain distinct. Every model receives MSE, MAE, and prediction-minus-observation bias overall and by split, family, and climate. Ranking uses the same observations for every model. Subtracting aggregate MSE is therefore exactly the mean paired squared-error difference.

The loader computes each game's diagnostic as variant player minus opponent, then averages its two opposite-seat games. The historical source implements the corresponding orientation for early M0/M1/M2, raw early VP, and final VP. This is an oriented matchup contrast. It is not an absolute gain against separately played standard self-play.

## Executed checks

The built-in `python3 scripts/ai-movement-panel-compare.py --self-test` logic was invoked directly from an imported module. Every control returned true. The independent checks below also invoked the actual `fit`, `predict`, `predictions`, `score`, `load_panel`, and `main` functions. Python bytecode writes were disabled.

The independent numerical reference assembled the full normal equations for raw VP, intercept, and standardized diagnostic. It solved those equations by pivoted Gaussian elimination using 70-digit `decimal.Decimal` arithmetic. It added one only to the diagnostic diagonal. Constant columns were omitted. The reference did not use the scorer's residualization formula. The fixed random seed was 85193. Each of six data cases used 100 eight-row samples, four model forms, eight training points, and two extrapolation points. The four forms were VP-only, VP-plus-diagnostic, diagnostic-alone, and training mean.

| Numerical case | Maximum absolute prediction difference |
|---|---:|
| Generic inputs | `4.263256414560601e-14` |
| Exact collinearity | `2.842170943040401e-14` |
| Near collinearity | `1.4210854715202004e-13` |
| Nonzero constant VP | `1.4210854715202004e-14` |
| Nonzero constant diagnostic | `1.4210854715202004e-14` |
| Both columns constant | `1.7763568394002505e-15` |

All 2,400 fits and 24,000 prediction comparisons agreed within absolute and relative tolerance `1e-10`. These are numerical implementation checks, not empirical evidence of transfer.

The expanded controls used a varied synthetic ten-variant, four-seed panel with independently varying VP, historical models, diagnostics, and outcomes. They checked the following behavior.

- In each of the four splits, replacing all evaluation-seed early inputs and diagnostics and adding 1,000 to evaluation outcomes left every fit and prediction unchanged. Scores changed.
- For each of the five families, replacing that family's inputs and adding 10,000 to its outcomes left all fits used to predict that family unchanged in all splits. Every training list contained eight variants and excluded both held directions.
- Twenty random row permutations left the entire prediction output byte-identical under canonical serialization.
- All 40 rows contained exactly the registered 30 model names. Direct historical predictions and evaluation means matched separate calculations from the appropriate seeds.
- Independent arithmetic reproduced MSE, MAE, and bias for all 30 models overall and in both climates, covering 90 model/target combinations.
- An in-memory synthetic 80-game loader fixture verified all twelve feature orientations and the seat-pair mean for all 40 pairs. Separate mutations of recorder hash, engine hash, cohort binding, trajectory-match flag, action count, final-state hash, and cutoff turn were rejected with the corresponding error. The first fixture run had a reversed expected sign in the review assertion. Correcting that assertion to variant-minus-opponent yielded the registered negative half-unit pair result. No production code changed.
- Mocked registration inputs exercised `main` without loading empirical games. A stale analysis hash raised `Analysis source changed after registration`. A stale protocol hash raised `Protocol changed after registration`. A missing analysis hash raised `KeyError 'analysisSha256'`. Correct hashes reached the input-loading sentinel before any scoring or output write.

The loader check used the then-current analysis registration and checked its source and protocol bindings. A further complete synthetic `main` execution used the final amended registration and source. It replaced all cohort outcomes and early inputs with synthetic values, retained no empirical scores, and intercepted file writes in memory. All twelve ranking rows correctly reported 160 nonzero raw-player measurements, 80 nonzero oriented-game differences, and zero nonzero pair means. The synthetic seat effects cancel exactly. This proves that the added support fields distinguish observed mechanisms from absent pair variation. Each game preserved its raw player values and two path windows plus one approach window. The output contained 30 models and 40 prediction rows. No synthetic fixture was saved. Source line ranges for these contracts are `fit`/`predict` at 29 through 65, prediction folds at 76 through 108, scoring at 111 through 119, loader guards and pair aggregation at 122 through 156, and registration/output at 201 through 238.

## Interpretation and remaining acceptance

Forty prediction rows reuse ten variants and four seed axes. They are dependent observations. The 80 saved games also include repeated trajectories. No independent-sample claim, decisive population confidence interval, p-value, or promotion gate follows from this panel. Selection of the five families after observing historical P8 outcomes makes the analysis retrospective. A ranking leader is a candidate for later independently registered evidence.

This review supports running the frozen comparison once the batch is complete. The empirical goal remains in progress until all 80 regeneration records are verified, numerical errors are computed for all registered models, support and feature variance are examined, and actual counterexamples explain success or failure. Preserve zero and historical M1 comparisons even if a diagnostic beats fitted VP. If no diagnostic beats VP and zero, reject these metrics for the current goal rather than treating tooling completion as the result.

Recorder extraction semantics, full historical action regeneration, feature support in actual games, and post-cutoff observation invariance remain the recorder review and batch audit's responsibility. The scorer's cutoff rejection checks recorded group turns; it does not independently reconstruct feature values from game trajectories. This separation is acceptable only with the registered recorder and identity checks intact. The historical GT4 resolved-boundary models and new pre-GT4 movement diagnostics retain the protocol's disclosed temporal mismatch.
