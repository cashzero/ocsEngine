# M8.3 Deterministic deployment generator

Deployment turns M7 force identities into Foundation runtime state.

1. Remove water from candidate Hexes and divide land by distance to the opposing entry anchors.
2. Rank each side's zone by distance plus deployment-seed jitter.
3. Place supply pieces on their own generated supply region.
4. Keep one independent support unit per side in a named off-map reinforcement box so the generated
   Gameplay flow exposes a real Reinforcement placement operation.
4. Place remaining units in their side's zone with three field-unit slots per Hex.
5. Initialize owner, face, full steps, `MOVE` mode for ground units, resource quantity, stack order, and formation membership.
6. Set control on each side's entry/supply Hexes and choose a central generated settlement as objective.

The deployment seed changes location choice only. Insufficient land or strategic regions fails at `DEPLOYMENT`; it never silently drops a unit.

Implementation: `src/game-flow/deployment.ts`.
