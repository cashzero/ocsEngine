# G6 History, Timeline, and Diagnostics

Accepted dispatches receive a monotonic session sequence and retain request/Seat/action identity, ordered Rule events, before/after revisions, observational timing, and a deterministic event-kind summary. Pagination supports offset, bounded limit, and Action-kind filtering. Rejected requests never enter accepted history.

Diagnostics separately expose bounded execution facts: lifecycle, revision/hash, pending kind, history length, rejection codes, accepted/rejected/duplicate counts, subscriber/storage failures, maximum observed dispatch duration, and fatal code. Logger records contain only level, stable code, session identity, revision, and time—not hidden projection facts, save payloads, or action parameters.
