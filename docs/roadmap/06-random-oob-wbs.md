# M7 Random OOB work breakdown

Status: **DONE** (M7.0–M7.10). The standalone OOB laboratory of M7.8 was later replaced by the New Game preview (`docs/game-flow/new-game-ui.md`); later revisions are `12-oob-revision-wbs.md`.

M7 outputs deterministic, validated force packages and a Foundation `PieceDefinitionCatalog`. It deliberately does not choose map Hexes, create `PieceState`, set objectives, or compose a playable `ScenarioDefinition`; those are M8 responsibilities.

| Step | Described in | Exit proof |
|---|---|---|
| M7.0 | `docs/study/11-bcs-random-oob.md`, `docs/study/12-btr-oob-catalog.md`, `docs/oob/counter-corpus.md` | BCS reuse decision plus BTR version/hash/GPID evidence |
| M7.1 | `docs/oob/counter-corpus.md` | Raw evidence is separated from normalized values (now transcribed BTR faces) |
| M7.2 | `docs/oob/random-oob.md` | Two-sided armored/infantry/mobile template set |
| M7.3 | `docs/oob/random-oob.md` | Seed/scale/count input and immutable output contract |
| M7.4 | `docs/oob/random-oob.md` | Command, combat, artillery, and reconnaissance invariants |
| M7.5 | `docs/oob/random-oob.md` | Independent artillery, engineer, transport, and supply minimums |
| M7.6 | `docs/oob/random-oob.md` | Foundation and OOB validators fail closed |
| M7.7 | `docs/oob/random-oob.md` | Canonical JSON and one-way generation dependency |
| M7.8 | `docs/oob/random-oob.md` | Scale/count/seed preview and download at 13px minimum |
| M7.9 | `docs/oob/random-oob.md` | 1,000 seeds, zero invalid/exception |
| M7.10 | `docs/oob/random-oob.md` | Focused, full, distribution, and browser gates |
