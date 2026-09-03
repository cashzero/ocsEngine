# M6.7 — Serialization and package boundary

`src/generation` imports Foundation and serialization only. It does not import Rule Engine, Gameplay, UI, OOB, or AI. The UI presenter may consume generation output, preserving the dependency direction.

The envelope carries schema version 1, generator version, normalized options, `MapDefinition`, strategic regions, metrics, and warnings. Canonical JSON supports download, fixture comparison, and future M8 Scenario composition without changing generated geography.

