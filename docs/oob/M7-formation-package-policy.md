# M7.4 Formation package policy

Each generated formation must contain exactly one `FORMATION_COMMAND`, at least two `COMBAT` units, and at least one `ARTILLERY` unit. Armored and mobile-infantry formations additionally contain reconnaissance. Large scale adds one organic artillery element.

The command element is a force-organization marker in generated data, not an imported BCS HQ command model. Every unit references the containing side and formation through Foundation Definition IDs. Names and local IDs are deterministic functions of seed, side, formation ordinal, role, and role ordinal.

Point values are attached to reviewed archetypes. Allied and Axis packages use matched costs and the same archetype plan, making the intended balance observable rather than dependent on retry loops.

