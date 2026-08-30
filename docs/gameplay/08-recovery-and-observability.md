# G8 Recovery, Fault Isolation, and Observability

Expected Rule rejection, stale revision, duplicate request/action, invalid binding, save incompatibility, adapter failure, subscriber failure, and unexpected engine failure are distinct outcomes.

Rule rejection preserves state and accepted history. A persistence failure occurs after commit, producing a durable warning/metric without rolling state back. Listener and logger exceptions are isolated. An unexpected Rule exception or impossible post-transition hash freezes further interaction in `FAULTED`; its authoritative snapshot remains available through diagnostics but cannot be saved as a normal resumable session.

Clock, latency, metrics, logs, and summaries are observational only. They never affect Action construction, Rule state, rules RNG, state hashes, save replay, or candidate results.
