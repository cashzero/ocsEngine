# Cross-seed metric stability

This descriptive meta-analysis reuses the 40 pair records from the
[window refinement](../ai-movement-window-refinement-2026-10-20/README.md).
It examines the premise that a diagnostic reflects a policy difference that
persists across seeds. It adds no predictor, game, causal inference or qualification.
The source base is `97e6e04` plus the run-specific script in this folder.

The [protocol](protocol.md), [registration](registration.json) and [script](analyze.py)
freeze 18 variables before computing stability. Every original candidate, the
combined window, VP, M0, M1, M2 and final VP remain. Source and data hashes bind
the reused tied-rank and Pearson helpers. Run with these exact files restored
at their recorded artifact paths:

```sh
python3 artifacts/ai-movement-metric-stability/analyze.py
```

The command returned zero with empty stderr in less than a second. It ranks
the ten variants' development-seed and evaluation-seed means within each of the
four existing splits. Ties receive average ranks; a constant vector yields null.
It also compares the five families' double-minus-half contrasts. The splits
reverse in pairs, so these are only two unordered partitions, not four new trials.

Approach score-blocking's variant rank correlation is -0.691665 in one partition
and 0.579522 in the other. Approach crowding crossing is more stable, 0.683658 and
0.795111, but the frozen comparison still shows poor VP prediction. Stability
alone does not make a metric useful.

M2's family-direction contrasts retain the same nonzero sign in all four of
four informative families in both partitions. Final VP's own family-direction
contrasts retain sign in only two of four or three of five informative families,
with rank correlations 0.1 and 0.4. That is observed target variation in four
selected seed pairs. It is not a population noise ceiling, power estimate or
proof that another predictor cannot improve.

[Summary](summary.json) retains every variable and split. The underlying
[variant means and family contrasts](contrasts.json) make the ranks and signs
reviewable. The full artifact hash is in the summary. No confidence interval,
population reliability coefficient or significance claim is made.

The [independent arithmetic review](../ai-movement-window-refinement-2026-10-20/review.md)
reproduces all 144 reported correlations, every mean, family contrast and sign
count. Its stability scope covers the artifact arithmetic and protocol, not a
population inference or predictor qualification.
