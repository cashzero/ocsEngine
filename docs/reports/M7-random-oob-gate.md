# M7.10 Random OOB gate

## Delivered

- Reviewed 18-entry, two-sided BTR provenance catalog with module version, build-file hash, raw names, GPIDs, confidence, and review status.
- Deterministic scale/count/seed generator for mirrored armored, infantry, and mobile-infantry formations.
- Complete organic command/combat/artillery/recon packages plus independent artillery, engineer, transport, and supply.
- Foundation-compatible Piece Definitions, canonical JSON, metrics, warnings, fail-closed validation, and 1,000-seed sweep.
- Historical responsive `#random-oob` laboratory with preview, regenerated seed, metrics, and JSON download; retired in M8/U10 in favor of the connected New Game preview.

## Boundaries

No Hex placement, `PieceState`, deployment, objectives, Scenario composition, rules mutation, or AI behavior is generated. Those remain M8/M9 work.

## Gate evidence

- Same options produce structurally and byte-identical output; different seeds change seed-scoped identities and/or formation plans.
- All three scales pass formation/support/logistics and Foundation catalog validation.
- 1,000 standard/four-formation seeds: 1,000 generated, zero invalid, zero exceptions, minimum balance 1.0.
- Distribution smoke generates a two-sided OOB and verifies balance.
- Browser verification passed on the direct `#random-oob` route at 1440×1000 and 760×1000. The narrow interaction regenerated Large/4-per-side/seed-20260831 as 90 units, eight formations, 274:274 points, and 100% balance, with no horizontal overflow or console warning/error.
- Computed narrow-layout text minimum was 13px; the responsive force columns collapsed from two columns to one while controls, metrics, Close, and Download remained available.
- `npm run check` passed: TypeScript, 30 test files / 147 tests, production build, and distribution smoke.

## Decision

M7.0–M7.10 is complete. Random Map and Random OOB are ready for M8 scenario composition and deployment.
