# Independent review after main integration

The reviewed instrument and current topic documents have no blocking correctness finding after the rebase to `ee3f7898f2ccd62970037a6afa0f46453db8e25a`. The reviewer did not author the objective scripts or their analysis. The model identifier is not exposed in this agent's runtime instructions, so this review does not invent one.

## Scope and identities

| Source | SHA256 |
|---|---|
| scripts/ai-objective-replay.mjs | f271de7d78a04a0ef3c796ba339912934def5176fd2df2ad6837890923625762 |
| scripts/ai-objective-replay-verify.mjs | f0dec2f8d0eb94ce7e1a05c80b71210a392804ac1e7d1031db61335939e1b48e |
| scripts/ai-objective-study.py | 07f5dde455b0cbce10923d734b2576fadd9640393654bea5867c7ac48191fa35 |
| scripts/ai-position-validate.py | 91eb5b1d453a3fe102462a3bc787eff126791eb8fb447373c8592c730f06dbff |
| scripts/ai-vp-metrics-compare.py | 00eeb924694c722d1ce47d92e44a6d1d6bae485b6728f1c9d2f0fcd80ed6a864 |
| docs/ai/objective-metrics.md | cacb17d3e01c9bb16fda654d0f6d0347f9e980249648b20d93ed6337b5a6ccea |
| corrected-run/analysis.json | ffdca2d21b2c3e632241d5df65a76de0e89028d718b767b502a5caa905bdf657 |

The corrected-run path is relative to this review's directory. All ten file hashes and byte counts in the evidence `artifact-hashes.json` match the actual files. Every evidence file present at review time is below 200 KB. The evidence README was still being assembled, so this verdict does not claim final evidence-package completion.

## Executed checks

Both `python3 scripts/ai-objective-study.py --self-test` and `node scripts/ai-objective-replay-verify.mjs /tmp/ocsEngine-objective-study-engine` passed. I independently called `validate_observations` on the actual corrected worklist and observations. It reproduced 156 windows, 1,352 target rows, 704 enemy-held targets, 39 retained acquisitions, 648 retained own targets, 84 deferred choices, and 25 corrected owners.

I reconstructed the P5 alignment directly from the two hashed P5 row files and every alias in the corrected worklist. Relative source directories in P5 were normalized to the worklist's absolute source paths. All 104 attack and 104 meeting alias windows match the actual owner and both players' objective gain count, loss count, gained VP, and lost VP. There are no mismatches. This independently confirms `main-alignment.json`.

Commit `6cef00e` changes the current recorder to open rows after WEATHER and FIRST_PLAYER. The diff from the original base `767e2a3` to the integrated base contains no engine source changes. The current analysis and `analysis-before-rebase.json` have identical prediction hashes, scores, and paired intervals. The rebase therefore did not silently change this experiment's fitted predictions.

I recomputed pooled Brier from the target prediction rows for every model and role. The numerical topic document matches those values. The primary pooled M3 score is 0.03770 against M1 0.04294. Its paired interval spans zero. The defender subgroup has only one positive outcome. The document retains these limits, the four improving and four worsening seeds, calibration failures, and the zero-VP baseline.

Every calibration table's bin occupancies sum to one. Occupancy-weighted bin scores reconstruct the complete-subset Brier, event rate, mean probability, and bias. Counts, paired intervals, rule conditions, window predictions, and folds in the partitioned evidence equal their fields in the full analysis.

## Current documentation and attention

This review supersedes the older `owner-fix-review.md` statement that the latest 255-trajectory corpus remained unrepaired. That was written before main integration. The decision trail explicitly records this correction. The current topic documents withdraw the obsolete audit's actor-dependent conclusions while retaining main's P2 through P7 results. I verified the overlapping 208 P5 alias windows, not every trajectory in the 255-trajectory corpus or the full prospective P7 run. Those broader results retain their existing evidence and are not independently rerun by this review.

The new objective experiment remains exploratory and does not replace P7. The documents correctly retain P8 through P10 as open. Conditional adjacent-formation odds do not prove a legal movement, fuel, and shared combat-payment plan. A lower historical Brier does not establish policy VP improvement.

The three new scripts contain no narrative comments, TODO comments, or scoped lint or type suppressions. Comment deletions, restorations, reruns, required encodings, and unenforced constraint comments are all zero in this scope. There was no architecture change during this review.

Prove It Works changed the review from trusting alignment flags to reconstructing P5 comparisons and reopening the real observations. Explain the Number changed the review from accepting the pooled score to checking subgroup scarcity, bin-weight reconstruction, and the unchanged post-rebase predictions. Final delivery still needs the evidence README, its final path and hash checks, and normal commit inspection.
