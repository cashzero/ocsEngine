# M7 Random OOB work breakdown

Status: **DONE** (M7.0–M7.10). The standalone OOB laboratory of M7.8 was later replaced by the New Game preview (`docs/game-flow/new-game-ui.md`); later revisions are `12-oob-revision-wbs.md`.

M7 outputs deterministic, validated force packages and a Foundation `PieceDefinitionCatalog`. It deliberately does not choose map Hexes, create `PieceState`, set objectives, or compose a playable `ScenarioDefinition`; those are M8 responsibilities.

| Step | Study output | Exit proof |
|---|---|---|
| M7.0 | `docs/generator-study/02-bcs-random-oob.md`, `03-btr-oob-catalog.md`, and `docs/oob/M7-btr-extraction-report.md` | BCS reuse decision plus BTR version/hash/GPID evidence |
| M7.1 | `docs/oob/M7-normalization-decisions.md` | Raw evidence is separated from synthetic ratings |
| M7.2 | `docs/oob/M7-generator-archetypes.md` | Two-sided armored/infantry/mobile template set |
| M7.3 | `docs/generator/M7-random-oob-spec.md` | Seed/scale/count input and immutable output contract |
| M7.4 | `docs/oob/M7-formation-package-policy.md` | Command, combat, artillery, and reconnaissance invariants |
| M7.5 | `docs/oob/M7-support-logistics-policy.md` | Independent artillery, engineer, transport, and supply minimums |
| M7.6 | `docs/oob/M7-validation-contract.md` | Foundation and OOB validators fail closed |
| M7.7 | `docs/oob/M7-serialization-and-boundary.md` | Canonical JSON and one-way generation dependency |
| M7.8 | `docs/oob/M7-ui-preview-and-download.md` | Scale/count/seed preview and download at 13px minimum |
| M7.9 | `docs/oob/M7-oob-seed-sweep.md` | 1,000 seeds, zero invalid/exception |
| M7.10 | `docs/oob/M7-random-oob-gate.md` | Focused, full, distribution, and browser gates |
