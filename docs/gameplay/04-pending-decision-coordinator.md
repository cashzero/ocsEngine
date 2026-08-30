# G4 Pending-Decision Coordinator

The Rule Engine remains authoritative for transaction and pending-decision state. Gameplay exposes a descriptor only to the bound owner Seat, including stable decision/transaction IDs, revision, kind, and options. Reconnect or reload derives the same descriptor from the restored Rule snapshot.

`respondToPendingDecision` builds a revision-bound Rule response and sends it through the normal serialized dispatch path. Wrong-seat, stale, completed, or invalid responses are rejected without mutation. Every accepted transition publishes a pending-decision-changed notification; UI modal-open state is deliberately not stored.
