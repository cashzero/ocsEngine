# Original-policy continuation review

Review is complete. No correctness or reporting blocker remains for this bounded exploratory continuation study and its evidence bundle. This verdict does not qualify a VP predictor, promote a policy, or complete a product-operation gate.

## Scope and source grounding

Reviewed `run-case.mjs`, `run-suite.py`, `score.py`, `protocol.md`, `registration.json`, the post-result `inspect-pilot.mjs` and `check-scorer.py`, the prior mechanism grounding and review, and the relevant runner, RNG, heuristic-policy, default-weight and original match-runner paths. No new game or additional full-history replay was launched by this reviewer.

The checked-out source is `ed7e706d45c5a2ea7a93dfc805319153ca28636c`. All 40 registration file digests match. Independently recomputing the sorted `dist/**/*.js` tree digest gives `4a87376b26c41f60086cb3060f606afcc1e9b99bb3ba00339c904837d200bb2a`. The fixed mechanism input contains all fifteen specified pairs and fifteen distinct map seeds.

## Implementation

Each branch loads the original odd match's initial state, preserves its rules RNG and seat seeds, and obtains the prefix through real policy calls and real runner dispatch. The policy wrapper calls exactly one selected policy per decision. At the first differing revision, the counterfactual calls 15 on its own actual memory, keeps the returned action and its associated notes, and immediately resumes axis30/allied15. It does not call both policies on shared mutable memory or replace the action after the policy updated its notes.

The memory mirror matches the runner's accepted-action increment. When the current seat changes phase or segment, the wrapper takes its freshly reset memory from the current context. The inactive seat's last memory and any absent map entry are retained. Both complete maps are cloned before the fork. The recorded `afterPolicyCall` value intentionally precedes the runner's action-count increment. Zero rejection and one attempt are required, so the mirror does not need to model a failed dispatch.

Bot RNG is derived from the original seat seed, state hash and decision ordinal. The nonce changes request identifiers only. Equal pre-intervention rules RNG and bot-decision context are established at the fork. Changed later hashes or action sequences can change bot draws and rules-draw consumption; this does not couple every subsequent tactical event to an identical die.

The pilot requires every factual action and the final hash to reproduce before the other fourteen cases start. Every other control requires the original prefix and fork action. All counterfactuals must finish and replay to their final hash. The worker counts every `STEP_LOST` event by owning player, matching the original match runner's all-cause Kill/Loss convention. This is not a supply-safety audit.

## Factual reuse and statistical scope

Read-only inspection of all fifteen original factual saves confirms FINISHED lifecycle and agreement with the frozen summary's victory points, final hashes and accepted-action counts. Only the pilot's factual history is rerun by this experiment. The other factual terminal outcomes are reused from those frozen records; short controls validate their prefix and fork reconstruction.

The registered target is factual30 axis margin minus the one-decision15 counterfactual's axis margin under later axis30/allied15. It is distinct from the previously known two-seat whole-policy paired margin. The registration retains every seed, feature and zero effect. Any failed case prevents full-batch scoring rather than being silently dropped.

Each feature has its own one-variable ridge fit with an unpenalized intercept and penalty 1. Each held-out seed is excluded from its training mean, feature center, population standard deviation and coefficient. The formula is the centered ridge closed form. Zero and training-mean baselines use the same folds. MAE is primary and MSE secondary. This is within-family exploration on previously examined states and features, with one original rules RNG realization per seed. It cannot establish an independent whole-policy or cross-family predictor.

## No-comments review

Files reviewed are `run-case.mjs`, `run-suite.py`, `score.py`, `inspect-pilot.mjs` and `check-scorer.py`. Comments found 0. Deletions required 0. MUST KILL flags 0. Suppressions found 0. Protocol Markdown is outside the code-comment scope. Application source was inspected for grounding and was not changed.

## Completed output verification

All fifteen registered cases are present. Independent raw-file checks reconcile every case manifest and artifact digest, full pre-intervention memory equality, original-prefix actions, the pilot's complete original history, and 14,858 trace/save action rows. Every trace row has ACCEPTED status, one attempt and no rejection. The total consists of 13,687 counterfactual actions, 808 full factual-reproduction actions and 363 short-control actions. All thirty final or short-control snapshots independently hash to their recorded engine state hash. This review did not repeat the workers' full-history replays.

For all thirty forks, the new action, score and complete ordered score breakdown exactly match the corresponding original15 or original30 selected trace. The frozen route features therefore describe the actual fork choices under the reconstructed original prefix, rather than an action with mismatched retained terms.

Independent arithmetic from the factual records and counterfactual terminal victories gives local margin effects `[-2, 8, -12, 8, -8, 8, 0, 0, -4, 0, 0, 0, -8, 0, 8]`. Their sum is -2 and their mean is -0.1333333333, with 4 positive, 6 zero and 5 negative cases. Factual versus counterfactual axis totals are VP 152 versus 153, all-cause Kill 445 versus 405, and all-cause Loss 175 versus 180. The reported totals retain every case.

An independent raw-feature ridge calculation, using the equivalent raw-scale penalty equal to training variance, reproduced all 75 held-out predictions within 1e-12. The zero baseline has MAE 4.4 and MSE 36.5333333333. Training mean has MAE 4.7619047619. The progress, other-cost and exposure-cost features have MAE 4.9989104442, 5.0720011876 and 4.9672555539. Every candidate also loses to zero on MSE. No candidate is supported for adoption by this comparison.

## Pilot inspection and scorer controls

Independent recursive comparison of both raw pilot terminal states, including the union of object keys, confirms that only `/mapState/revision` differs, 1336 versus 1334. Both histories have 808 accepted actions and differ only at action indices 9 and 131. Piece states, hex control, rules RNG and victory are identical. The full hashes differ. This does not prove equivalence of intermediate positions or strategic irrelevance of other first moves.

Both fork-weight memory captures are byte-identical to the corresponding captures in the prior common-later15 pilot. The conditional30-versus15 margin effect is zero under later axis30/allied15 and +2 under later15/allied15 in this particular seed and state. This is continuation dependence of an action-associated policy intervention, not a pure endpoint effect or a retrospectively selected continuation win.

The post-result scorer-control script uses temporary overlays and only copied mutable payloads. The four recorded controls reject at their named assertions for wrong case identity, inconsistent terminal victory, a false memory-equality declaration, and an unequal actual memory payload with a consistently updated digest. The last control reaches the semantic memory comparison rather than failing only a hash check. These controls validate rejection paths; they do not add prediction features or alter the frozen scorer.

## Delivery documentation and evidence

Reviewed the `progressObjective 在原後續策略下的單步效果` subsection in `docs/ai/vp-metrics.md` and `docs/quality/evidence/ai-progress-objective-local-effects-2026-10-20/README.md`. Both agree with the inspected data, report negative and zero outcomes, distinguish local effects from exchanged-seat whole-policy margins, and reject all three features against zero. They preserve the limits from previously examined states, one original dice realization and one weight family. The earlier later15 explanation now links to the original-policy continuation comparison instead of leaving its effect unknown.

All thirteen listed evidence-file hashes match the assembled copies. Every copy other than the evidence-specific README is byte-identical to its artifact original. The bundle includes the frozen input registration, protocol and model scripts, complete case manifest and outcomes, separate post-result diagnostics, scorer controls and decision trail. The final review will be copied and the bundle file-hash list regenerated by the owning agent.

The reports make no claim that the original ordinary-supply audit covers these new histories. No default weight, policy version, UI acceptance, promotion status or broader research goal is changed or marked complete.
