# G7 Save, Load, Checkpoint, and Replay

Gameplay save schema v1 contains version/session metadata, lifecycle, bindings, source/initial/final hashes, strict canonical initial/current Rule snapshots, accepted actions, aligned request/Seat/timing metadata, and checkpoint descriptors/snapshots. Rule events are regenerated from the accepted action log rather than trusted as a second authoritative stream.

Load rejects unknown fields, malformed IDs/actions, unsupported versions, bad bindings, invalid snapshots, source/hash mismatches, actions that no longer replay, current-state disagreement, corrupted checkpoints, and lifecycle/completion disagreement. It creates no partial session.

A checkpoint records action index, revision, state hash, and canonical snapshot, including active transactions and pending decisions. Undo serializes with dispatch, verifies snapshot/hash, truncates later history/checkpoints, clears idempotency caches, and returns the session paused for explicit resume. Replay export contains initial snapshot, accepted actions, and boundary hashes.
