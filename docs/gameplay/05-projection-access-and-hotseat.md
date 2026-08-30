# G5 Projection Access and Hot-Seat Privacy

`getView` resolves a Seat binding and returns only Rule projection plus Gameplay metadata. Enemy stack contents retain the Rule Engine redaction policy; authoritative `GameState` is not exposed by the public session API.

Hot-seat handoff is a two-step token flow. `beginHandoff` locks every projection and action-discovery response behind a privacy screen. Only the exact token completes the transition to the target Seat. Handoff state is interaction/access coordination and never changes Rule revision or enters the authoritative save snapshot.

Observer/debug raw-state access is not part of this milestone. A future adapter must add an explicit policy rather than bypass the projection port.
