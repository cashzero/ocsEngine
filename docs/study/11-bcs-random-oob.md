# BCS random OOB reuse study

`E:\work\bcsEngine\utils\scenarioGenerator.ts` was inspected as an algorithm reference. Its useful seams are deterministic seed hashing/ranking, explicit force-size and formation-count settings, balanced blueprint selection, formation packages, independent support selection, result summaries, and invariant validation.

The OCS implementation reuses those pipeline ideas but not source code or mechanics. Selection ends at force identity and Piece Definitions. BCS deployment, objectives, HQ command range, Combat Trains, SNAFU, AV, activation, and engagement-zone checks are excluded. OCS support/logistics roles and validity are expressed through existing Foundation vocabulary.

The reuse boundary is therefore:

```text
options -> seeded archetype plan -> complete force packages -> validate -> summarize
```

Map Hex selection, scenario state, and playability remain downstream in M8.

