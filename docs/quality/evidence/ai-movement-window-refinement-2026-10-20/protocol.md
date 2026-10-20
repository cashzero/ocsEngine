# Frozen exploratory window refinement

This is a new retrospective exploration after inspecting the complete80game
movement comparison. It does not amend its protocol or confer confirmation.
Reuse its40pairs,65trajectories, four development/evaluation splits and held
families. No new games, seeds, roles, cutoffs, penalty or hyperparameter search.

The specific premise that support-unit improvement masks COMBAT score blocking
was checked without new outcome associations and refuted in these data: zero
such windows. COMBAT-only score blocking equals the original indicator and will
be checked for equality, not scored as a separate new candidate.

One new feature combines COMBAT score blocking with visited supply exhaustion
at objective/window level. Use only compact approach-union rows of COMBAT in
GT1..3, originally unowned by that player. Sum scored, improving, actually checked,
preserved and refused within player/objective/GT. Require checked<=improving and
checked==preserved+refused. A window contributes if scored>0 and either improving
is zero, or every improving route was checked and none preserved friendly supply.
Retain score-only and supply-exhausted subcases. Unknown improving routes prevent
exhaustion. Count each weighted window once divided by3*configuredVP, then take
variant-minus-opponent and average swapped seats. Repeated evaluations are not
independent routes or proof of all legal opportunities. Correction-budget counts
remain support, since retained scores can depend on omitted correction checks.

Support-only independent review identified43 contributing windows:29 score-only
plus14 with improving paths all checked and refused. All984 approach windows
have COMBAT rows. This justifies testing window-level exhaustion rather than
weighting122 exhausted group occurrences. It does not prove physical inability,
causality or that removing a condition raises VP.

Keep seven predictions on each held variant and split: zero, direct historical
M2, training-mean residual added to fixed-slope M2, original scoreBlocked alone,
new combined feature alone, M2 residual ridge with original scoreBlocked, and M2
residual ridge with the new feature. Fits use only the eight other-family DEV
variant means. Use existing verified scorer fit/predict/score and populationSD
ridge objective SUM squared residuals + standardized coefficient squared. M2 is
an offset of slope1, never refitted. Residual intercept is unpenalized. Main new
question is whether combined-window offset beats directM2 AND its residual-mean
baseline; retain all errors per split/climate/family, signs, support and failures.
Compare predictions to mean2held-seedfinalVP as before. Evaluation features and
outcomes never enter fitting or predictions. No significance or reward gate.

Source/data hashes freeze before any new candidate/outcome association. The
candidate was selected after the old results, so even lower held-split error is
still selected retrospective evidence requiring a separate independent batch.
