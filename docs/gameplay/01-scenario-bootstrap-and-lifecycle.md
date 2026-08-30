# G1 Scenario Bootstrap and Lifecycle

`GameplayEngine.createSession` validates an exact one-seat-per-Player binding, uint32 rules seed, Scenario/Rule configuration compatibility, and both Scenario and initial-state hashes before returning a session. Repository bootstrap resolves the same request through `ScenarioRepositoryPort`; `loadStoredSession` resolves an automatically persisted save through `SaveRepositoryPort`. Missing or invalid content never creates a partial session.

Sessions begin `READY`, explicitly enter `ACTIVE`, may move through `PAUSED`, automatically become `FINISHED` when the Rule state reaches `COMPLETE`, and close idempotently. `FAULTED` isolates unexpected Rule/hash failures. Only `ACTIVE` accepts dispatch.

Metadata exposes stable session/scenario identity, rules version, non-authoritative creation time, lifecycle, active hot-seat Seat, and current hashes. Clock values never influence Rule state or RNG.
