# progressObjective mechanism review

Review is complete. No correctness or reporting blocker remains for this bounded mechanism investigation and its evidence bundle. This is an independent review, not an additional match run, promotion decision or qualification of a VP predictor.

## Scope and source grounding

Reviewed `analyze.mjs`, `branch.mjs`, `audit-branches.mjs`, both protocols, the completed mechanism and branch outputs, original match saves and traces, `src/ai/seat-runner.ts`, `src/ai/rng.ts`, the relevant movement-scoring and memory-update paths in `src/ai/policies/heuristic.ts`, and the original runner setup in `scripts/ai-match.mjs`. Delivery review covers the new `progressObjective 首次分歧與單步介入` section in `docs/ai/vp-metrics.md` and the mechanism evidence folder's README, manifest and ten frozen files.

## First-divergence analysis

An independent raw-save and trace calculation confirmed all 15 common-prefix lengths and first differing actions, all 30 selected actions, geometric distance progress, objective point scales, progress terms, retained score sums, terminal control and stored victory scores. It reconciled 25,856 accepted actions, 8 positive / 4 zero / 3 negative pairs, 15 cases with more progress, 14 with worse exposure, and assigned-target / other-objective paired-margin sums of 12 / 5.

The extractor replays each original history to its recorded final hash, rather than inferring the target-control timeline from the final snapshot. Every supported comparison retains the same axis unit, origin, objective and CAPTURE or ASSAULT purpose. Unsupported cases fail loudly; the completed artifact contains all 15 pairs, so none was dropped. The generic protocol should not be read as a supported-case filter.

The two-route affine score calculations preserve the selected action's stored other terms. They are not full candidate enumeration, a fresh alternate-weight policy evaluation, or proof of global preference at the calculated switch point. The pair's terminal objective contribution algebra is correct. Its target and other-objective decomposition is accounting for two whole-policy trajectories, not a causal allocation to the first move. Independent output arithmetic confirms 12 unchanged and 3 changed terminal target holders. The eight pairs with acquisition in both trajectories split into 3 earlier, 3 later and 2 same-game-turn acquisitions under 30.

## One-decision continuation

The wrapper calls one real policy per decision through the real runner. It does not call both policies on one mutable memory or replace a returned action after its notes have been updated. Each branch owns separate policy objects, runner memories, loaded session and rules state. The runner derives decision RNG from the original seat seed, current hash and decision ordinal. Its nonce only changes request identifiers.

The wrapper's memory mirror matches the runner's accepted-action increment. The complete pre-intervention memory maps are equal. Only axis has an initialized memory at this point, with 9 accepted actions; allied has not yet acted. The recorded `afterPolicyCall` memory intentionally precedes the runner's action-count increment. The intervention includes the selected move's policy-memory updates.

Independent checks verified every branch artifact hash, 691 / 919 accepted trace rows with one attempt and no rejection, their correspondence to saved actions, both final snapshot engine hashes, and the first ten actions replayed from the original initial state. Both post-fork rules RNG values remain `{state: 344142800, draws: 0}`. The post-fork hashes are `sha256:3e92f42a3b1f125698024117d2d263103f4bb3292ccfa97ad465cb8318685d21` and `sha256:f2bbd43eb19e12d75cdeb6d8cfaaa7c88eb3d84250af102e3df360e64cd0ea9e`.

The script independently replays each completed branch's entire save to its final hash. This review inspected that path and checked final snapshots and short prefixes; it did not launch another full-history replay job.

Axis finishes 6 to 7 after the one-time 15 decision and 7 to 6 after the one-time 30 decision, then 15 on both seats in both branches. The margin contrast is +2 for the 30 intervention under this later policy and original RNG realization. This does not identify a pure endpoint effect, an average across seeds, the explanation of the original worst pair, or an independently qualified VP predictor.

## Delivery checks

The initial branch output omitted post-intervention RNG and all-cause losses requested by the protocol. The separate `audit-branches.mjs` resolves this delivery gap. It verifies raw file hashes, every trace action, all attempts, complete accepted histories and final hashes, then records the post-intervention state and RNG and counts STEP_LOST events by owning player. Its completed output reconciles 1,610 actions. Axis Kill and Loss are 14 and 4 under the 15 intervention, and 24 and 13 under the 30 intervention. These are all-cause event counts, not combat-only kills. The report distinguishes this supplemental replay from another match run.

All ten manifest file hashes independently match the committed-draft copies and their artifact originals. The topic document and README agree with the inspected outputs and preserve the negative, zero and positive cases. They distinguish a constant binary progress indicator from all quantitative progress metrics, target-contribution accounting from early prediction, and one post-selected policy intervention from cross-seed effects. They state that the effect with original later axis30 remains unknown. The original thirty-game supply audit is not claimed to cover these new continuation tails. No default, policy version, UI acceptance or promotion gate is changed.

## No-comments review

Files reviewed are `analyze.mjs`, `branch.mjs` and `audit-branches.mjs`. Comments found 0. Deletions required 0. MUST KILL flags 0. No suppression or workaround comment was present. Markdown protocol prose is not a code comment. Application source was inspected for grounding and was not changed or included in the comment-deletion scope.
