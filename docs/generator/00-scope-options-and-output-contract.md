# M6.0 — Scope, options, and output contract

`generateRandomMap` accepts width 8–64, height 8–48 (the New Game screen offers players 16–64 × 12–48; smaller maps exist only for rule-test fixtures), uint32 seed, `TEMPERATE_INLAND` or `MEDITERRANEAN_COAST`, and an optional settlement density. Invalid options return typed errors without partial output.

Success returns generator version/options, immutable Foundation `MapDefinition`, neutral first/second entry and supply regions, settlement Hex IDs, metrics, and warnings. Random OOB, unit placement, objectives, rules configuration, and Scenario composition are explicit non-goals.

