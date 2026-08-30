# U6 — Pending decision flow

## Study result

When a projected pending decision exists for the active seat, a modal dialog blocks ordinary interaction and lists only its visible options. Choosing one calls `respondToPendingDecision`; the UI does not interpret resource, loss, retreat, or advance semantics.

A decision owned by another viewer is absent from that viewer's projection. During privacy handoff, the entire projection and decision dialog remain hidden behind the privacy screen.
