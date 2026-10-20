# One-action continuation grounding

This is a source investigation at `d12230fb8e60f77a3402873f50fd977883985dad`. Scope is the existing WESTERN `AXIS_ATTACKS` thirty-game batch, `progressObjective` 30 against 15. No continuation games were run for this report. The findings below establish an implementation path, not causal evidence.

## Existing continuation

`scripts/ai-continue.mjs` cannot preserve an exact mid-step bot state. Lines 38–39 replay accepted actions through the rules engine only. Lines 64–77 replace the rules RNG, empty the action history, and create a fresh runner. The runner starts with empty memories. The script explicitly restricts its intended branch boundary to the first action of a segment, where fresh memories are appropriate. Its variants also change the subject's whole continuation policy, rather than one action.

`src/ai/seat-runner.ts` keeps both seats' memories privately in the runner closure. A game save does not contain them. Lines 136–150 can recover a previously observed revision inside the same live runner, but a newly loaded runner cannot recover its predecessor's notes. `reset()` also clears them. Therefore loading the revision-9 snapshot into `ai-continue.mjs` does not reproduce the recorded bot decision context.

The policy RNG has no persistent stream to export. `src/ai/rng.ts:18` derives a new RNG from the seat seed, current state hash, and decision count at that revision. Accepted actions advance the revision, so the ordinary next-decision ordinal is zero. The rules RNG is part of GameState. Replaying the original prefix through the original rules state preserves its state and draw count. After an action intervention, different hashes can produce different bot draws, and different later actions can consume different numbers of rules draws. Equal initial RNG does not mean every later tactical event receives the same die.

## Smallest correct path

A dedicated artifact script can use the existing runner and policy APIs without changing application code.

1. Construct an ACTIVE session from the original initial snapshot. Retain the original rules RNG, bindings, and seat seeds. Keep its accepted-action list empty because the runner will produce the prefix.
2. Create wrappers around the original seat policies. Each wrapper calls the real policy and returns its decision. Assert that each accepted prefix action equals the recorded action, and that its status is ACCEPTED with one attempt and no rejection. Merely returning recorded actions is insufficient because the policy updates its phase memory during `decide()`.
3. Run all nine shared actions. Verify the revision-9 state hash against the recorded case. Capture both seats' memory through the policy contexts using `structuredClone`, including their last observed post-decision notes and the runner's incremented action count. Compare both branches' memories before the intervention. Equal accepted actions alone do not prove equal notes.
4. At the selected decision only, use the 15 policy in one branch and the 30 policy in the other. Invoke the chosen policy once on that branch's real context. Assert each proposed action is the exact recorded legal alternative. This retains the memory updates belonging to the action that actually executes.
5. After that decision, run the same explicit policy assignment in both branches. For example, use 15 for both seats thereafter. Finish both sessions, record accepted actions and errors, and independently replay their saves to verify terminal hashes. This comparison estimates the consequence of that decision under that particular later policy and original dice realization.

The fork policy must be stated. Both branches can replay the original game-1800013 prefix with allied 15 and axis 30, then switch both seats to 15 after the selected action. A different valid experiment replays both seats with 15 from the beginning, but it must first verify that this produces the same shared actions and both memories at the intervention. Do not silently substitute one prefix policy assignment for the other.

The one-decision 30 call is a bounded policy intervention. It is equivalent to forcing the observed alternate action only after the action and resulting notes have been verified. It does not establish that an arbitrary replacement action can be returned safely by the same wrapper.

`src/ai/policies/heuristic.ts:1089` updates `incomingRe`, and sometimes `feedBudget`, before it returns the selected move. Earlier movement processing updates `done`, `modeSet`, targets, and other notes. Calling the 15 policy and replacing only its returned action with the 30 action leaves reservations at the wrong destination. Calling both policies against the same mutable memory also contaminates the second decision. Evaluate alternate choices on separate cloned contexts or separate runners.

## First-divergence score semantics

`inspect-worst-pair.mjs` extracts the longest common accepted-action prefix, replays its rules state, and matches the next accepted traces. This proves a common rules state and legal alternatives. It does not recover phase memory. The existing case has nine common actions, one axis recon unit, and the same CAPTURE target at `15,11`. The paired games change policy assignments on both seats, so their terminal pair loss does not isolate this first axis move.

`src/ai/policies/heuristic.ts:415` defines progress as the reduction in geometric hex distance from origin to assigned target. It is neither traveled path length nor movement points. CAPTURE and ASSAULT multiply the distance reduction by objective points divided by the mean objective points. GARRISON uses scale 1. FRONT and other purposes use different weights. The stored `progress` term is the weighted score contribution, not raw distance or future VP.

The current movement selection also prioritizes `captureSwing` before total score and checks stay improvement and friendly supply preservation. A generic first-divergence extractor must retain action kind, actor, purpose, target, capture priority, and other terms. It must not assume every divergence is a comparable objective move or explain a choice solely from its total score.

`exposure` for a COMBAT unit is `-max(0, threat - (strength + support) * exposureSupport)` at `heuristic.ts:435`. Threat comes from projected enemy strengths and distances in `src/ai/analysis.ts:153`. This penalty is a heuristic threat shortfall. It is not a measured death probability, combat loss forecast, or VP loss.

The selected totals 57.1041 under 15 and 121.3243 under 30 have different score scales. Comparing them directly says nothing about the better move. For the recorded case, both selected moves have only progress and exposure terms. Rescoring the two actions with the same weight gives the local preference reversal.

| Action destination | Progress hexes | Exposure term | Score at 15 | Score at 30 |
|---|---:|---:|---:|---:|
| `18,12` | 5 | -0.5882353 | 57.1040724 | 114.7963801 |
| `16,13` | 6 | -17.1372549 | 52.0935143 | 121.3242836 |

The common point scale is `2 / (13 / 5)`. These numbers derive from the stored terms and the scoring formula. They show that the extra scaled hex is worth 11.5385 at weight 15 and 23.0769 at weight 30, against 16.5490 added exposure penalty. They do not establish the terminal value of either action.

If extraction is later correlated with VP outcomes, retain the actor role and all exclusions. An axis first-action contrast is not an isolated explanation of the paired result, which also includes another game with the candidate as allied defender. All fifteen post-result cases are exploratory observations, not a held-out validation set.
