# R8 Combat, Overrun, Barrage, Retreat, and Advance

Ground combat queries validate ownership, adjacency, target geometry, attack capability, mode, current face/step, and phase. They derive effective strengths, odds band, Action Rating modifier, and target terrain facts with rule citations. DG and Out-of-Supply modifiers are applied at calculation time; no effective rating is stored.

Regular Combat and Overrun use the same transaction and table calculator. Overrun is declared only from a Movement Segment and holds the current-mover lock. Artillery Barrage requires the Artillery capability, range, phase eligibility, unused firing state, target family, and mandatory supply reservation.

Commit consumes reservations, draws exactly two Rule dice, selects the normalized table result, and records the roll before exposing result choices. Step loss, retreat, and advance are owned serializable decisions. One-step loss moves a Piece to `ELIMINATED`; because Foundation retains its last printed step profile for structural identity, Rule logic treats location—not a fabricated zero-step profile—as elimination. Retreat avoids absent Hexes, enemy occupation, effective retreat ZOC, and overflow. Advance is explicit and optional.

No-effect/DG-only results close immediately. Other result chains close exactly once after all required decisions. Cancellation is impossible after the roll. Full published CRT/Barrage player-aid data, AT/category shifts, surprise sub-rolls, tagalong, mixed facility targets, air, and naval Barrage remain deferred until reviewed table data is supplied; the current MVP does not silently invent those values.
