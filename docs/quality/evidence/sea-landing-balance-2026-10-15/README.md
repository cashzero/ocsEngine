# Sea landing reinforcement sensitivity study

## Boundary and expected evidence

Evaluate force-timing and logistics settings before implementing New Game options. The user requested independently configurable Allied/Axis reinforcement percentages, a higher defender default when the attacker has no inland entry, rejected Turn 2 as too early, and then asked for assessment first. No UI change or default is delivered. No product operation row is promoted.

Expected: paired, complete eight-turn legal games that measure attacker progress, win conditions, whole-division arrivals, SP landed/backlogged, losses and supply causes. Preserve fixed map/control/objectives/starting supply/support within each seed/direction; disclose composition, delayed units after the turn limit, bot limitations and sampling uncertainty. A browser acceptance gate is outside this run.

## Code and inputs

Product commit: `96537d003d3aa35739feb6b18502cbf0c1628339`. Product `src/` is unchanged from that commit. The study scripts are uncommitted at run time; SHA-256 values are in `results.json`, and exact source copies are retained in `artifacts/sea-balance/source-*.mjs`. Policy `heuristic@66`. `npm run build` completed successfully. All four new script files passed `node --check`; the product test suite was not rerun for this analysis-only change.

32×24 Western Europe, COMPACT; defender 6 divisions / 2 armored or mobile, attacker 9 / 3; October, eight turns; flank sea, attacker ports only, defender inland entry; Sea Cap 5/0 except the explicit Sea Cap sensitivity. The attacker's generated off-map air remains in the package; the study does not demonstrate human air strategy. Both sides use the same production heuristic.

Four paired seed sets: map/OOB/deployment/rules = 206569473/206569474/206569475/206569476; 206569570/206569571/206569572/206569573; 206569667/206569668/206569669/206569670; 206569764/206569765/206569766/206569767. Bot RNG seeds are rules+1 for Allied and rules+2 for Axis. Each seed set runs all 17 settings in both attack directions: 136 games. These are repeated paired seeds, not 136 independent seeds. Different decisions consume different dice sequences.

Every full selected division goes from its original position to the reinforcement Box in Move Mode with its return-turn status. Other pieces, starting supplies, formation memberships, control, objectives, fortifications and VP threshold are preserved. Selection uses equally spaced formation indexes with nearest-integer rounding, so six defender divisions yield 2/3/5 held back at 25/50/75%. Formations are ordered mobile first; the first armored division always remains at start in these samples. This is a controlled scenario experiment, not a test of a future redistribution algorithm.

Arrival waves are one division per Game Turn from T3, T4 or T5, using legal land entry or sea shipping as appropriate. A sea arrival date does not guarantee landing. T5 with five held-back divisions schedules the last one at T9, outside this eight-turn operation; these units remain off map. Port sensitivity changes every initially attacker-held port's capacity, without changing terrain or VP. Axis seed 0 starts with two ports, so per-port capacity differs from aggregate capacity.

## Execution

```sh
npm run build
node scripts/sea-landing-balance.mjs --out artifacts/sea-balance/matrix --seeds 4 --sides allied,axis --parallel 4
node scripts/sea-landing-balance-summary.mjs artifacts/sea-balance/matrix
node scripts/sea-landing-capacity-scan.mjs artifacts/sea-balance/capacity.json
node scripts/sea-landing-balance-audit-input.mjs artifacts/sea-balance/matrix artifacts/sea-balance/supply-audit allied-0-base allied-0-d50-t4
node scripts/ai-supply-study.mjs artifacts/sea-balance/supply-audit
node scripts/sea-landing-balance-audit-input.mjs artifacts/sea-balance/matrix artifacts/sea-balance/axis-supply-audit axis-0-base axis-0-d50-t4
node scripts/ai-supply-study.mjs artifacts/sea-balance/axis-supply-audit
```

A two-game pilot preceded registration of the 136-game matrix. It is not pooled with the matrix. The first sandbox launch was denied when Node spawned Git to identify the commit; the approved local rerun succeeded. No game was dropped or retried to improve results.

## Observed results

All 136 registered matches finished at Game Turn 8 / COMPLETE, with zero rejected actions and zero bot execution errors. Every accepted action replayed legally; final replay state hashes equal the session hashes. Match-level hashes and outcomes are in [results.json](results.json), with all settings summarized in [matrix.md](matrix.md). Approximate matrix wall time from output timestamps: 1018.5 seconds, four workers. Per-game generation/start/play time: mean 26.91 s, range 14.10–53.32 s; concurrent experimental timings are not a UI latency benchmark.

The base configuration produced attacker wins Allied 1/4, Axis 1/4. Defender 50% / T4 remained 1/4 and 1/4. Defender 75% / T4 produced 2/4 and 3/4, the candidate warranting independent confirmation. Defender 25% / T3 produced 3/4 versus 0/4: aggregated wins alone would conceal direction sensitivity. Bigger percentages and later arrivals did not produce monotone results.

Both sides at 25% / T4 produced 0/4 and 0/4. Both at 50% / T4 produced 1/4 and 1/4, with SP landed 28.5T/37T per game versus base 54T/64T; sea reinforcements compete with SP for shipping. Every attacker-held port increased to 4 SP without divisional delays still produced 1/4 and 1/4, despite SP landed increasing to 115T/113T. These are small-sample comparisons, not evidence that more SP is useless or harmful.

The initial owned port capacities across seeds were Allied 8/8/4/8T, Axis 16/8/8/8T. Thus the no-inland-entry switch alone does not identify an equal logistical situation. The separate 48-request generation census had no generation failures and is recorded in [capacity.json](capacity.json); it holds the default seeds fixed and does not represent played games or a seed sweep.

## Supply audit and measurement limits

Four sample games were audited, the first seed's base and 50%/T4 in both directions. All have zero ordinary relocation trace breaks, feed breaks, preview mismatches or supply-worse retreat choices under the existing audit. The Allied attacker cases show enemy-triggered trace breaks, including combat in the delayed case. The Axis-base audit also has one own-response-triggered attrition record, 19 phase-transition records and two entered-map-out-of-trace records. These have not all been proven avoidable or unavoidable; the attribution identifies the last transition, not intent or a strategy error. Full audit counts are in results.json; detailed records remain in artifacts. Do not claim all AI supply issues are resolved.

The initial state caches zero victory scores before the first action; the summary recomputes actual initial held VP from hex control and objective values. Raw runner timeline start.vp is the cache and must not be treated as initial ownership. The runner's spentT counts SUPPLY_SPENT only and excludes RESOURCE_CONSUMED; no total-spending conclusion is drawn from that partial counter. Loss totals in the study count actual step reductions, whereas the existing supply audit classifies STEP_LOST events; these units must not be conflated.

No browser was operated and no screenshots were produced: there is no UI acceptance claim. No other map style, weather regime, campaign duration, strategic air policy, alternative selection of armored divisions, or ordinary inland-entry campaign was calibrated by these matches. Four seeds per direction plus selection among multiple tested candidates cannot establish a population win rate or validate a universal default. Product acceptance rows remain unchanged.

Current contract, interpretation and candidate guidance live in [Reinforcement balance](../../../game-flow/reinforcement-balance.md). Open implementation/calibration work remains in the TODO inventory. Full saves, traces, registration, timelines, original audit output and frozen script sources are under the gitignored `artifacts/sea-balance/`; none are committed in this evidence folder.
