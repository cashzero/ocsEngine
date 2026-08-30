# ADR 003: hex orientation and identity

Status: accepted for Foundation.

## Decision

- pointy-top axial `(q, r)` coordinates with implicit cube `s = -q - r`;
- directions in canonical order `NE`, `E`, `SE`, `SW`, `W`, `NW`;
- east is `(q + 1, r)` and north-east is `(q + 1, r - 1)`;
- canonical Hex ID is `q,r`, with no whitespace, leading zero, or negative zero;
- layout size is center-to-corner radius;
- pixel origin and size are explicit inputs, never UI globals.

This orientation is compatible with the pure geometry convention observed in
`bcsEngine`. No BCS terrain, movement, LOS, global map, or UI behavior is reused.

Printed hex numbers remain external metadata mapped by MapDefinition in F4;
they are not overloaded as logical coordinates.
