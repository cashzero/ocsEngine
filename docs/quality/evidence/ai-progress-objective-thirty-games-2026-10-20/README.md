# Thirty western progressObjective games

The user requested exactly 30 games after narrowing research to progressObjective
in western attack scenarios. This batch compares coefficient 30 with the current
standard 15. It adds no map, engagement or weight family and changes no default.

The source commit is `9e149737619c05cad75c47da2e025211a9ffd014`. The engine tree is
`4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
The branch was fetched and rebased before running, then built successfully.
The [registration](registration.json) and [protocol](protocol.md) bind the inputs,
30 match IDs, 15 seed sets, candidate weight bytes, runner and heuristic sources.
The scorer source was additionally frozen before calculating outcomes; no interim
VP results were used to change the protocol or choose a stopping point.

The setting is TEMPERATE_INLAND, AXIS_ATTACKS, 32 by 24 hexes, six divisions per
side including two armored divisions, and eight turns. Explicit `--air NONE`
and `--air-transport NONE` disable the on-map air OOB. Attack-scenario off-map
aircraft can still participate. These are not described as games without aircraft.

Each even match gives the candidate the allied seat; the next odd match uses the
same complete seed set and gives it the axis seat. All 15 pairs have identical
initial hashes within the pair. The available-record seed check found no reuse
in 248 summary files or the played-seed ledger. Deleted, unledgered records are
outside that check. The exact command is in the registration. Its shape is:

```sh
node scripts/ai-match.mjs --matches 30 --start 1800000 --parallel 4 \
  --turns 8 --size 32x24 --style TEMPERATE_INLAND --engagement AXIS_ATTACKS \
  --divisions 6 --armored 2 --air NONE --air-transport NONE \
  --allied heuristic:artifacts/ai-progress-objective-30games/weights.json \
  --axis heuristic --swap --trace \
  --out artifacts/ai-progress-objective-30games/matches
python3 artifacts/ai-progress-objective-30games/analyze.py
```

Restore this run's frozen files at their recorded artifact paths to rerun the
analysis. The [analysis script](analyze.py) rejects incomplete batches, changed
input/source/build hashes, wrong settings, wrong policy seats, errors, rejected
actions, mismatched pair seeds and mismatched snapshot VP totals. Its source
hash is in the registration. No failed game is silently excluded.

All 30 games finished with zero recorded errors or rejections. The runner's
save/load identity checks matched. Batch wall time was 582.7 seconds. That is one
runtime observation, not a performance improvement claim. All saves and traces
remain in the gitignored artifact folder, bound by the [manifest](manifest.json).

The [results](results.json) retain every paired value. Candidate VP totals are
272 versus 238, a difference of +34. The mean of the 15 exchanged-seat margins is
+1.133333 VP, with seed-level SE 1.170538. Eight pairs are positive, four zero and
three negative, ranging from -9 to +7. The frozen descriptive Student-t interval
with 14 degrees of freedom is [-1.377221, +3.643887]. The 30 game-level VP signs
split 15 positive and 15 negative. Win count alone misses the total VP difference.

Candidate Kill is 609 and Loss 571, versus standard Kill 571 and Loss 609.
These are all-cause STEP_LOST totals. In head-to-head play the candidate's Kill
is the opponent's Loss, so they are coupled evidence. Final OOS totals are 39
and 53; these counts do not establish whether a supply break was strategic,
self-induced, joint or unresolved. Raw per-role margins are not isolated
role-specific gains against a standard self-play control.

All accepted histories were separately audited with `scripts/ai-supply-study.mjs`
in four disjoint subsets. The full aggregate replayed 25,856 actions, matched all
30 final hashes and both sides' loss counts, and checked 12,064 supply-related
relocations. The [audit summary](supply-audit-summary.json) records zero preview
mismatches, relocation trace/feed breaks or ration-commitment spending violations.
The four workers all exited zero with empty stderr; [runtime](supply-audit-runtime.json)
records 178.68 seconds. The full large audit stays in the artifact folder and its
hash is in the manifest. Strict combat-advance audit and general strategy
correctness are not inferred from this ordinary-movement diagnostic.

The [independent review](final-review.md) recalculates the paired statistics,
checks all save/trace identities and all 60 initial/current snapshot hashes, and
verifies the complete audit aggregate. It found no reporting blocker. It does not
certify a promotion or product UI gate. The scorer has zero comment findings.
The [delivery review](delivery-review.md) independently checks the later case
replay, score terms, published statistics, evidence copies and scope of the claims.
It found no reporting blocker and zero case-script comment findings.

The [worst-pair case](worst-pair-case.json) is selected after seeing outcomes and
is descriptive, not predictor validation. In the common revision-9 state, the
same recon unit approaches the same CAPTURE target. Weight 30 accepts exposure
score -17.137255 for six hexes of progress; standard 15 accepts -0.588235 for five.
Both actual choices are legal and their score terms reconcile. Later policies
also differ between these two games, so this first move is not established as
the cause of the terminal -9 pair margin. The [case script](inspect-worst-pair.mjs)
and its hashes make that limited observation reproducible.

This is the requested 30-game exploratory comparison. No games were appended,
no default weight or policy version changed, and no formal 80-game promotion
gate was marked complete. The original metric-research goal remains open.
