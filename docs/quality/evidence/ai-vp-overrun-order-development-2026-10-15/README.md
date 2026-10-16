# Immediate Overrun ordering development measurement

Source base: `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Immutable candidate 69
versus standard 66 through one common candidate engine/generator. Candidate 69
keeps only immediately executable, normally scored/supplied Overruns ahead of
other combat units; the rejected candidate 68 mission-value ordering is absent.

Inputs: 32 known games, eight turns, 32×24, six divisions/two armored per side,
no air/air transport. Meeting Temperate 1300000–1300007, Eastern 1300100–1300107;
Axis Attacks Temperate 1300200–1300207, Eastern 1300300–1300307. Identical
map/OOB/deployment/rule seeds and swapped candidate seats within every pair.

Expected: complete legal replays, zero guarded supply violations and a positive
VP signal worth independent validation. Observed: 331–333 VP (−2), meeting 0,
attack −2. Subgroup deltas 0/0/0/−2. All 32 complete at turn 8/COMPLETE, zero
errors/rejections, all replay hashes match, zero ordinary/strict supply violations.
All 40 candidate Regular advances and eight successful Overruns actually funded.
Decision: reject before independent registration; no fresh 80-game batch started.

Full frozen quality passed: 743 tests, eight skipped, typecheck/build/smoke.
Full-suite elapsed 299.11 seconds. Hashes, commands and durations are retained
in the JSON records, with the candidate patch for reconstruction. Raw logs/saves/
traces/audits remain ignored under `artifacts/ai-vp/candidate-69-development/`.
Verification is frozen-only: the working source has advanced to a new candidate.
These headless observations do not change any UI acceptance status.
