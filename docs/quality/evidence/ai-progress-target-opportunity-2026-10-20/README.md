# Target reassignment and executable movement witnesses

This exploratory mechanism study uses all twenty-four observed next moves from
the fifteen existing WESTERN attack single-decision comparisons. Six histories
without another same-unit move remain censored. Terminal local effects and target
switch counts were already known. These next moves occur at different times, so
this study fits no predictor and makes no new VP improvement claim. No new match,
seed, map, policy variant or tuned weight is introduced.

The source checkout is `98ccd29`. The retained historical engine has digest
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`, identical to the
prior studies. Renamed map-style identifiers in current source do not regenerate
the historical initial snapshots. The [registration](registration.json) binds
the twenty-four cases and fifty-seven input, source, protocol and probe files.
The [protocol](protocol.md) fixes the cohort, opportunity distinctions, controls
and descriptive use. Factual1800000 was inspected as a pilot before freezing the
full extraction; that disclosure is in the registration. No outcome-dependent
case or time selection follows the pilot.

The reusable [probe](../../../../scripts/ai-progress-target-probe.mjs) reconstructs
each prefix from the original initial snapshot, with original seat seeds,
axis30/allied15 and only the original single15 call in counterfactual arms. It
requires every action and intent to match the historical trace. Independent rules
replay must match each dispatch's complete events and state hash. The selected
decision must match the prior next-move pre-state hash. All twenty-four prefixes
match, with 4,354 accepted actions and zero errors or rejections in the final run.

Phase memory matters. The runner creates a fresh plan for each
gameTurn:playerTurnIndex:phase:segment, and an HQ decision may initialize it long
before the observed combat-unit move. The probe captures the actual initial plan
and selected decision memory. Node Inspector breakpoints read the unmodified
planner's pre-greedy wanted/pair/assignment tables and each executed greedy
assignment. The probe neither copies the planner nor changes production source.
Main-effort membership is retained separately. The checker replays the captured
table order and capacity checks to reproduce every captured greedy assignment.

The seven changes while the old target is still Allied-held have these allocation
mechanisms:

| Mechanism | Cases | Recorded evidence |
|---|---|---|
| ASSAULT reservation | 1800000-0, 1800008-1, 1800016-0, 1800028-0 | Actual effort membership and pre-greedy assignment |
| New pair ranks earlier | 1800004-0 | HUNT 10,16 scores 2.5455 versus old CAPTURE 11,13 at 2.3333 |
| New pair ranks earlier | 1800014-1 | CAPTURE 7,11 scores 2.4000 versus old 3,14 at 1.4545 |
| Old target capacity is full | 1800020-1 | Old CAPTURE 11,17 has count4 and limit4 when visited; later assigns -4,13 |

Arm0 is factual30. Arm1 uses the single15 intervention followed by axis30/allied15.
These allocation scores are not movement scores or evidence that an allocation
is strategically better. The relevant plan initialization and move indices are
both retained in [results](results.json).
The capacity counter in 1800020-1 counts four greedy CAPTURE assignees. It excludes
four preassigned ASSAULT members, so the original target has eight total assignees
in that plan. Four of four is the greedy slot count, not the total unit count.

Four of the seven actual moves still reduce distance to the original target,
two leave it unchanged, and one increases it. Six original targets are still
assigned to other units in their actual step plan. A changed per-unit target is
therefore not a direct measure of wasted distance progress or army abandonment.
This does not prove that every reassignment is beneficial or that reassignment
could never have predictive value.

At each exact pre-move state, the probe uses the real gateway with the existing
400-candidate budget and retains its truncation. It separately queries movement
range. Offered routes that enter the original target or end adjacent to it receive
actual draft validation. A supply-preserved witness requires allowed=true and
zero values for relocationTraceLost, relocationFeedLost and
relocationOtherTraceLost. Missing facts do not count as zero. All 235 reported
routes are checked again independently from the raw pre-decision snapshots.

All seven old targets have a visible enemy combat unit. None has a supply-safe
offered route ending on the old target. Four have at least one supply-safe route
ending adjacent. Adjacency is not a legal attack, paid combat supply, capture or
retention. Absence of a witness is not proof that every route, an earlier mode or
fuel decision, or a later combat plan is impossible. Actual returned range routes
are retained separately from the budgeted candidate list.

Across all twenty-four observations, eleven units are assault-reserved and
thirteen receive executed greedy assignments. Eighteen moves approach the old
target, three preserve distance, and three move away. Twenty-three original
targets still have an assignee. Fourteen observations have a safe adjacent
witness. The three observations with a safe route ending on the old target all
already have Axis control there; they are not new capture opportunities. One
query is truncated, factual1800026 in GameTurn5, outside the seven enemy-held
switches. It remains in the census with its limitation.

The [checker](../../../../scripts/ai-progress-target-check.mjs) validates frozen
inputs and engine, every raw snapshot hash, actual source actions, plan tables,
query output and route supply facts. Its [checks](checks.json) reject altered
copies with a wrong original target, wrong actual selected action, or a genuine
unsafe route falsely marked safe. Real inputs stay unchanged. Supplemental
queries preserve the actual session snapshot, including rules RNG, and bot
memory. Bot RNG is created per decision from seat seed, hash and ordinal; gateway
queries do not access context.rng. No direct bot-RNG-object comparison is claimed.

The initial passivity guard checked independent replay state rather than the live
queried session. The [decision trail](decisions.tsv) records the correction. The
producer now compares the actual serialized session before and after queries,
also requiring it to equal independent replay. Repeating all twenty-four prefixes
with this stronger guard reproduces every non-provenance output field exactly.
There are 4,354 actions in each full prefix pass, plus 170 in the pilot, totalling
8,878 regenerated accepted actions. These are repeated prefix verifications of
existing histories, not 8,878 games or independent observations. Runtime was not
measured as a performance metric. Both complete passes and the pilot terminate
successfully with no stderr errors.

Raw planner tables, memory, movement reports, route lists and snapshots remain in
ignored artifacts. Compact results bind each case and compressed raw file by hash.
Restore registered histories and the retained engine before rerunning. For example:

```sh
node scripts/ai-progress-target-probe.mjs --engine artifacts/ai-progress-objective-goal-continuity/engine --case 1800000 --arm 0 --out artifacts/ai-progress-target-opportunity/cases/1800000-0.json
node scripts/ai-progress-target-check.mjs artifacts/ai-progress-target-opportunity artifacts/ai-progress-objective-goal-continuity/engine
```

Run the first command for every case in registration before running the checker.
The [independent review](review.md) covers sources, measurements, controls,
documentation, comments and the decision trail. The [topic document](../../../ai/vp-metrics.md#progressobjective-改派與實際路線機會)
owns interpretation and the next bounded research direction. Default15, policy85,
promotion status, supply audits and product-operation acceptance are unchanged.
The overall VP predictor research remains open.
