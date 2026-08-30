# ocsEngine

Headless-first implementation of the Operational Combat Series rules.

Implemented milestones:

- Foundation F0-F10: strict Hex/Hexside geometry, immutable Map/Piece/Scenario data, validation, canonical serialization/hash, fixtures, and package boundaries.

Rule Engine, Gameplay session orchestration, operable UI, random map/OOB generation, and AI bot remain later milestones.

See the [implementation roadmap](docs/roadmap.md), [Foundation WBS](docs/roadmap/01-foundation-wbs.md), and [F10 integration report](docs/reports/F10-foundation-integration.md).

## Commands

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run check
```
