# Surrogate transfer integrity review

## Scope and identities

Read-only review of the two transfer scripts, the frozen protocol, grounding, decision trail, and committed P8 registration, manifest, and results. The reviewed checkout was `13821dc16bc0c10fd41af1654fc72e50177923a6`.

| File | SHA-256 |
|---|---|
| `scripts/ai-surrogate-transfer.py` | `7b9a0fb1282e7f3fb79863b9c61e16eee274a91d2e92d74966bfde18899b890c` |
| `scripts/ai-surrogate-transfer-inputs.py` | `c83d81482735707f38ce05b94d240af6ad0e89d526592916eb54cba84e301d4a` |
| `artifacts/ai-surrogate-transfer-study/protocol.json` | `403881d74579830d79da135a86d1acf0f294dd00795ea592a253caede68975ff` |
| `artifacts/ai-surrogate-transfer-study/grounding.md` | `b25bab5d06b4fa2c26398dd8174ed905312b6d4a74e3bfac59300a44c302bef7` |
| `artifacts/ai-surrogate-transfer-study/decisions.tsv` | `45c28a150a062ca00c06c23ee783cdd8e6852ee74a48c8a315bc5db5b5fdbda1` |
| `docs/quality/evidence/ai-position-surrogacy-2026-10-19/registration.json` | `df9ce9f264632da0542fad7210043ede1449bc2c32d2f5ddc257973848609557` |
| `docs/quality/evidence/ai-position-surrogacy-2026-10-19/manifest.json` | `fa9c47bb0e8acfd52c4499a78a849aa907567a2b70cf1d15f11e0f9f116b44a4` |
| `docs/quality/evidence/ai-position-surrogacy-2026-10-19/results.json` | `ec83a8bfe0932ff73d33da46525c1acd66dabc39d0960cd2936239f3467f0764` |

The input audit recorded the full-precision results SHA-256 as `9b4dad299a2b664e198999cae3e7bda231c818c7d325e33549269fa2cd8f5735`, matching the manifest. The six historical source hashes in registration match the current historical source files. The three design hashes in the protocol match their files.

## Findings

The recorded run reconciles all 48 manifest row and summary files, 24 registered weight files, and all 384 games. It identifies 24 variants in 12 complete half/double weight families, 8 shared seed pairs across 2 climates, 192 paired effects, and 6,144 rows. Every opposite-seat pair has matching six-part seeds and initial-state hash. Each pair uses the registered alternating variant seat. Historical training contains 96 map seeds, with no overlap against the 8 P8 map seeds.

All 240 reproduced P8 means match the manifest-hashed full-precision results with maximum absolute error `0`. The committed summary's 57 rounded values also match their four-decimal rounding. The run records 384 reconciled save endpoints and 384 historical `replay.ok` records. Its stated identity scope is accurate: save bytes and canonical accepted-action hashes are recorded, action counts and saved endpoints are reconciled, but no new engine replay or state-hash recomputation was performed. The output reports 230 distinct trajectory identities among 384 games; this is not treated as 384 independent trajectories.

The actual analysis output matches the frozen protocol's primary contrast, balanced 36-split design, family holdout, and outcome scope. The primary MSE difference is `0.103` VP² in favor of M2, with a 12-family descriptive interval from `-0.576` to `0.865` VP². This does not establish that M2 beats M0. The reported 864 prediction rows arise from repeated, dependent splits; the output labels that dependence and scopes uncertainty to family resampling on these maps. Its interpretation excludes prospective validation, latent-effect claims, and reward qualification. I found no unsupported causal or independent-row claim in the reviewed output or decision trail.

The protocol file containing `reviewAmendment` was written at `04:53:07Z`; the self-test artifact was written at `04:54:54Z`; and the analysis artifact was written at `04:55:37Z`. The `decisions.tsv` row stating that controls were completed before the transfer run was appended at `04:55:40Z`, three seconds after the analysis artifact. The artifact timestamps support that the amended protocol and controls preceded scoring, but the decision row itself was recorded afterward. The self-test reports `VERIFIED_CONTROLS`: the shared-noise case has same-panel correlation `1.0` while held-out identity and mapped predictions lose to zero on average; genuine and negative transfer controls follow their planted directions; the family-direction case demonstrates the deliberately leaky within-family comparator. An independent algebra review also confirmed the exact off-diagonal covariance identity and stable-map-offset invariance.

The implementation records the protocol's full byte hash in `run/analysis.json`, but the CLI currently rejects protocol mismatch only for `primaryContrast`; its split, baseline, and uncertainty declarations are not all checked against implementation constants. The reviewed frozen protocol and actual run agree, so this is a future drift-detection gap, not a discrepancy in this run.

The work remains exploratory and open. The study checklist is not marked complete, and the result status is `REPORTED_EXPLORATORY`.

## Comment audit

The two scripts contain four comment-like lines: one executable shebang and one module docstring per file. Both docstrings are used as CLI help descriptions. There are no inline comments, comment suppressions, deletion opportunities, or `MUST KILL` flags.
