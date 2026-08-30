# R2 Sequence and Pending Decisions

The sequence records game turn, first/second Player Turn index, phase, segment, phasing Player, and currently acting Player. Reaction assigns action ownership to the non-phasing Player. Movement, Reaction, Combat, and Exploitation expose their Movement/Barrage/Combat segments explicitly.

`ADVANCE_SEQUENCE` is a regular validated action. Current-mover, active-transaction, and pending-decision locks prevent advancement. At a pending boundary, only `RESPOND_DECISION` from the decision owner is accepted. `PendingDecision` and its options are plain serializable data tied to one active transaction; R6 supplies the concrete resource/loss/retreat/advance workflows.

The sequence runs both Player Turns, Turn End, the next Weather phase, and finally `COMPLETE` at the configured turn limit. Cleanup and victory hooks are specialized in R9.
