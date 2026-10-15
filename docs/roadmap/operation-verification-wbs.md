# Outstanding product operations

## Scope

Complete the 23 rows whose status began as UNVERIFIED: NG-12, CTR-06, CTR-08, ACT-06,
SES-01, SES-07, UI-05, SUP-B01–08, RAIL-05–10 and RAIL-15–16. Their existing operations
and visible results in `docs/quality/03-product-operation-verification-plan.md` remain authoritative.

## Work and acceptance sequence

- [x] Expose Pause/Resume and replay-file loading; operate Pause, refused actions, Resume,
  final save/replay download and reproduction through visible controls (SES-01/07).
- [x] Implement the Phase B transport planner with reducer simulation, step costs, stock,
  confirmation/cancellation, shortfall alternatives and legal unloading destinations (SUP-B01–04).
- [x] Implement chosen-unit fuel estimates, planner handoff and Supply prediction; compare with
  actual payments and Supply results (SUP-B05–07).
- [x] Configure visibly different Map/OOB packages, preview and start the same package, complete
  an entire turn with helpers, all decisions/handoffs, then save/load/replay it (SUP-B08).
- [x] Exercise attack off-map sortie and next-turn refit after AEP restrictions (NG-12).
- [x] Inspect all counter rows at both desktop sizes, including three-counter selection, hover,
  focus and zoom limits; correct obscured fields before rerunning (CTR-06/08).
- [x] Exercise explicit Supply payment and keyboard-only New Game/map/action/modal/handoff
  boundaries (ACT-06, UI-05).
- [x] Exercise rail source supply, enemy cuts, station capture, HQ modes, Extenders, woodland
  cost, front control and refusals through real UI actions (RAIL-05–10/15–16).
- [x] Review screenshots in artifacts, preserve immutable text evidence with inputs, commit,
  timings/errors and final state, update only directly demonstrated acceptance rows, and run
  typecheck, appropriate tests, build and smoke on the final implementation.

## Status

The requested 23 operations are complete, with reviewed browser evidence in
[operations](../quality/evidence/operations-2026-10-15/README.md). Acceptance statuses remain owned by `03`;
this does not complete the broader product gate, Phase B extensions, CF5 or RC6.
Regression: typecheck, 717 passing tests (8 skipped), build and smoke.
