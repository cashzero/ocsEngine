# AIR-16 flying weather

Script: `scripts/air-acceptance/run-flight.mjs` (real Chromium, command deck only). Built on commit `679653a` plus the
Flight cell, the Air-tab weather notice and the wider date cell that followed it. Each run starts a Standard-scale game with
air forces and transports in **January** (snow, so the 2d6 Flight roll gives all three results), plays every phase through
the deck with refits, and at every Movement, Reaction and Exploitation Phase reads the turn bar and the Air tab.

| Run | Seeds (map/oob/deployment/rules) | Turns | Air-eligible phases read | Flight results seen | Failed rows | Console errors |
|---|---|---|---|---|---|---|
| `a` | 5301/5302/5303/5304 | 4 | 24 | None, Limited, Normal | 0 | 0 |
| `b` | 5311/5312/5313/5314 | 5 | 30 | Limited, Normal, None | 0 | 0 |
| `c` | 5321/5322/5323/5324 | 5 | 26 | None, Limited, Normal | 0 | 0 |

Expected: the turn bar names the Flight result; Normal offers missions in every phase; Limited offers them only in the
Regular Movement Phase; None offers none and the Air tab says why; every game reaches Game End without a dead end.

Observed (all three runs):

- None: 8 phases, 0 offered missions. The Air tab shows "No air missions this turn: the flying weather is None (14.1f).
  Your aircraft stay Active and your bases can still refit." Refit Phases before None turns were completed through the deck.
- Limited: 24 Movement phases (Movement and its Barrage Segment), every one offered missions.
- Normal: Movement, Reaction and Exploitation phases all offered missions.
- No Reaction or Exploitation Phase was ever shown on a Limited turn: the sequence passes them because nothing is legal
  there. The block itself is therefore covered only by the rule tests (`tests/rules/ocs-air.test.ts`, Flight Conditions).
- Not exercised in the browser: an Interception on a Limited turn, a Hip Shoot (no air force can), flying a mission on a
  Limited turn (the runs read the offer, they did not fly).

Issues found: on a None turn the Air tab vanished with no explanation, and the Flight result had no place in the turn bar.
Fixed with a Flight cell and the Air-tab notice; the runs above are the re-runs. The date cell also clips "Snow" to "Snov"
(it did before this work); its width was raised from 132 px to 152 px after these runs and has not been looked at again.
