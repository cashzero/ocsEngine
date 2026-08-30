# R4 Mode, Stacking, ZOC, and Usage

Printed face and runtime mode remain independent. Combat, Move, Reserve, and Strat are voluntary only in the friendly Movement Segment. DG and Exploitation are involuntary. Reserve release is an explicit action in Reaction/Exploitation and is recorded in the usage ledger.

Ground stacking derives current quarter-RE ticks from the active face/step and compares them to the configured 10-RE default limit. No stack entity or duplicated membership is persisted.

ZOC is a purpose-specific query. Attack-capable Combat/Exploitation Pieces not marked Out of Supply exert adjacent ZOC. Movement/Reserve/Strat checks do not use friendly negation; supply/combat paths can report friendly negation; retreat never does. Queries return source Piece IDs and rule 4.5 explanations instead of storing an `isInZoc` flag.
