# Current-turn supply payment audit

This retrospective instrument study tests whether the prior original-target
Combat-entry legal attack observation omitted this turn's fuel, recovery or
rations. It reuses fifteen fixed WESTERN attack progressObjective forks, two
first decisions and two existing future-dice histories, sixty histories total.
All terminal outcomes were already known. There are no new games, policy calls,
maps, weights, dice streams or predictive fits. Histories and payments share
prefixes and are not independent observations.

The source checkout is `1be8d57614822ed7ee6e6d0a3219a320150f99d6`.
The retained historical engine tree digest is
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
No current engine build is substituted. The [registration](registration.json)
binds 185 input and instrument files, including all source histories, earlier
Combat observations, the prior full-history replay records and registrations,
the [protocol](protocol.md), [design](design.md), and extraction script.
The registration validates previous input hashes before binding them again.

The [audit](../../../../scripts/ai-theater-supply-audit.mjs) replays from the
original initial state through the intervention's first same-player-turn
COMBAT/COMBAT entry. Original arms use their existing recorded action streams.
Replacement-dice arms first replay the original prefix to the known physical
fork, then prove that their recorded tail initial snapshot changes only
rng.state and preserves past draws. The correct original first decision is
required. Full terminal replay evidence is reused by exact bound input hashes;
this audit does not replay the remainder of each game again.

Payment collection covers the whole intervention player turn, including actions
before the fork. For each PAY_FUEL, RECOVER_INTERNALS or CHECK_SUPPLY, the audit
checks the actual rule cost against physical source quantities before and after
the action. Fuel emits FUEL_PAID rather than SUPPLY_SPENT. Recovery retains its
ordered payment plan; ration cost uses the actual grouped consumers. All resource
quantity, owner and location changes are also retained, so transfers and captures
are not silently called expenses. Physical stock, active combat reservations and
later consumption remain distinct.

The audit reconstructs all lifecycle transitions within the actual Supply-exit
and Combat-entry containing actions. It compares complete regenerated events and
the full canonical final state after only the outer revision increment. Its
initial pilot attempted this reconstruction on unrelated first-player decisions
and failed on RESPOND_DECISION. This was an instrument assumption error. The
implementation was corrected to the two named boundary containers before cohort
extraction. Every other prefix action
still goes through the real rule engine. The original failure log remains under
ignored artifacts. Internal entry states retain their pre-dispatch revision and
are query-only, not resumable gameplay checkpoints.

Pilots use pair 1800026 for its known second-turn ration and pre-fork fuel, and
pair 1800010 for an existing nonzero strength difference. Their eight histories
replay 1,128 recorded actions and yield eight target witnesses. The final script
is frozen before the complete cohort. The late-fork case pays 23T fuel and 1T
ration in each of its four histories. This is evidence that starting a payment
ledger only at the fork would omit real current-turn costs.

The [results](results.json) contain all sixty entries. Extraction replays 4,800
recorded actions, observes 388 payment actions and reconciles 1,476T fuel plus 4T
rations. There are 244 payment actions before their respective forks. No cohort
recovery payment is observed; zero is retained rather than filled from another
turn. Every query uses budget 200 and none is truncated. There are ten original
and ten replacement-dice original-target attack witnesses. All thirty original
boundary hashes, action vectors, settlements and best offered strength values
match the existing instrument. Comparing each first decision across the two
dice histories gives thirty unchanged best-strength values.

Each witness validates a REGULAR DECLARE_COMBAT on the fixed original target and
settles its attacker choices jointly through settleDeclaredAttackerSupply. Feed
coverage is queried for each concrete unit, retaining divisional HQ restrictions.
Queries and explanations preserve full state and RNG. A repeat query after
read-only accounting is identical. Candidate absence describes the offered set;
the generator does not exhaust all force subsets or source allocations. No
declaration stock requirements are added across alternative declarations.

The result rules out an extra metric that subtracts the same already paid
current-turn costs at this Combat boundary. The existing legal-attack instrument
already sees post-payment stock and updated unit state. It does not establish
optimal earlier resource allocation, next-turn ration preservation, future
defense funding or joint feasibility across multiple targets. Those require
different commitments and an earlier planning boundary with legal chronological
action witnesses. The existing capability's invariance across these two dice
histories also does not remove the separately observed terminal-effect variation.
No new VP predictor or strategy is qualified by this audit.

The separate [checker](../../../../scripts/ai-theater-supply-check.mjs) replays
all sixty prefixes again, independently reconciles every resource change and
receipt, regenerates both internal boundaries, verifies all target queries and
settlements, and recomputes cohort counts and cross-dice strength equality.
Its [record](checks.json) includes four semantic altered-copy controls. They are
not satisfied merely by a changed file digest.

- Duplicating a settled payment fails chronological uniqueness.
- Increasing both before and after stock consistently fails binding to actual
  reconstructed physical stock.
- Replacing the internal Combat segment by BARRAGE fails boundary identity.
- A real three-attacker declaration from match 1800001 action 67 is legal, while
  reducing its shared dump to 2T leaves all singleton declarations legal but
  rejects the joint settlement. This prevents independent reuse of the same SP.

An additional real declaration control proves that attacker reservation leaves
physical stock unchanged and reduces available tokens by 3 exactly once. A
separate recorded recovery at action 553 of the same source history spends 2T
and matches its ordered rule plan. The extra control prefixes replay 67 and 553
actions respectively, followed by their tested actions. They are instrument
controls, not new games or additional cohort observations.

The authoritative checker process, its exit status and elapsed time are in
[check-process.json](check-process.json). It produces no stderr. Extraction
latency has no acceptance threshold and was not separately instrumented. The
evidence does not claim a performance improvement. Full snapshots, receipts,
queries and original failure logs remain ignored under
artifacts/ai-theater-supply-audit/. Every result binds its raw file by SHA-256.

With registered raw inputs and the retained historical engine restored, rerun
analysis and verification with these commands.

```sh
node scripts/ai-theater-supply-audit.mjs run
node scripts/ai-theater-supply-check.mjs
```

Use a fresh output root and the bound protocol and design when creating another
registration. The [independent review](review.md) covers accounting, boundary
identity, hashes, controls, claims and the [decision trail](decisions.tsv). The
[owning proposal](../../../ai/theater-supply-plan.md#現行量測與付款時序) records the
current interpretation and remaining planner scope. P11, bot-position-payability,
the full predictor goal, policy promotion and product-operation gates stay open.
