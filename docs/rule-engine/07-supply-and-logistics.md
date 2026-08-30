# R7 Supply and Logistics

Supply queries are purpose typed (`TRACE`, `COMBAT`, `BARRAGE`, `FUEL`). They resolve on-map, linked Box, and recursively contained Resource locations; trace paths use deterministic BFS through existing Hexes, avoid enemy Ground Pieces and effective supply ZOC, and respect configured range.

A consumer first attempts a declared Source path, then an eligible non-Strat HQ relay. If neither exists, eligible owned Resource Pieces are ordered by distance and ID. Eating from an on-map dump costs one integer Token per two RE (rounded up) in the MVP. `CHECK_SUPPLY` either proves free trace or names a source, consumes once, and writes the typed Out-of-Supply status immutably.

Combat and artillery use reservations, so declaration/choice cannot double-spend and cancellation cannot leak supply. Resource quantities remain on Foundation Piece state, preserving one conservation ledger.

Extenders, fuel-duration variants, Low/Exhausted recovery, attrition/breakout, load/unload/combine/divide, and capture/blow tables remain manifest-deferred rather than approximated.
