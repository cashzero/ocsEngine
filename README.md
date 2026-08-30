# ocsEngine

Headless-first implementation of the Operational Combat Series rules.

Implemented milestones:

- Foundation F0-F10: strict Hex/Hexside geometry, immutable Map/Piece/Scenario data, validation, canonical serialization/hash, fixtures, and package boundaries.
- Rule Engine R0-R10: OCS 4.3 ground/logistics MVP with sequence, modes, stacking, purpose-specific ZOC, movement, supply, resumable transactions, regular combat, overrun, artillery barrage, retreat/advance, reinforcement, cleanup, victory, viewer projection, strict snapshots, and deterministic replay.
- Gameplay Engine G0-G10: session lifecycle, serialized dispatch, action discovery/drafts, pending-decision coordination, redacted hot-seat views, history/diagnostics, strict save/load, checkpoints/undo, replay, recovery, and a deterministic headless driver.
- Operable UI U0-U10: responsive session shell, SVG Hex map, projected counters/stacks, legal-action explanations and dispatch, pending decisions, history, save/load, checkpoints/undo, hot-seat privacy, and a strict 13px text floor.

The executable manifest explicitly separates implemented, deferred, and game-specific features. Random map/OOB generation and AI bot remain later milestones; they consume Gameplay rather than entering the Rule Engine.

See the [implementation roadmap](docs/roadmap.md), [Foundation WBS](docs/roadmap/01-foundation-wbs.md), [Rule Engine WBS](docs/roadmap/02-rule-engine-wbs.md), [Gameplay WBS](docs/roadmap/03-gameplay-engine-wbs.md), [UI WBS](docs/roadmap/04-ui-wbs.md), and [U10 integration report](docs/reports/U10-operable-ui-gate.md).

## Commands

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run check
npm run ui:serve
```
