# VP-weighted defense quality run

Base commit: `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Candidate 70 scales
defense requirements by public objective points / map mean points, including
the already-captured-point combat-advance reinforcement threshold.
Boundary: immutable build, typecheck and full suite; no bot matches started.

Expected: retain supplied combat reinforcement in the recorded 1258101 case,
with no friendly trace/ration loss; full quality passes before measurement.
Observed: typecheck/build passed, 742 tests passed/eight skipped/one failed.
Full-suite duration 280.25 seconds; smoke not run after failure. The failed
vp-advance test received advance:done rather than the supplied reinforcement.

Direct reducer inspection of the same saved position: target 9,16 is 1 VP,
map mean 1.7142857, current strength 14 and estimated threat 42.3130952.
The original half-threat requirement is 21.1565476; scaling by 0.5833333
reduces it to 12.3413194. Candidate 70 stops. Standard 66 chooses the legal
reinforcement, with trace lost 0, feed lost 0, mover traced and shared rations
funded. Candidate 70 did not damage supply; it failed the required reinforcement.
Decision: reject before VP evaluation; retain the standard immediate postcombat
reinforcement rule while separately testing Movement defense allocation.

Raw logs, frozen build and decision inspection remain in ignored artifacts/ai-vp.
Source/build hashes and the candidate patch support reconstruction. These are
headless observations, not UI acceptance. Current decisions belong in docs/ai.
