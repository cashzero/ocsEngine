# Artillery on assault-planning main

## Source and integration

The artillery feature is rebased onto main `e6539dfbbe45f2fee202619c54033e0937b04a29`.
[source-files.json](source-files.json) identifies the exact tested sources and observed commit.
The original feature is retained on `backup/artillery-on-50eff97`.

Text conflicts occurred in the heuristic and its topic document. Resolution keeps upstream assault planning,
`effortHexes`, ground `supplyPrice`, printed-table forecasts and the default candidate heuristic@82. Accepted standard
heuristic@79 remains unchanged. Facility forecasts, full-cost supply valuation and ration safeguards retain their prior
behavior. The facility test adapter uses the real new `queryAttackStrength`, matching upstream test adapters.
[review.json](review.json) records independent review with no blocking semantic findings or introduced suppressions.
No 80-game comparison or strategy promotion is part of this run.

## Actual UI operation

BOT-12 passes 7/7 checks in mounted Chromium at 1920×1080, with zero console/page errors or computer stall.
The form changes Map/OOB to Western Europe, flank sea, 18×12, Standard scale, three divisions per side with one armored
division, Standard air, no air transport, three turns and seeds 5101/5102/5103/5104. Preview and started menu both show
57 units, six formations, two ports and three objectives worth eight VP. That same generated package makes a legal
infantry move and completes both Player Turns, pending decisions, hot-seat handoffs and the next first-player decision.
It reaches Turn 2 Axis Reinforcement with no pending decision or handoff.

Separate fresh training saves arrange two 17-point Allied guns and a 40T dump at 0504 beside target 0503, rules RNG 48.
The computer independently selects PORT or AIR_BASE, both at strength 34, pays the displayed 4T, and rolls facility die 6.
The port gains two hits from 2 to 4; the base loses two levels from 3 to 1. Aircraft checks 6/1/3 cost KG 51 Ju.88 one step.
Unrelated targets retain their state. A further accepted computer action precedes each actual save and replay load.
Both restored hashes match the original, recorded in [computer-results.json](computer-results.json):

- Port `sha256:fb2db87a81bd04d13e962988afc6bc1bc799c1807ef9bd3f83b746a0e71f0f42`.
- Base `sha256:7c2c2c184b769343ec0e290fc59fbea7865c5aea579bf44cc6578fc7d55bc7cf`.

The run ends after base replay restoration at Turn 1 Allied Combat Barrage, revision 2, without an active transaction
or pending decision. [computer-log.md](computer-log.md) records the visible action sequence.

Reproduce after `npm run build` with fresh output folders:

```sh
node scripts/artillery-facility-position.mjs artifacts/artillery-main-latest/positions
node scripts/artillery-facility-computer-acceptance.mjs artifacts/artillery-main-latest/computer artifacts/artillery-main-latest/positions
```

## Verification boundary and screenshots

This rebase changes AI integration; the UI, artillery resolution/payment and mounted driver files listed in
[review.json](review.json) are byte-identical to the previously verified feature. The existing human and two-viewport
ACT-18/ACT-19 evidence remains in [the prior integrated run](../artillery-main-2026-10-16/README.md).
This run directly exercises the changed computer path and the full New Game turn rather than inferring it from tests.

Reviewed the preview, whole-turn, computer declaration and base-result images under
`artifacts/artillery-main-latest/computer/`. The changed 57-unit preview, complete-turn arrivals, 4T pending payment,
chosen target, facility roll and aircraft effects are visible and legible. The computer is paused using its normal
Pause control and advanced using Step. Screenshots, saves and replays remain gitignored. No blocking product issue
was observed. [timings.json](timings.json) records a screenshot interval including scripted waits and concurrent tests,
not isolated input latency or a performance change.

The complete suite passes 799 tests with eight existing skips. Typecheck, build and smoke pass;
[checks.json](checks.json) records all commands, exit codes and elapsed times. No test or acceptance threshold changed.
Prior immutable evidence is preserved unchanged.
