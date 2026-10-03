# M7.3 Random OOB specification

Input is `{ seed, scale, divisionsPerSide, armoredDivisionsPerSide, air? }`. Seed is uint32, scale is `COMPACT`, `STANDARD`, or `LARGE`, division count is 1–20 per side, and armored divisions are 0–6 and no more than the division count (user decisions 2026-10-03: the player sets the division count and how many are armored, replacing `formationsPerSide`; the maximum was then raised from 12 to 20). Every division keeps a distinct historical name: airborne slots beyond the airborne name pool (4 per side) become infantry, so 20 foot divisions are 4 airborne and 16 infantry. The Supply Table has 12 status columns, so supply income stops rising past 12 divisions. Invalid input returns all validation errors and no partial output.

Successful output contains generator/schema versions, normalized options, exactly one Allied and one Axis force, formation packages, independent support/logistics, a one-to-one Foundation `PieceDefinitionCatalog`, metrics, provenance, and warnings. Repeating the same options produces structurally and byte-identical canonical JSON.

The scale selects two, three, or four combat elements per formation; large formations also receive a second organic artillery element. The output has identities and definitions but no `PieceState` location, owner player, map deployment, objectives, scenario envelope, rule state, or AI decisions.

This contract is the OOB-inspired random mode. An exact historical mode is not inferred from VASSAL palette membership; it requires separate official setup/rating evidence and review before it may enter this contract.
