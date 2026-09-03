# M8.8 Generated-game persistence and recovery

Gameplay save/replay snapshots already contain the authoritative GameState, including the composed Scenario and its generator metadata. M8 therefore uses the existing persistence boundary without a second generator save format.

Verified behavior:

- final save reloads as `FINISHED`;
- winner, scores and reason survive reload;
- replay contains every accepted action and the same initial/final hashes;
- Scenario metadata retains map, OOB, deployment and rules seeds;
- UI load remains restricted to the currently mounted Scenario to prevent a map/session mismatch.

Evidence: `tests/game-flow/new-game-flow.test.ts`.

