# Artillery on current main

## Source and scope

ACT-18, ACT-19 and BOT-12 were exercised again after rebasing the artillery feature onto main
`50eff97e1b7bb4e626bea495cdf74e3342703913`. [source-files.json](source-files.json) identifies the observed rebased
commit and exact working source hashes. The feature's original commit is retained on
`backup/artillery-before-main-rebase`. The rebase had no textual conflicts and preserves upstream heuristic@79,
rail/HQ/truck changes and query APIs. This run adds no strategy version or strength claim and runs no 80-game comparison.

Typecheck initially found the new required `BotActionAccess.drawReach` missing in the facility test context.
The test adapter now delegates to the real `queryDrawReach`, matching upstream tests. The current policy description
names version 79. Three narrative comments were removed without executable changes. [review.json](review.json)
records independent review with no remaining semantic findings. Prior evidence folders remain unchanged.

## Inputs and boundaries

The visible New Game form previews and starts Western Europe with a flank sea, 18×12, Standard scale, three divisions
per side with one armored division, Standard air, no air transport, three turns and seeds 5101/5102/5103/5104.
Preview and started menu both show 57 units, six formations, two ports and three objectives worth eight VP.
A foot division makes a legal move, and that same generated package completes both Player Turns, pending decisions,
hot-seat handoffs and the next first-player decision. It reaches Turn 2 Axis Reinforcement without a pending decision
or handoff. This is separate from the arranged training saves.

Fresh training saves use the rebased generator and inputs in [inputs.json](inputs.json), with two Allied 17-point guns
and a 40T dump at 0504 beside the Axis-held target at 0503. Training uses rules RNG seed 48. The computer port begins
at two hits; the base begins at Level 3. Human mixed positions offer all three target kinds. Computer playback is paused
through its normal UI control, and each Step dispatches an accepted action. Save/replay loading follows an additional
accepted action, so the check restores changed state rather than comparing an unchanged screen.

Reproduce after `npm run build` with fresh artifact output folders:

```sh
node scripts/artillery-facility-position.mjs artifacts/artillery-main-rebase/positions
node scripts/artillery-facility-computer-acceptance.mjs artifacts/artillery-main-rebase/computer artifacts/artillery-main-rebase/positions
node scripts/artillery-facility-acceptance.mjs artifacts/artillery-main-rebase/human-1920 artifacts/artillery-main-rebase/positions 1920 1080
node scripts/artillery-facility-acceptance.mjs artifacts/artillery-main-rebase/human-1680 artifacts/artillery-main-rebase/positions 1680 1050
node scripts/artillery-facility-restrictions.mjs artifacts/artillery-main-rebase/positions artifacts/artillery-main-rebase/reasons-1920 1920 1080
node scripts/artillery-facility-restrictions.mjs artifacts/artillery-main-rebase/positions artifacts/artillery-main-rebase/reasons-1680 1680 1050
```

## Expected and observed

All 51 mounted UI checks pass, with zero console/page errors. Human operation passes 14/14 at each supported size,
computer operation passes 7/7, and diagnostics pass 8/8 at each size. The `*-results.json` files retain every observation.

Human and computer attacks choose explicit PORT or AIR_BASE targets and pay the displayed 4T at strength 34.
Die 6 gives two port hits or reduces the base from Level 3 to Level 1. Aircraft checks 6/1/3 cost KG 51 Ju.88 one step.
Unrelated targets remain unchanged. Selecting one 17-point gun changes Combat Units cost 3T to facility cost 2T.
Both human sizes restore the mixed-base save/replay hash
`sha256:9145f9c4d79390ee393b9a2af5e912e29ac550850767203870a332c23552c108`.
The computer port restores `sha256:fb2db87a81bd04d13e962988afc6bc1bc799c1807ef9bd3f83b746a0e71f0f42`;
its base restores `sha256:7c2c2c184b769343ec0e290fc59fbea7865c5aea579bf44cc6578fc7d55bc7cf`.
Final restored attacks are Turn 1 Allied Combat Barrage, revision 2, without a pending decision or active transaction.

Range, supply, already-fired artillery and already-barraged target hexes produce the correct cause in both hints.
Multiple rejected attempts retain multiple causes. A legal second gun or target still opens an enabled draft,
including target 0605 while 0503 is already barraged. Movement disallows artillery. Diagnostics finish at revision 0
after cancelling the alternative draft. No blocking product issue was observed.

## Visual and quality verification

Reviewed the computer preview and declaration/result images, the 1920 mixed-base result, the 1680 mixed-base draft/result,
and both diagnostic sizes under `artifacts/artillery-main-rebase/`. The 57-unit preview reflects current generation.
Target selector, 1d6 table, cost, selected guns, action controls and human result card are legible and remain in the viewport.
Computer Log shows the target, payment and actual facility/aircraft effects. Both no-supply hints wrap without clipping;
the alternative-target draft retains its controls alongside the map. Screenshots and large saves/replays remain gitignored.

The final suite passes 798 tests with 8 existing skips; typecheck, build and smoke pass.
[checks.json](checks.json) records commands, elapsed times and exit codes. [initial-typecheck.log](initial-typecheck.log)
preserves the missing test-adapter member and is not a successful check. No test threshold was relaxed.
[timings.json](timings.json) and the human observations retain screenshot intervals and click-and-settle times, including
scripted waits and concurrent checks. They are not isolated latency measurements or evidence of a performance change.
