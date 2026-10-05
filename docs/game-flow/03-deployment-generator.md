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
6. Set initial control from the front line (13.3h; user request 2026-10-05: "也要有中立格 因為預設產生的劇本中間是沒有
   控制的"). A Hex's depth for a side is its distance to the nearest of that side's entry/supply Hexes, i.e. from its own
   map edge; the side's front is the depth of its most forward deployed piece. Each side controls its entry/supply
   Hexes and every land Hex of its zone no deeper than its front: railroads, objectives and open country alike. The
   ground between the two fronts starts neutral, railroads included, so a rail station there is not detrainable
   (13.3c) until a combat unit enters it. On the default 32×24 map each side controls about a fifth of the land.
7. Choose objectives in Major Cities and towns only, never villages or open country (user request 2026-10-04: more
   VP, and in towns). Each Major City is one objective on its core Hex worth 3 VP; a town is worth 1 VP. Each
   side's zone gets the same VP total, about one VP per 64 of its land Hexes (at least 2), filled with its Major
   Cities and then its towns nearest the front, so the towns at stake lie where the armies meet. An objective starts
   controlled only when it lies behind a side's front (step 6); most stand in the neutral ground and start held by
   nobody, so the opening score can differ between the sides (user decision 2026-10-05, replacing the earlier "each
   side starts holding the objectives of its zone"). The default 32×24 Temperate inland map gets 8 objectives
   (6 VP allotted to each zone).

   Known limitation: when one side's zone has too few towns to match the other's Major City VP (seen only on the
   smallest Eastern Europe maps, 16×12), the zones are allotted unequal VP; the preview then lists an "Objectives are
   unbalanced" warning. TODO: balance such maps (for example by starting the surplus objectives uncontrolled);
   accepted when every 16×12 Eastern Europe preview on seeds 1, 0x0c500001 and 777 allots equal VP to both zones
   and shows no such warning.

The deployment seed changes location choice only. Insufficient land or strategic regions fails at `DEPLOYMENT`; it never silently drops a unit.

Implementation: `src/game-flow/deployment.ts`.
