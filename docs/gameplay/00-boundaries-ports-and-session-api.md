# G0 Boundaries, Ports, and Session API

Gameplay is the application layer above the pure Rule Engine. It owns one authoritative snapshot per session, serial dispatch, bindings, projections, history, diagnostics, persistence coordination, checkpoints, replay, and client notifications. It delegates every OCS legality calculation and state transition to `RuleEnginePort`.

Required ports are `RuleEnginePort`, `ScenarioRepositoryPort`, `SaveRepositoryPort`, `ClockPort`, and `SessionLoggerPort`. Only memory adapters are part of this milestone. Clock/log data may describe execution but never enters rules RNG or authoritative state.

The client-facing `GameSession` exposes lifecycle, views, action discovery, drafts, pending decisions, dispatch, subscription, history, diagnostics, hot-seat handoff, save/load, checkpoints, undo, replay, and close. It never returns mutable `GameState` and never accepts UI selection/layout state.

Explicit non-goals are React/UI widgets, filesystem/browser/Electron adapters, networking, random map/OOB generation, AI policy, and duplicated movement/supply/combat predicates.
