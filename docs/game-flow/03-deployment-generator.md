# M8.3 Deterministic deployment generator

Deployment turns M7 force identities into Foundation runtime state.

1. Remove water from candidate Hexes and divide land by distance to the opposing entry anchors.
2. Rank each side's zone by distance plus deployment-seed jitter.
3. Site each supply dump inside its side's zone, at least three Hexes in from the entry Hex and (preferably) three
   Hexes from the other dumps, on the nearby Hex whose 5-Truck-MP draw range covers the most ground.
4. Keep one independent support unit per side in a named off-map reinforcement box so the generated
   Gameplay flow exposes a real Reinforcement placement operation.
4. Deploy the remaining units as formation groups, not one blob: each formation (and the independent units)
   gets a centre at least three Hexes from the others, inside the dumps' draw range so Truck and Track units can be
   fuelled (12.5). Units of one formation share the centre or stand adjacent, at most two per Hex. Spacing relaxes
   only when the zone is too small, finally to the dense three-per-Hex fallback.
5. Initialize owner, face, full steps, `MOVE` mode for ground units, resource quantity, stack order, and formation membership.
6. Set control on each side's entry/supply Hexes and on the railroad Hexes in its zone (13.3h).
7. Choose objectives in Major Cities and towns only, never villages or open country (user request 2026-10-04: more
   VP, and in towns). Each Major City is one objective on its core Hex worth 3 VP; a town is worth 1 VP. Each
   side's zone gets the same VP total, about one VP per 64 of its land Hexes (at least 2), filled with its Major
   Cities and then its towns nearest the front, so the towns at stake lie where the armies meet. Each side starts
   controlling the objectives in its zone, so the score starts level and only captures change it. The default
   32×24 Temperate inland map gets 8 objectives (6 VP a side).

   Known limitation: when one side's zone has too few towns to match the other's Major City VP (seen only on the
   smallest Eastern Europe maps, 16×12), the sides start unequal; the preview then lists an "Objectives are
   unbalanced" warning. TODO: balance such maps (for example by starting the surplus objectives uncontrolled);
   accepted when every 16×12 Eastern Europe preview on seeds 1, 0x0c500001 and 777 starts with equal VP and no
   such warning.

The deployment seed changes location choice only. Insufficient land or strategic regions fails at `DEPLOYMENT`; it never silently drops a unit.

Implementation: `src/game-flow/deployment.ts`.
