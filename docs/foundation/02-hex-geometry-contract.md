# Foundation F2: hex geometry contract

## Coordinate contract

- pointy-top axial `(q, r)` coordinates with implicit cube `s = -q - r`;
- integer, safe coordinates only;
- canonical ID format is `q,r` without whitespace, leading zeros, or `-0`;
- direction order is `NE`, `E`, `SE`, `SW`, `W`, `NW`;
- ranges and rings use deterministic axial `(q, r)` ordering;
- lines contain both endpoints and use deterministic cube interpolation/rounding.
- cube coordinates are explicit triples constrained by `q + r + s = 0`;
- rotation uses normalized 60-degree clockwise steps; reflection names the cube
  axis (`Q`, `R`, or `S`) that remains fixed.

## Public operations

- coordinate construction and equality;
- encode/parse canonical Hex ID;
- neighbor(s), opposite direction;
- distance, range, ring, and line;
- axial/cube conversion, origin/center rotation, and origin-axis reflection;
- pointy-top logical/pixel conversion with explicit layout.

## Invariants

- moving to a neighbor and then its opposite returns to the origin;
- distance is symmetric and obeys triangle inequality;
- a radius `r > 0` ring contains `6r` coordinates;
- a radius `r` range contains `1 + 3r(r + 1)` coordinates;
- a line contains `distance + 1` pairwise-adjacent coordinates;
- logical -> pixel -> logical round-trips for valid layouts.
- six rotations return the original coordinate; rotations and reflections
  preserve origin distance, and reflecting twice across one axis is identity.

## Reuse boundary

The BCS pointy-top axial convention was used as a compatibility reference.
BCS globals, types, terrain, movement cost, objective-zone, LOS, and rule
predicates are intentionally excluded.

## Layer boundary and deferred work

- canonical Hexside identity and reciprocal normalization are layered in F3,
  deliberately outside dependency-free `core/hex`;
- MapDefinition/container/bounds (F4);
- pathfinding and movement cost (Rule Engine R5);
- map rendering and input handling (UI milestone).

## Completion checklist

- [x] Geometry is dependency-free and deterministic.
- [x] Orientation and serialization are explicit.
- [x] Boundary and property-style tests cover all invariants.
- [x] No BCS domain or UI code is present.
