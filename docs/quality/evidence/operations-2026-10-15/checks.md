# Regression and consistency checks

- `npm run typecheck`: exit 0.
- `npx vitest run --maxWorkers=2`: exit 0, 102 files passed / 4 skipped;
  717 tests passed / 8 skipped (725 total), 132.79 s.
- `npm run build`: exit 0.
- `npm run smoke`: exit 0.
- Exactly 23 leading-UNVERIFIED status cells changed to PASS. All operation and required-visible-result
  cells remain identical to base commit; every other acceptance row is unchanged.
- Acceptance summary: 126 PASS, 5 IN PROGRESS, 2 FAIL, 3 OTHER, 136 total; 0 leading UNVERIFIED.
- `git diff --check`: clean at evidence assembly.

The first full regression run (`checks/tests.log`) found the Movement tab test still expecting
Unit/Log. The product now adds Logistics, so the test expectation was updated while preserving its
required-tab/focus/phase checks. The corrected test passed on its own, then the entire suite was rerun
successfully (`checks/tests-final.log`). This is test maintenance, not a reduced player acceptance.

Skipped tests remain skipped; this record does not count them as passing evidence. Browser runs and
screenshot reviews independently establish the requested operations. `fingerprints.json` identifies
source, build and runner content; no commit was created by this acceptance task.
