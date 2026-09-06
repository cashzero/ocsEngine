# Random OOB WWII naming — 2026-09-06

Scope: replace generic formation/role strings with US/German WWII-style identities,
following the naming direction of bcsEngine/scenarioTemplates/oobFormations.ts and its
supplemental formation catalog. The imported pool currently contains 55 reviewed
formation profiles. Historical names are reference identities; subordinate packages
remain synthetic. No claim of historical order-of-battle accuracy is made.

Acceptance steps:
1. Generate all scales and up to six formations per side; names must be distinct,
   deterministic, side-appropriate, and identify the unit role.
2. Preserve composition, ratings, capabilities, IDs, balance, and generation validity.
3. Inspect names in the combined New Game preview, start that same package, and
   compare names in gameplay inspection against the preview.

Automated evidence: random-oob, oob-names, and oob-seed-sweep tests cover generation,
balance, determinism, maximum formation count, pool reachability, and unique WWII
names across all scales.

UI acceptance: UNVERIFIED. TODO: exercise step 3 in the actual integrated UI;
longer names may affect readability/truncation. Close with recorded preview and
mounted-game screenshots showing matching readable names. No product-operation
gate is promoted by these generator tests.
