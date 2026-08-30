# Foundation glossary

This glossary is normative for Foundation and later engine layers. Game-specific
terms may extend it, but must not redefine these entries.

| Term | Definition |
|---|---|
| Piece | Any independently identified physical or informational object in game state. |
| Unit | A Piece representing a military formation with unit-specific definition and state. |
| Counter | A presentation/physical form; not a domain superclass. A counter may depict a Unit, Marker, or Facility. |
| Marker | A Piece that records or communicates state and is not a Unit. |
| Facility | A Piece representing an installation or logistical asset rather than a formation. |
| Definition | Immutable scenario-stable printed or source data. |
| State | Minimal authoritative facts that may change during play. |
| Derived value | A value calculated from definition, state, rules, and configuration; never persisted as authority. |
| View | A viewer-specific projection of authoritative information, including concealment/redaction. |
| Hex coordinate | A pointy-top axial `(q, r)` logical map position. |
| Hex ID | The canonical serialization `q,r` of a Hex coordinate. |
| Hexside | The canonical shared edge between two neighboring Hexes; introduced in F3. |

External scenario labels such as printed hex numbers are source metadata, not
engine Hex IDs. Their mapping belongs to MapDefinition in F4.
