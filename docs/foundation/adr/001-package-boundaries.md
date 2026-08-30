# ADR 001: package boundaries

Status: accepted for Foundation.

## Decision

Dependencies point in one direction:

```text
core -> domain -> rules -> gameplay -> ui / generation / ai
```

- `core` owns dependency-free identity, exact scalar, validation, ordering, and
  hex geometry contracts.
- `domain` owns map, piece, and scenario data structures, but no rule decisions.
- `rules` owns legality and deterministic state transition logic.
- `gameplay` owns turn/phase orchestration, commands, logs, and replay.
- UI, generators, and AI consume public gameplay/rule projections and do not
  become authoritative state owners.

Foundation code must not import React, browser APIs, UI state, random-map
generation, AI, gameplay orchestration, or BCS domain/rule modules.

## Data layering

- OCS series data defines shared vocabulary and rule-facing categories.
- Game data defines title-specific terrain, charts, unit catalogs, and options.
- Scenario data selects a game definition and supplies map/OOB/setup/turn data.

Later layers may reference lower-layer IDs; lower layers never reference later
runtime services.
