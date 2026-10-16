# Movement-order development measurement

Source base: `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Frozen candidate 68
versus immutable standard 66; both use the candidate engine and generator.
Boundary: 32 known development games, 32×24, six divisions/two armored per side,
no air/air transport, eight turns. These seeds are not independent promotion evidence.

Inputs: Meeting Temperate 1300000–1300007, Meeting Eastern 1300100–1300107;
Axis Attacks Temperate 1300200–1300207, Axis Attacks Eastern 1300300–1300307.
Each group swaps seats on identical map/OOB/deployment/rule seeds. Commands and
raw results are under ignored `artifacts/ai-vp/candidate-68-development/`.
Freeze source/build hashes and the patch make the candidate reconstructible.

Expected: legal complete replay, no guarded supply/advance violations, and a VP
signal worth a separate independent 80. Observed: 327–337 VP (−10), meeting −12,
attack +2. Subgroup deltas −24/+12/+8/−6. All 32 completed turn 8/COMPLETE, zero
errors/rejections, replay hashes equal, zero ordinary and strict supply violations.
Candidate 57 Regular advances and seven successful Overruns are actually funded.
Candidate kills/losses 428/386 versus baseline 386/428 do not override negative VP.
Decision: reject this combined ordering change before independent registration.

Frozen quality: typecheck/build/smoke passed, full suite 743 passed/eight skipped
in 165.30 seconds. `quality.json` binds log hashes and measured command durations.
Final match phase, hashes, exact settings and swapped input pairs were verified
by `scripts/ai-promotion/verify.py`; `results.json` is frozen-only because the
worktree has already advanced to the next candidate. It is not a promotion.

No UI acceptance row changes. Current strategy decisions belong in
`docs/ai/heuristic-policy.md`; raw saves/traces/audits remain ignored artifacts.
