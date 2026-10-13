# All units: reinforcement entry regression, 2026-10-13

Acceptance steps set before implementation: waiting reinforcements must be absent from roster rows,
search and serving counts; entered units must appear and be selectable; serving aircraft at off-map
airfields must remain; eliminated units stay in their separate collapsed group, outside serving counts.

Final browser evidence: [run3/log.md](run3/log.md), [run3/results.json](run3/results.json), and its screenshots.
Playwright Chromium, 1920×1080, built application, visible controls only; no state injection or rule API calls.
The first preview/start used 32×24, 6 divisions/2 armored, no air, seeds 9121–9124. The second used
18×12 Eastern Europe, 3 divisions/1 armored, Allied attack, standard air, seeds 9131–9134.
Both generated packages were previewed and started through New Game.

Observed on the second package: Turn 1 roster had 39 serving units including six off-map-airfield aircraft,
with no reinforcement-box rows. A legal Engineer move 0107 → 0207 was confirmed in the UI; all decisions
and required hot-seat handoffs completed through the entire game turn. Turn 2 Allied Reinforcement listed
six arriving counters; none appeared in All units before placement, including when searching replacements.
After placement, the five arriving units (artillery, truck, Eq and two Pax) appeared and were selectable;
the serving counts increased from 39 to 44. The supply dump remained excluded. Final visible position:
Turn 2/8, Allied Reinforcement, selected the entered artillery. Revision is not exposed at this boundary.
Seven roster open/clear-search measurements were 133–193 ms. Console/page errors: zero.
Screenshots 05 and 08 were visually inspected for grouping, counts and entered counters.

Earlier attempts are retained as a harness evidence trail, not product failures or completion evidence:
the root run tried moving during Aircraft Refit instead of Movement; run2 completed Turn 1 but checked
entered artillery while the search field still contained `replacements`. Run3 fixes both driver mistakes.
No player-blocking issue was observed in the final run. Some long aircraft/replacement names are truncated
in the existing compact rows; this change does not address name layout.

Regression support: typecheck, build, dist smoke and 24 tests across transport-panel, command-deck and
unit-status passed. The existing eliminated-unit regression still verifies its separate group; actual
combat elimination and rebuilding were not repeated in this browser run.

Scope: this is evidence for the roster fix only. It does not promote the entire product gate or unrelated
rows of `docs/quality/03-product-operation-verification-plan.md`; MAP-04's preview/count-explanation failure
remains open. The earlier broad acceptance evidence remains historical.

Build identity: HEAD `671cafcc35a40ad9ded64952d0d57ba0fce10afb` plus existing workspace changes and this fix.
SHA-256 `src/ui/command-deck.ts`: `ae242689b4cd5a6063270522f7da07ddaf2c161c11ca58aaf862f5dec033aafd`;
`dist/ui/command-deck.js`: `5e8e3e3d6032dba20fc93977815069ebe538a6486aad568e15bc2c978af65f56`.
