# M7.9 Random OOB seed sweep

Protocol: generate 1,000 consecutive seeds beginning at 1 with `STANDARD` scale and four formations per side. Each output runs Foundation catalog validation and OOB invariants before it can count as generated.

Results:

| Measure | Result |
|---|---:|
| Requested / generated | 1,000 / 1,000 |
| Invalid outputs | 0 |
| Exceptions | 0 |
| Minimum balance ratio | 1.0 |
| Units per side | 29–30 |
| Armored formations | 1,317 |
| Infantry formations | 1,351 |
| Mobile-infantry formations | 1,332 |

All three archetypes were exercised, and there were no retained failure seeds. The sweep is reproduced by `sweepRandomOobSeeds` and enforced in `tests/generation/oob-seed-sweep.test.ts`.

