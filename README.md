# ocsEngine

Headless-first implementation of the Operational Combat Series rules.

Implemented milestones:

- Foundation F0-F10: strict Hex/Hexside geometry, immutable Map/Piece/Scenario data, validation, canonical serialization/hash, fixtures, and package boundaries.
- Rule Engine R0-R10: OCS 4.3 ground/logistics MVP with sequence, modes, stacking, purpose-specific ZOC, movement, supply, resumable transactions, regular combat, overrun, artillery barrage, retreat/advance, reinforcement, cleanup, victory, viewer projection, strict snapshots, and deterministic replay.
- Gameplay Engine G0-G10: session lifecycle, serialized dispatch, action discovery/drafts, pending-decision coordination, redacted hot-seat views, history/diagnostics, strict save/load, checkpoints/undo, replay, recovery, and a deterministic headless driver.
- Operable UI U0-U10 (IN PROGRESS): responsive session shell, SVG Hex map, projected stack selection, legal-action explanations and dispatch, pending decisions, history, save/load, checkpoints/undo, hot-seat privacy, and a strict 13px text floor. Printed OCS counter fidelity was reopened on 2026-09-04 and is governed by `docs/quality/04-counter-fidelity-correction-plan.md`.
- Random Map M6.0-M6.10: seeded inland/coastal terrain, hydrology, settlements, opposing strategic regions, connected roads, fail-closed validation, canonical JSON, 1,000-seed gate, and an operable UI preview.
- Random OOB M7.0-M7.10: reviewed BTR provenance, seeded formation/support/logistics packages, Foundation Piece Definitions, fail-closed validation, canonical JSON, 1,000-seed gate, and an operable UI preview.
- Game Flow M8 (IN PROGRESS): integrated New Game orchestration, orthogonal map/OOB/deployment/rules seeds, deterministic legal deployment, complete Scenario composition, cross-domain validation, active Gameplay bootstrap, and generated-game UI. The real-browser turn gate passes; lifecycle, final-save/replay, and remaining product-operation rows are still being verified.

The executable manifest explicitly separates implemented, deferred, and game-specific features. AI bot remains blocked behind the full M8 product-operation gate; it will consume the generated Gameplay session and existing legal-action/query seams rather than enter the Rule Engine.

See the [implementation roadmap](docs/roadmap.md), [end-to-end game flow architecture](docs/architecture/game-flow.md), milestone WBS documents under `docs/roadmap`, and gate reports under `docs/reports`.

## Commands

```powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run check
npm run ui:serve
```

`npm run dev` builds the project and serves the UI at http://127.0.0.1:4173
(alias for `npm run ui:serve`). If the default port is occupied, it tries the next
20 ports and prints the actual URL. Set `OCS_UI_PORT` to require a specific port;
if that port is occupied, startup exits with a helpful error.
Restart the command after TypeScript changes to rebuild; automatic reload is not enabled.
