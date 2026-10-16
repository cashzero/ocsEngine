# Movement-order candidate quality run

Boundary: complete checks in an immutable candidate worktree, based on commit
`716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Standard opponent is version 66;
candidate version 67 changes combat-unit execution order only. No matches ran.
The candidate patch is retained as text so the failed policy can be reconstructed.

Expected: full typecheck and suite pass, retaining the funded Overrun regression
and the original 60-second full-continuation timeout. Observed: typecheck passed;
741 tests passed, eight skipped, two failed. The funded Overrun case selected a
MOVE_PIECE instead of the expected attack on 1,18. The trace-gain continuation
timed out at 67.975 seconds; full suite elapsed 177.07 seconds. Smoke was not run
after failure. This candidate is rejected before VP evaluation.

Raw logs and immutable builds remain in ignored `artifacts/ai-vp/`; hashes and
commands are in `results.json`. These are headless observations and change no UI
acceptance status. Current decisions belong in `docs/ai/heuristic-policy.md`.
