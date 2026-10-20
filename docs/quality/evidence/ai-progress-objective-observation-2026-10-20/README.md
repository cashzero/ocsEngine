# Western progressObjective observation

This run observes only `progressObjective` in existing `TEMPERATE_INLAND`,
`AXIS_ATTACKS` games. That map style uses the WESTERN terrain profile. It does not
analyze Eastern games, tune other weights or promote a policy.

The source base is `12d7887`. Two historical weight files set this one coefficient
to 7.5 and 30, versus the current default 15. Their labels differ too. Four map
seeds and exchanged seats give 16 historical saves, eight same-role comparisons
and four paired seed comparisons. No matching full default-15 self-play batch is
present in this source cohort. The default is inspected only at one decision.

The [manifest](manifest.json) binds the raw saves, accepted histories, initial and
final states, original panel, engine tree, weight files and observation script.
The runtime tree is `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.
Restore the recorded raw artifacts and these run-specific scripts at
`artifacts/ai-progress-objective/` before replaying from the repository root:

```sh
node artifacts/ai-progress-objective/observe.mjs
node artifacts/ai-progress-objective/default-decision.mjs
```

The first command legally replays all 13,903 accepted actions and matches all 16
final hashes. Recorded final VP also independently matches control points in each
saved final snapshot. The successful complete replay took 76.64 seconds. This is
one runtime observation, not a speed comparison. It adds no bot-generated game.

The second command recreates one original initial session with the original seat
seeds and default heuristic policies. Its first seven accepted actions match both
historical variants, and its next decision has their exact pre-state hash at
revision 7. Only eight decisions are executed; it supplies no terminal default-15
outcome. The actual standard choice is accepted by the engine.

[Summary](summary.json) retains all four paired results and eight first-divergence
identities. In exchanged-seat mean VP margin, 30 minus 7.5 is +6, 0, +3 and 0,
averaging +2.25. The comparison is an oriented matchup against the standard
opponent, not absolute improvement over a separate standard self-play baseline.
Secondary Kill and Loss use summary STEP_LOST totals across causes. They are not
classified as pure combat kills. Their overall mean changes are +3.5 and -0.375
steps, but the first seed's Loss increases by four.

[Decision scores](decision-scores.json) retain a compact analysis of three routes
from the shared first divergence in match 1600001. The same COMBAT unit approaches
CAPTURE target `-3,11`. The 7.5, 15 and 30 policies choose routes reducing target
distance by six, seven and eight hexes respectively. Their recorded score terms
show the tradeoff with exposure and contact penalties. Each actual choice passes
the visited final supply check; unvisited checks remain unknown. Full reports,
rule explanations and witness payloads remain in the gitignored artifacts.

The [objective cases](objective-cases.json) preserve only derived control-change
measurements for the positive cases and a zero-effect counterexample. Full match
histories and branch snapshots remain in `artifacts/`. In the largest positive
case, final axis control rises from six to twelve points. The initial move alone
has not been isolated as the cause of that terminal difference. In the seed
324741827 attacker case, 30 captures both its final objectives later than 7.5,
yet finishes at the same margin. Seven of eight role comparisons change actions;
only two change terminal VP. Earlier or further progress is not automatically
better terminal control.

The zero-effect case's shared assigned CAPTURE target is independently bound by
[compact report identities](zero-case-target.json) from the previous passive
regeneration records 27 and 31, at their exact shared revision-20 pre-state.

Two rejected diagnostic assumptions are preserved. The first observation attempt
looked for a nonexistent `configuration.engagement` field and stopped before
replaying any action. Scope binding was corrected to the recorded engagement and
actual attack-victory attacker. The first default-decision probe assumed 15 would
choose the 7.5 route. The actual engine chose a third route and falsified that
assumption. The final script checks the report against the accepted action rather
than asserting the rejected prediction. Both failed attempts' stderr remains in
the artifact folder. The final successful commands have empty stderr. No failed
game was dropped, and no policy acceptance criterion was lowered.

This is selected retrospective observation of four seeds. Standard-15 terminal
comparison, independent seeds, predictor qualification and causal action
continuations remain open. No strategy, reward or product-operation gate is
reported complete. Explain the Number keeps seed-level results, the default
baseline gap and the adverse Loss case beside the average VP difference.

The [independent review](review.md) replays all 16 source saves separately and
reconciles every legal action, final hash, control change, turn endpoint, VP and
all-cause STEP_LOST count. It also verifies the raw witness and compact report
identities, three-weight score matrix and committed summary copies. No blocking
finding was reported. The scoped scripts have zero comment or suppression findings.
