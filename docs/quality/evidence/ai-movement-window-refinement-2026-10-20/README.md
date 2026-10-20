# Observed combat window refinement

This is a separate exploration after inspecting the [movement panel](../ai-movement-metric-panel-2026-10-20/README.md).
It reuses those same 80 saves and frozen early compact measurements, with no new
games. The code base is `97e6e04` plus the run-specific analysis script in this
folder. It does not amend the original experiment or claim independent confirmation.

The [protocol](protocol.md), [registration](registration.json) and [analysis source](analyze.py)
were frozen before computing new candidate associations. The registration binds
this source, its protocol, the verified scorer and the original full result bytes.
The runnable path is `artifacts/ai-movement-metric-followup/analyze.py`; that path
and its protocol and registration must contain these exact bytes before replay.
The source intentionally names one run and is not a general measurement tool.

```sh
python3 artifacts/ai-movement-metric-followup/analyze.py
```

The run returned zero in 0.12 seconds with empty stderr. It verifies the existing
80 input hashes through the frozen loader, reconstructs COMBAT objective windows,
and checks all 160 raw-player score-blocking values equal the original definition.
Thus the proposed support-unit masking premise has no supporting window here;
the identical role-only candidate is not scored as a new metric.

The actual refinement combines 29 score-only blocked windows and 14 additional
windows whose improving routes were all visited and refused by supply checks.
Twelve other windows have unknown improving routes and no passing witness, so
they cannot count as exhausted. Fourteen of the 43 contributing windows include
omitted supply corrections. The combined indicator describes retained scoring and
visited checks, not physical impossibility or complete legal search.

The original four seed splits and held-family training lists are unchanged.
The extra tests fix M2's slope at one and regress only the final-VP-minus-M2
residual using the other families' development data. A residual-mean-only model
isolates intercept calibration from the candidate's extra information.

The combined indicator alone has MSE 12.040189, worse than the original score-only
9.280461 and zero 10.662500. Direct M2 is 7.686068; residual-mean correction is
8.624721; adding the original score-only feature is 9.112518; adding the combined
feature is 10.595132. The refinement is rejected for prediction improvement.

[Summary](summary.json) retains all seven models and every score slice.
[Panel inputs](panel.json) and [predictions](predictions.json) retain the exact
data and fits. Full per-window support stays in the gitignored artifact whose
hash appears in the summary. No policy, promotion, reward or UI gate is completed.

The [independent review](review.md) reconstructs all 984 windows, 200 fits and 280
predictions using a separate high-precision solver. Maximum prediction difference
is 1.78e-15. Every score slice matches. The run-specific script has zero comment
audit findings. No reporting blocker was found; the rejected refinement remains
retrospective evidence, with predictor qualification and causal tests open.
