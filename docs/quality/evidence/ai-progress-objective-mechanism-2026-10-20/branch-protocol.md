# One-decision continuation pilot

This is a separate post-result pilot selected from the already disclosed worst pair, not an addition to the thirty-game experiment. Exactly two continuations use the original rules RNG realization. There is no reseeding, seed search or early stopping based on results. No new full initial-state matches are scheduled.

Both branches start from match1800013's original initial save, original bindings and seat seeds, and replay its first nine accepted actions through the real bot runner with axis30 and allied15. Every proposed and accepted prefix action, attempt count and state hash must match the original trace. Before the intervention, both seats' phase memories, rules state/hash and RNG must be identical across branches.

At revision9 only, one branch invokes the15 policy once and one invokes the30 policy once. Require the actual proposed actions to equal the two recorded legal alternatives from the common state. Let the policy perform the memory updates for the move it actually selects. After this decision both branches use15 on both seats, with identical original seed assignments.

Record the pre- and post-decision memories and RNG, all accepted actions and traces in ignored artifacts, terminal VP, all-cause loss counts and final hashes. Replay each completed save independently to its exact final hash. Any error, rejection, prefix/memory mismatch or unsupported alternative fails the pilot rather than being hidden.

The estimand is a one-decision policy intervention under one specified later policy and original dice realization. The policy call may also change memory appropriate to its action; it is not a memory-invariant geometric endpoint substitution. A different later policy or dice seed can change the result. Two continuations do not validate a VP predictor, establish an average causal effect across seeds, or pass promotion.
