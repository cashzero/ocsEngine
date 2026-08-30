# R6 Transaction, Reservation, and Choice Framework

Combat, Overrun, and Barrage declarations create one serializable `RuleTransaction` plus an owned `PendingDecision`. The transaction freezes participant IDs, target, owner, origin Revision, step, reservations, roll, and result. While active it locks unrelated actions and sequence advancement.

Resource choices enumerate currently reachable Resource Pieces and available quantities. A response creates a reservation but does not mutate the Resource Piece. Cancellation is permitted only before RNG commit, releases the reservation by discarding the transaction, clears Overrun mover suspension, emits one cancellation event, and consumes no RNG/resource.

Commit is the only RNG/resource commit point. After a roll, cancellation is prohibited and result-specific loss/retreat/advance decisions must complete exactly once. JSON cloning at the pending and reserved boundaries proves the data contains no callbacks or process-local handles.
