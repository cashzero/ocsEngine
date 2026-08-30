# R5 Ground Movement and Path Execution

Movement is an atomic full-path action for the MVP. The path includes origin and every entered Hex. The query validates actor/phase/mode, adjacency, map existence, configured terrain and Hexside tick costs, enemy occupation, intermediate/final stacking, ZOC stop rules, Strat restrictions, Reserve release, exact allowance, and one-Hex minimum move.

Reachable candidates use deterministic cost/path ordering. Execution updates one Piece location and usage ledger immutably and emits the exact path/cost. Invalid paths do not mutate state. Enemy-occupied entry is rejected and routed to the R8 Overrun transaction rather than being approximated as movement.

Stack drop-off, detailed rail/sea/air transport, road-network discounts, and moving Transport pause/resume require additional reviewed data and remain manifest-deferred. The current mover field and transaction lock reserve the suspension seam without exposing partial movement to clients.
