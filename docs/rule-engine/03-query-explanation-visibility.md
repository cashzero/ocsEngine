# R3 Query, Explanation, and Visibility

Rule queries return `allowed`, nullable value, stable reasons, typed facts, and revision-keyed dependencies. Explanations expose the same reason codes and OCS citations used by validation; UI and AI clients do not reproduce predicates.

Cache keys include Game/Map/Piece revisions, actor, purpose, and Rule configuration ID. Cached values are derived only and never enter GameState.

Viewer projection groups Pieces by typed location. A viewer receives every friendly Piece. For an enemy stack it receives only the top Piece, with remaining steps and statuses redacted, plus a hidden count; another Player's pending decision is omitted. This is a conservative headless visibility primitive, not UI state.
