# Terminal attacker VP option development

Observed source base `2528b6d2274b4d80b118670438e7dcdc7e7b596d`. Frozen candidate
77 versus frozen standard 75 through one candidate engine/generator. Preserve all
standard 75 behavior except attacker option handling when no opposing turn remains:
on an unheld objective, pay all option points as losses if some attacker survives,
retaining advance eligibility. All existing advance/Overrun supply guards remain.
Surviving attacker steps are projected only to their owner, derived from current
state so no bot memory is needed after load. Candidate code is preserved in the
patch and immutable local build; it is not promoted into the standard policy.

Inputs: 32 known games/16 swapped-seat pairs, eight full turns, 32×24, six divisions
(two armored) per side, no aircraft/air transport. Meeting Temperate 1300000–07,
Eastern 1300100–07; Axis Attacks Temperate 1300200–07, Eastern 1300300–07. Identical
map/OOB/deployment/rule seeds within every pair. Four groups run concurrently with
two match workers each. Expected legal complete replays, zero guarded supply
violations and a development VP signal; only a separately registered fresh 80-game
batch could qualify a promotion.

Observed 336–328 VP (+8), meeting 0 and attack +8. Subgroups 0/0/+8/0; the gain
is concentrated in one pair (see pair-results.json). Paired mean +0.25, interval
mean ±2.1SE [−0.275, 0.775]. These known-seed results do not establish an independent
promotion. No independent batch registered or played; standard remains 75.

All 32 finish turn 8/COMPLETE legally, no errors or rejected actions, replay final
hashes identical. Ordinary and strict advance supply violations zero. Candidate
Regular advances: 66, including 64 funded and two allowed after the final Supply.
Six successful Overruns all actually funded. Killed/lost steps 453/453 on both
sides. Full frozen quality: 752 passed/eight skipped, typecheck/build/smoke passed;
full suite 174.31 seconds. Commands/log hashes/check durations in quality.json,
source/test/build hashes in the freezes, group durations in timings.json.
Verification is frozen-only; main delivery is documentation and reusable tools.
No UI operation acceptance row changes.

A supporting local continuation uses candidate-76 meeting match 1300002 revision
597, turn 8, second player, Movement, combat at −1,21. The owner sees two surviving
attacker steps; the opponent sees null. On one common candidate-77 engine, frozen
75 retreats and leaves the objective Axis; candidate 77 pays one step, survives,
and takes it for Allied. Both branches resolve the transaction legally. This is a
local opportunity, not full-game strength evidence. Summary only in
local-branch-results.json; raw state/action traces remain in artifacts/ai-vp/.

Main history was rewritten without changing these source trees. source-equivalence.json
maps the observed commits to the rewritten main commits with identical tree hashes.
The old observed hashes are retained unchanged. Reconstruct from the equivalent
base tree and apply candidate.patch, then verify source/test/build hashes. Quality
and batch commands are scripts/ai-promotion/quality.py, batch.py and verify.py with
the candidate/baseline freeze paths and development mode. No prior artifact is
replaced; raw logs/saves/replays/audits stay ignored under artifacts/ai-vp/.
