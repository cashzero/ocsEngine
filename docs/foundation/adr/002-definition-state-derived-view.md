# ADR 002: definition, state, derived, and view ownership

Status: accepted for Foundation.

## Decision

- Definition contains immutable printed/source facts shared by every run of a
  scenario.
- State contains only authoritative facts that can change during play.
- Derived contains results such as current RE, effective strength/MA, ZOC, and
  supply status calculated from Definition + State + rules/configuration.
- View is a player- or observer-specific projection and may redact information.

Derived and View fields must not be duplicated into persistent State. Updates
are immutable: reducers create a new state graph and never mutate input objects
or collections.

Validation boundaries return typed issues/results. Invalid programmer
configuration may throw immediately; expected content/input errors do not use
exceptions as control flow.
