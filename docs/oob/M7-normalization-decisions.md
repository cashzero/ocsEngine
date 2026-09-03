# M7.1 OOB normalization decisions

The VASSAL `entryName` and GPID identify source evidence. Encoded VASSAL trait strings are intentionally not treated as a stable rules-data API. Consequently, historical names and role classification have `HIGH/REVIEWED` evidence, while combat/action/movement/range/step values are explicit generator design values with `MEDIUM/REVIEWED` evidence pointing to this document.

The normalized roles are formation command, combat, artillery, reconnaissance, engineer, transport, and supply. Ground units become Foundation `GROUND` definitions with a front face and contiguous step profiles. Supply becomes a Foundation `RESOURCE` definition with four printed supply points and capacity eight. Formation and side ownership use stable Definition IDs.

Generated labels are synthetic and seed-scoped; the generator does not claim to reproduce the historical Beyond the Rhine OOB. It also does not import BCS-specific command, train, activation, AV, or engagement semantics.

