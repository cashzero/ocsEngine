# R9 Lifecycle, Reinforcement, Facility State, and Victory

Reinforcement placement is a validated public action in the friendly Reinforcement Phase. The Piece must be owned, await entry in a Box/Pool/Track, use an Entry declaration compatible with the Player Side, and pass stacking. Placement updates location and Hex control atomically.

Movement and combat advance also update control through `MapState`; no parallel objective-control ledger exists. Clean Up restores DG/Exploitation Pieces to the recorded prior Combat/Move orientation (or deterministic Move fallback), removes the temporary prior-mode status, clears only that Player's usage commitments, and recomputes objective scores.

Victory is a data-driven adapter over configured objective Hexes, points, and turn limit. At completion it records all scores, a unique winner or tie, and `TURN_LIMIT`; game-specific VP tables remain `GAME_SPECIFIC` in the manifest.

Foundation already supports mutable Facility/Hexside damage overlays. The ground MVP preserves and validates them, but direct Facility Barrage tables, rail-gauge repair, port/air-base effects, replacements, engineering, and capture tables remain deferred. They must enter through reviewed transactions rather than a client-authored damage mutation.
