# Theater metrics in the position recorder (plan P11.5)

Boundary: offline replay of existing saves. No new games, no policy call, no change under `src/`; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [P11](../../../roadmap/18-position-metrics-wbs.md);
design: [theater supply allocation](../../../ai/theater-supply-plan.md).

## Change

`scripts/ai-position-record.mjs --theater <capture-model.json>` adds to every row:

- `theater`: both players' `theaterMetrics` (`scripts/ai-theater-allocation.mjs`) at the row's state: `potential`
  (expected VP of the allocation found for that player's next Movement segment), `allocatableSteps`, `unusedSteps`,
  `strandedSteps`, `idleTokens`, `gapObjectives`, `gapVp`;
- `theaterRealized`: what the phasing player realized by this player turn's Combat segment entry: points of objectives
  gained since the row plus the potential with units where they stand. Null when that entry cannot be rebuilt.

Every theater computation asserts the serialized state is unchanged. Without the flag the recorder is unchanged.

## Checks

| Check | Observed |
|---|---|
| Rows without the flag versus rows with it, theater fields removed, 2 P7 games (32 rows) | identical |
| Recording time for those 2 games | 45 s without, 48 s with the flag |
| Full recording: P5 Western Europe attack folders (132 saves) and P7 Western Europe attacks (48), in 19 chunks of up to 10 games | 180 games, 2,880 rows, 0 skipped for a replay hash mismatch |
| Combat entries whose lifecycle rebuild did not regenerate the recorded events | 5 (rows' `theaterRealized` null) |

The first full run used a rebuild that stopped with an error on such an entry; 3 of the 19 chunks (all P5:
`defender-1330/noeffort-temperate` games 10–19, `defender-1330/v83-temperate` games 10–19, `v84-development/attack-temperate`)
failed on it. The rebuild was changed to count the entry and return null, and those 3 chunks were recorded again; the
other 16 chunks had no such entry, so their rows are the same under either version. No other change was made.

Engine: `dist` built from `cc0c68f`; Node v26.9.0. Scripts as committed with this record: `scripts/ai-position-record.mjs`
(SHA-256 `651125e7…`), `scripts/ai-theater-supply.mjs` (`ad54291c…`), `scripts/ai-theater-allocation.mjs` (`242aebb1…`).
Row files and their hashes: [development](../ai-theater-validation-2026-10-21/development-manifest.json) and
[retrospective](../ai-theater-validation-2026-10-21/retrospective-manifest.json) manifests; the rows stay in
`artifacts/ai-theater-record/rows/`.

## Limits

The lifecycle rebuild covers an `ADVANCE_SEQUENCE` that passes through Combat; an entry reached inside a decision
response is not rebuilt. The realized value uses the same allocation search as the potential, with no movement.
