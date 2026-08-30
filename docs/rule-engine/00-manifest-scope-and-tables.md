# R0 Rule Manifest, Scope, and Tables

This document is the R0 entry point. The detailed study outputs are intentionally split so that each decision can be reviewed independently:

- [Rule feature manifest](00-rule-manifest.md) maps every supported or deferred feature to rule citations, owner, actions, queries, and tests.
- [Ground/logistics MVP scope](00-mvp-scope.md) defines observable completion and explicit non-goals.
- [Rule-table provenance](00-table-provenance.md) records source identity, checksum, locator, review state, and precedence.

The executable counterparts are `RULE_FEATURE_MANIFEST`, `RULE_TABLE_PROVENANCE`, and `requireImplementedRuleFeature` in `src/rules/manifest.ts`. An undeclared, deferred, game-specific, or otherwise unsupported feature is never silently approximated.

R0 is complete when those three documents agree with the executable manifest, every `IMPLEMENTED` row names an existing automated test, and the R10 gate reports no missing evidence.
