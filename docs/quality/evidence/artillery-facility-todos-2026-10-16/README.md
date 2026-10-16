# Artillery facility TODO acceptance

## Scope

This run exercises ACT-19 and BOT-12 in the mounted Chromium application. Computer operation passes 7 checks;
artillery diagnostics pass 8 checks each at 1920×1080 and 1680×1050. All three runs have zero console or page errors.
The base commit is `cb17ae2e9cf99b379c35475c4410db8e46222e42`, with uncommitted sources identified by
[source-files.json](source-files.json). Acceptance status belongs to [the product operation plan](../../03-product-operation-verification-plan.md).

The user explicitly excludes 80 games from this feature task with "等下 這個不用測試80場吧".
The partial comparison is CANCELLED, not PASS. Eight completed saves and twelve traces remain with the frozen build and
registration in `artifacts/facility-todos/candidate/comparison`; no partial result is used as strategy-strength or gate evidence.
[Cancellation](comparison-cancellation.json) records the stopped processes and retained files. The standard remains heuristic@75.

## Inputs and operation

The New Game form changes the default Map/OOB to Western Europe with a flank sea, 18×12, Standard scale,
three divisions per side with one armored division, Standard air, no air transport and three turns.
Seeds are map/OOB/deployment/rules 5101/5102/5103/5104. The preview shows 55 units, six formations, two ports and
three objectives worth eight VP. Start uses that same previewed package. A foot division makes a legal move, then the
same New Game completes both Player Turns, pending decisions, hot-seat handoffs and the next first-player decision.
The screenshot ends at Turn 2 Axis Reinforcement, with no pending decision or handoff; the five arrivals belong to Turn 2.

Focused attacks load explicitly arranged saves through the visible menu. Two generated 17-point Allied artillery units
and a 40T dump stand at 0504 next to the enemy target at 0503. The port starts at two hits, or the enemy base starts at
Level 3 without a port in its hex. Both seats are computers and the rules RNG seed is 48. These arranged positions are
separate from the unmodified New Game. The normal Pause button stops playback at the loaded revision; Step runs one
accepted computer action at a time. Draft previews for both guns and each singleton supply the displayed price, then
Cancel discards the preview before the computer chooses its own target and participants.

Reproduce after `npm run build`, using fresh artifact folders:

```sh
node scripts/artillery-facility-position.mjs artifacts/facility-todos/positions
node scripts/artillery-facility-computer-acceptance.mjs artifacts/facility-todos/computer-browser-final artifacts/facility-todos/positions
node scripts/artillery-facility-restrictions.mjs artifacts/facility-todos/positions artifacts/facility-todos/reasons-1920-verified 1920 1080
node scripts/artillery-facility-restrictions.mjs artifacts/facility-todos/positions artifacts/facility-todos/reasons-1680-verified 1680 1050
```

## Expected and observed results

| Operation | Expected | Observed |
|---|---|---|
| Computer attacks a worthwhile port | Explicit PORT target, legal Facility Table cost and port-only effects | Both guns, strength 34, 4T paid, die 6, two new hits to four; base level unchanged |
| Computer attacks a worthwhile Air Base | Explicit AIR_BASE target, legal cost, base and individual aircraft effects | Strength 34, 4T paid, die 6, Level 3→1; aircraft checks 6/1/3; KG 51 Ju.88 loses one step; port unchanged |
| Change state after each attack, then load its save and replay | Restore the attack result rather than merely inspect unchanged current state | One additional accepted computer action precedes each load; both restored hashes match the original |
| Port save and replay | Identical final hash | `sha256:270c17fd26545796b439091a3a600b4cadf38d9f7334619b172fcf612526e9ec` |
| Base save and replay | Identical final hash | `sha256:ba929f83d26e8e88489be8783f6d810b5a3cc54aaa1663b1a1a17fadcf29bdac` |
| Out-of-range, no-supply, fired-unit and used-hex positions | Both hints name actual rule-owned causes | Each required cause appears in both phase objective and Targets, at both sizes; mixed rejected attempts retain multiple causes |
| Another gun or target remains legal | Open an enabled barrage draft without a global blocker | Both variants open a legal draft; other-target case offers 0605 while 0503 is already barraged |
| Movement restriction | No artillery attack in Movement | No target button, barrage highlight or draft for 0503 |

The computer runs finish after replay restoration at Turn 1 Allied Combat Barrage, revision 2, with no active transaction
or pending decision. The final diagnostic run ends after cancelling the legal 0605 draft, revision 0.
Detailed observations are in the three `*-results.json` files. [Timings](timings.json) record screenshot intervals;
these include scripted waits, generation and other operations and are not isolated latency measurements.

## Screenshots and observed issues

Reviewed `computer-browser-final/01-changed-new-game-preview.jpg`, `02-changed-new-game-whole-turn.jpg`,
`04-port-only-declaration.jpg`, `05-port-only-computer-result.jpg` and `09-base-only-computer-result.jpg` under
`artifacts/facility-todos/`. The preview counts and map differ from defaults; the complete-turn view shows the next
turn's arrivals. The computer declaration displays the real 4T pending payment, then Log displays the chosen target,
facility die and distinct effects. The port badge and base level change agree with the saved state. Computer results
are inspected in Log, which is the existing computer workflow.

Reviewed the range and fired-unit messages at 1920×1080, and no-supply and alternate-target views at 1680×1050 in
`reasons-1920-verified` and `reasons-1680-verified`. Both hints wrap readably, the map remains visible, and the legal
0605 draft keeps its participant and Barrage/Cancel controls in the viewport. No blocking product issue remains.

An initial computer driver assumed a paused save also paused playback and looked for a human-only result card.
It was corrected to invoke Pause through the UI and inspect the computer's Log. A later diagnostic driver read before
an asynchronous draft render, producing a false failure even though its screenshot showed the legal draft. It now
waits for the actual draft before asserting. Those attempts remain in artifacts and are not counted as successful runs.

## Supporting checks

[checks.json](checks.json) records the final typecheck, complete regression suite, build and distribution smoke check.
The suite passes 792 tests across 111 files, with the existing four skipped files and eight skipped tests.
Facility AI tests cover the six printed outcomes, zero-effect and uneconomic shots, better ground attacks, hidden aircraft,
current-turn ration timing, a safe alternative dump and real Session payment/save/replay. Typed diagnostics tests cover
multiple causes, alternative legal choices and unavailable viewers/handoffs. Independent reviews have no open blockers;
[reviews.json](reviews.json) records their scope.

The previous full run passed 791 tests and failed the architecture boundary check because AI imported port constants
from rule state. [The failure](boundary-failure.log) is preserved. Constants moved unchanged to the printed tables and
all callers migrated; the architecture/facility focused rerun passes 38 tests, and the final complete rerun passes.
An earlier interrupted full run ended with signal 143 and supplies no completion evidence. No timeout, architecture
rule or acceptance threshold was relaxed. Screenshots, large saves, traces and the cancelled build remain gitignored.
