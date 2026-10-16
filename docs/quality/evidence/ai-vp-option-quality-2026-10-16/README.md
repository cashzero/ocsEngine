# Attacker VP option quality and recorded continuation

Candidate 74 on base `716bac9d14a140df44f544e9e90c9b8d229ea2e4` changes only
attacker combat options on unheld objectives: take all option points as losses if
own surviving steps exceed that loss. Owner-only projected surviving steps avoid
relying on bot memory or enemy hidden state. Standard defense and advance guards
are unchanged. This is a quality/local continuation record, not promotion evidence.

The first frozen quality stops at typecheck exit 2: new test literals used plain
strings instead of branded HexId/PlayerId. Correcting only test types preserves
identical production source/build hashes. The corrected freeze passes full quality:
748 tests/eight skipped, typecheck/build/smoke, full suite 151.04 seconds. Both first
and corrected records are retained; no quality retry overwrites either run.

Replayed all eight known Eastern attack games 1300300–1300307 (32×24, six divisions,
two armored, no air, eight turns; candidate 69 development data). Six instances
show a retreat from a VP attack when paying the option still leaves attackers alive
and the printed defender result can clear its remaining steps. These are supporting
local observations, not proof of a full-game benefit.

At match 1300304 revision 662 (turn 8 COMBAT), result Ao1/DL1o1, the attackers have
2 steps and the defender 2. Both continuations use one candidate engine and frozen
standard 66 on the defending side. Standard attacker chooses option:0:1 and retreats,
leaving 3-VP 1,14 Allied. Candidate chooses option:1:0, survives and legally advances,
leaving 1,14 Axis. Both complete the active transaction without illegal actions.
Owner projection reports two remaining steps; defender projection reports null.
`branch-results.json` contains only observations and final state hashes; raw action
traces/snapshots remain ignored under `artifacts/ai-vp/`.

Before any candidate-74 matches, main advanced to `2528b6d` and promoted standard
75. This old-base result is not reused as current candidate acceptance. The rebased
option change is candidate 76 against frozen 75 and requires fresh full quality and
measurements. No UI acceptance statuses change.
