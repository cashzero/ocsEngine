# Independent final review of the thirty-game comparison

No blocking defect found in the recorded exploratory comparison. The numerical result is a small positive point estimate with uncertainty spanning zero. This review does not establish policy promotion, general strategic correctness, or UI acceptance.

Reviewed source commit `9e149737619c05cad75c47da2e025211a9ffd014`. The scope is exactly thirty games, fifteen exchanged-seat seed pairs, TEMPERATE_INLAND western terrain, AXIS_ATTACKS, 32 by 24, six divisions per side, two armored divisions per side, eight turns. Candidate input overrides only progressObjective to 30. Standard progressObjective remains 15. The weight loader merges the partial override into the same default weights. No extra games or duplicate full replay batch were run by this reviewer.

## Independent checks

- Read the frozen protocol, registration, weights, analyzer, summary, all thirty saves and traces, supply-study implementation, all worker outputs, combined supply attribution, and audit summary/runtime.
- Independently recomputed the arithmetic directly from the thirty match summary records. Recounted final objective control points from every current snapshot and checked those points against the recorded scores.
- Verified all thirty save SHA-256 and trace SHA-256 values against results.json. Every trace action sequence equals its saved acceptedActions sequence. There are 25,856 accepted actions, no trace rejection records, no rejected match actions, no reported match errors, and no fatal codes. All thirty records finish at turn 8 COMPLETE.
- Parsed and hashed all sixty initial/current snapshots with the engine's parseGameStateJson and hashGameState functions. Every hash matches the saved initial/final hash. Every summary final hash matches its save.
- Checked the expected contiguous match indices, all six seeds in every pair, runner seed derivation, same initial state hash within each pair, and candidate seat exchange. Allied is the defending side and axis is the attacking side in this engagement. The saved attackVictory configuration identifies player:axis as attacker.
- Recomputed registration hashes for protocol, weights, analyzer, match runner, heuristic source, weight defaults, supply-audit source, and the entire current dist JavaScript tree. All match registration. The results registration copy equals registration.json, and the results summary hash matches summary.json. HEAD matches the registered commit. These checks establish consistency with the recorded registration, not an external timestamp attestation.
- Independently checked 62 other files named summary.json and the played-seed ledger and found no reused map seed. This smaller additional search does not independently reproduce the registration's broader 248-file search. The available-record limitation in the protocol remains appropriate.

## Arithmetic

The fifteen paired candidate-minus-standard VP margins, each the mean of the two exchanged-seat games, are:

`1, 0, -4, 7, 3, 0, -9, 4, -5, 4, 7, 3, 0, 0, 6`.

The mean is +1.1333333333333333 VP per game. The sample standard error across fifteen seeds is 1.1705377952713574. With the frozen Student t critical value 2.1447866879169273 and fourteen degrees of freedom, the descriptive 95 percent interval is [-1.3772205476683035, 3.6438872143349700]. The independent calculation differs from results.json by less than 5e-16 due to arithmetic rounding. There are eight positive pairs, four zero pairs, and three negative pairs. Pair range is -9 to +7.

Raw VP totals are candidate 272 and standard 238, a difference of +34. The thirty individual VP margin signs are fifteen positive, zero tied, fifteen negative. Raw role means are -1 for candidate as allied defender and +3.2666666666666666 for candidate as axis attacker. Those two means include engagement role asymmetry and opponent interaction. They do not isolate a role-specific treatment effect against standard self-play.

All-cause STEP_LOST totals give candidate kills 609 and losses 571, with standard kills 571 and losses 609. Candidate K-L is +38. Kills here equal all opponent step losses, including attrition, and losses equal opponent kills by construction. These are algebraically coupled descriptions, not independent evidence of two causal improvements. Final out-of-supply counts total 39 for candidate and 53 for standard. Final OOS alone does not identify mistakes or explain the VP difference.

## Replay and supply evidence

The runner's replay flag checks loading the final save and comparing state identity. It does not itself prove action replay. The completed supply study supplies that additional evidence. Its reviewed code applies every accepted action from the initial snapshot, rejects failed application, checks final state hashes, and checks all-cause step-loss counts per side before writing a match result.

Verified exactly thirty distinct combined audit rows against all thirty summary records, including match identity, final hash, winner, and both side records. The four disjoint worker match sets cover exactly the expected indices, all worker exit codes are zero, and the concatenated worker rows equal the combined output. This verdict relies on the actual rows and implementation checks as well as successful process exits.

Independent diagnostic totals are 12,064 supply relocation actions, 9,841 combat relocation actions, 861 HQ actions, 2,830 ration-spending observations, 243 grouped ration payments, and 328 retreat choices. Preview mismatches, relocation trace breaks, other-unit trace breaks, HQ breaks, feed breaks, ration-commitment spending violations, and worse-supply-risk retreat choices all count zero. These totals agree with supply-audit-summary.json where that summary reports them.

The 450 attributed attrition losses comprise 388 opponent-action, 32 opponent-combat, 26 entered-map-out-of-trace, and four phase-transition-investigate classifications. Ration attribution comprises 266 own-action, 113 phase-transition-investigate, 57 opponent-action, eight opponent-combat, and six entered-map-unfed classifications. These labels describe transitions and are not proof of strategic error. The investigate classifications are not resolved by this audit. Ordinary movement, mode choices, recovery choices, and objective selection have not received an exhaustive strategic audit. The supply relocation checks cover the script's named combat-unit and transport MOVE_PIECE/CHANGE_MODE paths. They cannot be generalized to every action type. No strict advance audit was run or credited, and no formal promotion correctness verdict follows.

The combined supply attribution SHA-256 checked by this reviewer is `5580e39f2c1b61c7764f662a620048f189452ce948749286e176eaf738904152`.

## Review scope and disposition

The earlier reviewer checked protocol/scoring before outcomes and did not deliver a final verdict. That incomplete review is not credited as final verification here. This report is the independent final review of the available completed batch and audits. Owning documentation was still being assembled by the coordinating agent, so this verdict does not certify any subsequently written prose.

The scoped no-comments check covers analyze.py only. Python tokenization finds zero comments and no scoped suppression directives. Deletions 0, restored comments 0, reruns 0, MUST KILL flags 0, architecture sketches 0, fixes 0, encoding offers 0, encodings 0, unenforced constraints 0. No application source was changed by this reviewer.

The thirty-game exploratory finding may be reported with the stated uncertainty and limitations. The fixed eighty-game promotion gate is not satisfied by this batch. No default-weight or policy-version change is supported by this verdict.
