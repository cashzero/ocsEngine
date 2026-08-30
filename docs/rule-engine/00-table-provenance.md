# R0 Rule Table Provenance

The authoritative local series-rule source is `docs/rules/ocs-series-rules-v4.3.md` (292,684 bytes), SHA-256 `5a0809f449859f1928a568b8695cf6bcb2d0f27934091cc4b8124db43679057f`.

`RULE_TABLE_PROVENANCE` pins the MVP Ground Combat table to rules 9.7–9.10 and the Artillery Barrage table to rules 10.0–10.1. Both have series priority 100. Game-specific override data has priority 200 and must be explicitly reviewed before use. Higher priority wins only when the table ID and supported action purpose match; unresolved equal-priority conflicts are validation errors.

The MVP tables are intentionally normalized data used to exercise the Rule Engine contract. They do not claim to reproduce a copyrighted player-aid chart. Extending their result bands requires reviewed table data and tests, not hard-coded UI logic.
