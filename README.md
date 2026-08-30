# ocsEngine

Headless-first implementation of the Operational Combat Series rules.

Implemented milestones:

- Foundation F0-F10: strict Hex/Hexside geometry, immutable Map/Piece/Scenario data, validation, canonical serialization/hash, fixtures, and package boundaries.
- Rule Engine R0-R10: OCS 4.3 ground/logistics MVP with sequence, modes, stacking, purpose-specific ZOC, movement, supply, resumable transactions, regular combat, overrun, artillery barrage, retreat/advance, reinforcement, cleanup, victory, viewer projection, strict snapshots, and deterministic replay.

The executable manifest explicitly separates implemented, deferred, and game-specific features. Gameplay session orchestration, operable UI, random map/OOB generation, and AI bot remain later milestones and are not embedded in the Rule Engine.

See the [implementation roadmap](docs/roadmap.md), [Foundation WBS](docs/roadmap/01-foundation-wbs.md), [Rule Engine WBS](docs/roadmap/02-rule-engine-wbs.md), and [R10 integration report](docs/reports/R10-rule-engine-integration.md).

## Commands

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run check
```
