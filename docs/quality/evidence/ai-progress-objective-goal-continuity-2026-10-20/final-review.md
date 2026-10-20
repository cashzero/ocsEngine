# Independent final review

Verdict is ACCEPT for the recorded exploratory measurement and its documentation. No correctness blocker remains in the reviewed scope. This verdict does not qualify a predictor, promote a policy, close the research goal, or verify a product operation.

The review covers `protocol.md`, `registration.json`, `extract.mjs`, `score.py`, `check-extraction.mjs`, their outputs, all thirty raw handoff snapshots, the evidence README, and the new topic subsection in `docs/ai/vp-metrics.md`. Application source is read-only context. The reviewer created no game, made no bot call, and changed no application or topic document.

## Source and boundary

The reviewer read `src/rules/kernel/reducer.ts`, `src/rules/lifecycle/lifecycle.ts`, and `src/rules/sequence/sequence.ts`. `advanceSequence` can execute several lifecycle transitions in one dispatch. Interrupt settlement and pending decisions can also affect that loop. `applyGameAction` adds one revision after dispatch. Consequently an outer action result alone cannot identify the requested cleanup boundary.

The extractor checks the current sequence and `nextSequence` against every recorded transition. It requires equality of the entire regenerated event list after global numbering. It also requires equality of the full reconstructed final state after only the outer revision increment. No missing event or unreplicated precheck effect is permitted. The primary snapshot comes immediately after the matching CLEAN_UP lifecycle call, including that call's hooks and before later calls. Its pre-dispatch revision and internal-boundary tag are correct. It is not a resumable user-decision snapshot.

The failed outer-alignment assumption and corrected registration are explicit. The failed attempt stopped before completed outcomes. The current source mapping is also explicit. Old-history `16ff5ec` and reachable `edfc398` have the same tree `92fce5c58118bf81efd7fce82ef8b2036609ee1f`. The checkout is `e96b238`. The reviewer independently reproduced the registered frozen engine digest `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`.

## Independent checks

All seventy registered file digests pass. The sixty source save and trace digests pass. All fifteen source cases retain the single15 intervention, equal pre-intervention memory, and later axis30/allied15 policies. Their terminal labels match the prior local-effect results. The reviewer did not repeat the earlier full-history continuation experiment.

All thirty raw snapshots parse and reproduce their recorded hashes. Their sequences, departure identities, internal revisions, objective identities, target points, holders, and target contributions agree with the measurements. Independent sums over objective control reproduce every reported score and margin. Six snapshots hold the original target for Axis. All fifteen paired all-objective and original-target differences are zero.

The reviewer independently applied 171 recorded legal actions from verified movement-exit snapshots. These cover factual pair1800002, both arms of pair1800012, and both arms of pair1800024. All five containing dispatches reproduce their recorded pre-state and post-state hashes. Complete event reconstruction, final-state equality, and captured internal hashes pass. Three selected next-goal pre-action hashes, sequences, and old-target holders also reproduce. These include both already-Axis-held target switches in pair1800012 and the pre-handoff next move in factual pair1800002.

All twenty-four recorded next-move intents parse and match the first later accepted same-unit MOVE_PIECE in their source history. The six censored histories have no later same-unit MOVE_PIECE. The census reproduces eleven changed target hexes, seven with the old target still Allied-held and four already Axis-held. Six observations retain the hex but change purpose. Two use hunt. Factual pair1800002 moves at index86 before the primary handoff at index90. The documents preserve this timing distinction and do not infer assignment continuity, abandonment, or strategic error from it.

All four forecast labels reproduce their aliases and every fold prediction. Direct signals equal prior zero. Fitted signals equal prior trainingMean. Their reused MAE values are 4.4 and 4.761904761904762. Their reused MSE values are 36.53333333333333 and 41.91836734693877. The terminal local effects remain between -12 and +8. No fresh fit or independent predictive evidence is claimed.

The reviewer executed `check-extraction.mjs` with file writes disabled. All thirty raw-snapshot checks and all three named altered-copy controls pass. Wrong original target, wrong current VP, and outer revision substituted for internal revision each fail the expected assertion. The resulting digests match `extraction-checks.json`. The post-cleanup measurement rows and summary equal the preserved pre-cleanup values. All nine evidence payload copies match their artifact originals.

## Documentation and comment review

The evidence README and topic subsection correctly state the exploratory scope, exact internal boundary, heterogeneous secondary timing, censoring, aliases, and unchanged qualification status. The README identifies repository `dist/index.js` as the actual import and requires the frozen engine at that location. Keeping only the ignored `engine/` copy does not redirect imports.

Comment review covers `extract.mjs`, `score.py`, and `check-extraction.mjs`. There are no comments requiring deletion. Deletion count is zero. MUST KILL flags are zero. Application source comments are outside the requested scope. Full eight-turn replay, new policy experiments, and UI acceptance are deliberate skips because this review concerns existing-history measurement.
