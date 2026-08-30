# G9 Headless Driver

`runHeadlessCommands` executes a fixed command list; `runHeadlessSession` repeatedly asks a deterministic script for the next command until finished, no command, rejection, or an explicit command budget. Both call only the public `GameSession.dispatch` contract and return accepted/rejected counts, final revision/hash, ordered results, and stop reason.

The acceptance script uses projected sequence, action candidates, and owner-visible pending descriptors to perform movement, supply check, artillery barrage, regular combat, resource choices, commit, retreat, advance, both Player Turns, and turn-limit victory. It then reloads the canonical save and compares replay envelopes.

The driver is not an AI: it has no planning, scoring, randomness, scenario knowledge embedded in Gameplay, React, Playwright, or generator dependency. It is the reusable headless client seam for later bots and integration tests.
