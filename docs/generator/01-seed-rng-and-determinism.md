# M6.1 — Seed, RNG, and determinism

The generator uses a private Mulberry32 stream and integer mixing function. No generation module calls `Math.random`, time, browser entropy, or process state. Field salts split elevation, moisture, roughness, temperature, coast, and hydrology decisions while preserving one public map seed.

All persistent collections are emitted in coordinate/canonical Hexside order. `serializeGeneratedMap` uses canonical JSON. Equal normalized options therefore yield structurally and byte-identical results.

