# M7.4 Formation package policy

Formation composition depends on the archetype (references: Beyond the Rhine counter sheets 1B/2B/3B/3F, rules 20.0):

- **Armored** and **mobile infantry** (Axis Panzergrenadier/Führer) divisions are multi-unit: one `FORMATION_COMMAND`, at least two `COMBAT` units, an `ARTILLERY` unit (two at LARGE scale) and reconnaissance. The Allies have no mobile-infantry package; their mobile slot is filled with an armored division.
- **Infantry** divisions are a single `COMBAT` unit on an XX counter, 4 steps, with no HQ, artillery or reconnaissance (GPID 339 Allied, motorized/truck move face; 826 Axis, leg). Rule 20.0 lets such a division detach Breakdown regiments in play (not yet implemented in the Rule Engine).
- **Airborne** divisions (its own archetype, never "mobile") are likewise a single leg-mobile XX unit on both sides. The German Fallschirmjäger counter is transcribed from sheets 3F/3B (18-3-3 / 9-3-4). The US airborne division is a flavor choice: the sheets print its regiments separately, so the XX counter's numbers are estimated. See TODO `airborne-gpid` in `catalog.ts` and TODO `allied-airborne-division-counter` in `counter-corpus.ts`.

The command element is a force-organization marker in generated data, not an imported BCS HQ command model. Every unit references the containing side and formation through Foundation Definition IDs. Names and local IDs are deterministic functions of seed, side, formation ordinal, role, and role ordinal.

Point values are attached to reviewed archetypes. Allied and Axis packages use matched costs and the same archetype plan, making the intended balance observable rather than dependent on retry loops.


Naming: formation and unit names use the short counter forms, not full titles or nicknames (`shortFormationName` in `names.ts`): `82.Abn`, `2.A`, `35.Inf`, `12.SS`, `3.PG`, `352.VG`, `6.FJ`, `FBB`; a single-unit division counter is named exactly after its formation, and support units use abbreviations (`Div Arty I`, `Rcn Det`, `Truck Co`, `Pi Bde`).
