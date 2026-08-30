# G2 Dispatch and Concurrency

Every dispatch is copied at receipt and appended to one promise queue. The pipeline verifies lifecycle/privacy lock, Seat-to-actor binding, expected revision, request idempotency, and accepted Action-ID uniqueness before delegating to the Rule Engine. Only a successful immutable transition replaces the snapshot, increments history, refreshes the hash, notifies listeners, and triggers persistence.

Two same-revision concurrent requests are deterministic: the first commits and the second receives `STALE_REVISION`. Reusing a request ID returns `DUPLICATE` without events or mutation; reusing an accepted Action ID under a new request is rejected.

Rule rejections append diagnostics but not accepted history. Subscriber exceptions and automatic-save failures become warnings/metrics and never roll back an accepted transition. Unexpected Rule/hash exceptions place the session in `FAULTED` isolation.
