# Artillery facility acceptance

ACT-18 exercised the mounted Chromium application at 1920×1080 and 1680×1050. Both feature runs passed 14 checks.
The separate restriction run passed six checks. Console and page errors were zero in all three runs.
The base commit is `cb17ae2e9cf99b379c35475c4410db8e46222e42` with uncommitted changes identified by
[source file hashes](source-files.json). [Check results](checks.json) record the automated and independent reviews.

## Inputs and operation

The New Game form changed the defaults to Western Europe with a flank sea, 18×12, Standard scale, three divisions per side
with one armored division, Standard air forces, no air transport, three turns, and map/OOB/deployment/rules seeds
5101/5102/5103/5104. Its preview showed 55 units, six formations, two ports and three objectives worth eight VP.
The started game's menu matched those inputs and counts. A foot division legally moved from 0504 to 0404.
The same generated package completed both Player Turns, the required hot-seat handoffs and the next turn's first-player
choice. It stopped at Turn 2 Axis Reinforcement with no pending decision or handoff. The five arrivals belong to Turn 2.

The focused attacks then loaded explicitly arranged training saves through the visible menu. These saves preserve the
generated map and counter ratings while placing two Allied 17-point artillery units and a 40T dump at 0504, beside an
Axis-held port at 0503. Variants put an Axis Level 3 base and its aircraft there, or leave the port or base alone.
The training rules RNG seed is 48. These attacks are separate from the unmodified New Game turn.

Reproduce after `npm run build`:

```sh
node scripts/artillery-facility-position.mjs
node scripts/artillery-facility-acceptance.mjs artifacts/artillery-facility/browser-1920-final artifacts/artillery-facility/positions 1920 1080
node scripts/artillery-facility-acceptance.mjs artifacts/artillery-facility/browser-1680 artifacts/artillery-facility/positions 1680 1050
node scripts/artillery-facility-restrictions.mjs artifacts/artillery-facility/positions artifacts/artillery-facility/restrictions-final
```

Use fresh output folders for a rerun. Screenshots and full saves remain in the gitignored `artifacts/` tree.

## Expected and observed results

| Operation | Expected | Observed |
|---|---|---|
| Select a port-only or base-only enemy hex | Explicit facility target without requiring a ground defender | Port and Air Base each offered at 0503 |
| Switch targets in a mixed hex | Combat units, Air Base and Port retain the selected artillery and update the preview | All three choices operated; combat preview used 2d6 and shifts, facilities used 1d6, no shifts and no required spotter |
| Change the target with one 17-point unit selected | Different tables use their own supply costs | Combat units cost 3T; the port costs 2T |
| Fire 34 points at the port and pay the displayed cost | 4T, one facility die, numbered port damage only | Dump 40T→36T; die 6; port 0→2 hits; base, aircraft and ground units unchanged |
| Fire 34 points at the base | 4T, one facility die, separate enemy aircraft checks, base floor Level 1 | Dump 40T→36T; die 6; base Level 3→1; aircraft checks 6/1/3; KG 51 Ju.88 lost one step; other aircraft unchanged; port and ground units unchanged |
| Save/load and export/load replay after the mixed-base attack | Identical final state | All three hashes equal `sha256:1d50c7f507bbb6688a151a1173ebdbfd8dc10a51e90e891ffe916f67055f7714` |
| Load Movement, out-of-range, no-supply, used-hex and used-unit positions | No legal facility attack through map or Targets | No orange barrage highlight, target button or artillery draft at 0503 in each case |

The feature runs end after restoring the mixed-base replay at Turn 1 Allied Combat Barrage, revision 2 in the downloaded
save, with no active transaction or pending decision. The restriction run ends on the used-unit position at revision 0.
The UI does not print mid-game revision; these revisions come from downloaded saves and the load notices.

The operation records retain elapsed click-and-settle intervals, including the scripts' fixed waits and supply choices.
The four final 1920 intervals were 678/665/698/671 ms. The 1680 intervals were 2313/1504/1533/1124 ms while the full test
suite also ran. These single-run values are not isolated UI latency measurements or evidence of a performance change.
Every timed attack produced the expected saved damage and payment; no rejection was counted as a successful attack.
No performance gate is promoted by this run.

## Screenshot review and issues

Reviewed the New Game preview, complete-turn view, port-only draft/result and mixed-base draft/result at 1920×1080,
including `artifacts/artillery-facility/browser-1920-final/12-mixed-air_base-preview.jpg` and
`13-mixed-air_base-result.jpg`. The facility target, 1d6 table, column, supply, artillery checkboxes and Barrage/Cancel
buttons are legible. The port's damage badge appears after the attack. Base reduction and aircraft loss appear in both
the result card and Log. The map remains visible alongside the command deck.

Reviewed `artifacts/artillery-facility/browser-1680/08-mixed-port-different-supply-cost.jpg`,
`12-mixed-air_base-preview.jpg`, `13-mixed-air_base-result.jpg` and `03-new-game-whole-turn.jpg`.
The narrower view retains the target selector, 2T/4T costs, participants, action controls, result, phase and End controls
inside the viewport. The final turn view shows the next turn's arrival list without an unanswered first-player choice.
Restriction screenshots `01-movement.jpg` and `03-no-supply.jpg` show the absence of a barrage draft after selecting 0503.

No blocking usability or correctness issue remained. The nonblocking empty-list hint incorrectly says targets are out of
range when the cause is supply or previous firing; this is tracked as `barrage-empty-reason` in the TODO inventory.
Computer facility-target scoring remains `bot-facility-barrage` and is outside this human-operation row.

An earlier script attempt used the removed Mediterranean theater select option; it timed out before generating a game.
Another restriction-script attempt loaded the training save over a different scenario and was correctly refused.
The successful scripts use the current theater/sea controls and create the matching scenario before loading.
These were test setup corrections, not successful product runs.

## Supporting checks

Typecheck, build and distribution smoke check passed. Focused facility and air tests passed 51/51, including legacy
implicit targets, old air transaction hashes/logs, canonical aircraft order, costs, limits, cancellation and persistence.
The full suite with two workers passed 766 tests across 109 files; four files and eight tests retain their existing skips.
The first default-parallel run had two 15-second timeouts and a stale manifest-status assertion. The manifest was corrected
and the complete two-worker rerun passed. No test timeout or acceptance threshold was relaxed.
Independent review's zero-strength air log and aircraft ordering findings were corrected; its final verdict had no
remaining actionable correctness findings and no comment findings.
