# Product acceptance run, built application, Playwright Chromium

Runs on the built application (`npm run build`, served by `scripts/air-acceptance/harness.mjs`), 1920×1080 unless the
folder says otherwise, every step a click, a key press or a typed value on a visible control. Screenshots and large saves are
in the gitignored `artifacts/product-2026-10-14/` and were reviewed there; this record keeps what they showed.

| Folder | Script | Rows | Result |
|---|---|---|---|
| `newgame` | `run-newgame.mjs` | BOOT-01, NG-01 to NG-10 | all PASS; NG-03 and NG-05 pass on the two-page dialog with changed meaning, NG-09 needs the mounted map for the deployment seed |
| `map` | `run-map.mjs` | MAP-01 to MAP-05 | MAP-04 FAIL (Preview 62 units, rosters 64 rows, unexplained); others PASS |
| `turn2` | `run-turn2.mjs` | MAP-06, ACT-05, ACT-05a, REPL-02 | all PASS (Axis moves first in Game Turn 2) |
| `counters-1920x1080`, `counters-1680x1050` | `run-counters.mjs` | CTR-01 to CTR-08 | CTR-05 PASS; CTR-06 shows only the top counter of a three-counter stack legibly |
| `ui-1920x1080`, `ui-1680x1050` | `run-ui.mjs` | UI-01 to UI-04 | UI-02 FAIL (roster truncation); UI-03 PASS against 12 px (user decision); UI-01, UI-04 PASS |
| `session` | `run-session.mjs` | SES-02 to SES-09 | SES-09 FAIL (reload silently replaces the game); SES-07 partial (replay has no loader) |

Each folder has `log.md` (one line per row: expectation, observation), `results.json` and `observations.json`.
Console and page errors: 0 in every run. NG-10 loading-page frames were captured with a CDP screencast at 6× slower CPU
(the page's main thread is busy during each step, so a normal screenshot cannot show it); timings taken under that
throttle are not used. Not run: SES-01 (no Pause control), UI-05, ACT-06, NG-12, RAIL-05 to RAIL-10, RAIL-15, RAIL-16.
