# M7.4 Formation package policy

Formation composition depends on the archetype (reference: Beyond the Rhine counter sheets 1B/2B):

- **Armored** and **mobile infantry** (Axis Panzergrenadier/Führer) divisions are multi-unit: one `FORMATION_COMMAND`, at least two `COMBAT` units, an `ARTILLERY` unit (two at LARGE scale) and reconnaissance.
- **Airborne** divisions (Allied only) are multi-unit: one `FORMATION_COMMAND` and the scale's combat count plus one leg-mobile regiment. They carry no organic reconnaissance and no tracked artillery; artillery comes from independent corps units. Both counter faces use the leg mobility class.
- **Infantry** divisions are a single `COMBAT` unit on an XX counter (GPID 339 Allied, 826 Axis), with no HQ, artillery or reconnaissance. The Allied division is motorized (truck Movement Allowance); the Axis division is leg.

The command element is a force-organization marker in generated data, not an imported BCS HQ command model. Every unit references the containing side and formation through Foundation Definition IDs. Names and local IDs are deterministic functions of seed, side, formation ordinal, role, and role ordinal.

Point values are attached to reviewed archetypes. Allied and Axis packages use matched costs and the same archetype plan, making the intended balance observable rather than dependent on retry loops.

