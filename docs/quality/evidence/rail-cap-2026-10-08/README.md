# Rail Cap: browser evidence (2026-10-08, RAIL-11 to RAIL-14)

Real Chromium (Playwright's headless shell) on the built application at 1920×1080, driven by `scripts/rail-cap-acceptance.mjs`.
Every step is a click, key press, typed value or selection on the page; every check reads the page (`log.md`, `results.json`).
Result: **10/10 PASS, 0 page errors**. Plan: `docs/roadmap/15-rail-cap-wbs.md`.

Environment note: this machine's Chromium lacked `libnspr4`, `libnss3` and `libasound2`; they were unpacked from the Ubuntu
packages into a scratch folder and passed with `LD_LIBRARY_PATH` (nothing installed system-wide). Edge through `OCS_CHROMIUM`
could not be used from WSL (Playwright's debugging pipe does not cross into Windows).

New Game: Situation **Allied attack**, 32×24, Compact, 4 divisions (1 armored), no air forces, 4 turns, Rail Cap typed on
the form as **Allied 5 / Axis 1** (the defaults were 2 / 2), seeds map 9111 / OOB 9112 / deployment 9113 / rules 9114.

| Row | Step | Observed | Screenshot |
|---|---|---|---|
| RAIL-11 | New Game form | Allied Rail Cap 2, Axis Rail Cap 2 (0.4 per division: 6 attacking and 4 defending divisions); help "SP or RE each side can move by rail every Movement Phase (13.3b), from the map edge to its railhead; trucks carry supply on to the front. Default: 0.4 point per division." | |
| RAIL-11 | Preview after typing 5 / 1 | Preview metrics "Rail Cap: Allied 5 · Axis 1" | `01-preview.jpg` |
| RAIL-12 | Turn 1, Allied Movement, a unit at the station 0720 | Unit tab "Rail from 0720 · Rail Cap 5 of 5 left this Movement Phase", both units in the hex with their cost (1 each), 12 stations highlighted on the map and listed with their distance | `02-rail-unit-ready.jpg` |
| RAIL-12 | Ticked Oden TF / 4.A, moved the map cursor to 0202 and pressed Enter | "Costs 1 of 5 Rail Cap left"; Move by rail → "Moved 1 unit by rail from 0720 to 0202 for 1 Rail Cap." (1,251 ms from the map key press to the result, including the cursor walk); the unit is drawn at 0202 | `03-rail-unit-done.jpg` |
| RAIL-13 | The rest of Game Turn 1 | Allied and Axis player turns ended through the page with the hand-overs it asked for; now "Turn 2 / 4". The Axis side took no actions of its own in this run | |
| RAIL-14 | Turn 2 arrivals placed at the entry 0123, then Movement | The new SP's rail panel: "Rail Cap 5 of 5 left … this turn's arrivals may entrain here (20T) 13.6b" (0123 is not a village: only this turn's arrivals may entrain there) | `04-rail-sp-ready.jpg` |
| RAIL-14 | 8 Tokens to 0907 | "Costs 2 of 5 Rail Cap left" → "Moved 8T by rail from 0123 to 0907 for 2 Rail Cap." | `05-rail-sp-done.jpg` |

## Issues found in the run

| Issue | Status |
|---|---|
| The first run showed the rail panel unstyled: check boxes, labels and the destination list ran together ("1 Rail CapDetrain at") | Fixed (`web/command-deck.css` rail rows); the screenshots above are from the run after the fix |
| A unit picked from the roster does not pan the map to it, so its rail destinations can be off-screen (the highlight at 0907 was visible here, 0202 was not) | Open, not blocking: the destination list in the panel names every station with its distance. The map not following a roster pick predates Rail Cap |
| Only about 4 seeds in 10 start an Allied unit on a station it can entrain from; otherwise the player first moves a unit (at most half its MA, 4.7d) to a station. The map marks the player's rail Supply Sources (RAIL tags) only with the Trace Supply overlay on, and those are not exactly the cargo stations (13.3c: Extenders count for trace, not for cargo) | Open, recorded: no overlay names the stations cargo can entrain from |
