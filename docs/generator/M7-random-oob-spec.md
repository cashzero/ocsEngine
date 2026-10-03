# M7.3 Random OOB specification

Input is `{ seed, scale, divisionsPerSide, armoredDivisionsPerSide, air? }`. Seed is uint32, scale is `COMPACT`, `STANDARD`, or `LARGE`, division count is 1–12 per side, and armored divisions are 0–6 and no more than the division count (user decision 2026-10-03: the player sets the division count and how many are armored, replacing `formationsPerSide`). Invalid input returns all validation errors and no partial output.

Successful output contains generator/schema versions, normalized options, exactly one Allied and one Axis force, formation packages, independent support/logistics, a one-to-one Foundation `PieceDefinitionCatalog`, metrics, provenance, and warnings. Repeating the same options produces structurally and byte-identical canonical JSON.

The scale selects two, three, or four combat elements per formation; large formations also receive a second organic artillery element. The output has identities and definitions but no `PieceState` location, owner player, map deployment, objectives, scenario envelope, rule state, or AI decisions.

This contract is the OOB-inspired random mode. An exact historical mode is not inferred from VASSAL palette membership; it requires separate official setup/rating evidence and review before it may enter this contract.
