# ocsEngine

A TypeScript implementation of the **Operational Combat Series (OCS)** board-wargame rules (Series Rules v4.3): a deterministic rules engine, a random map and order-of-battle generator, a game session layer, a browser UI for hot-seat play, and a headless bot-vs-bot runner.

You can use it to:

- **Play** a procedurally generated OCS operation (ground combat, logistics and supply, air power, rail, hedgehogs) in your browser, two players on one screen.
- **Embed** the engine in your own program: generate scenarios, drive games through legal actions, save, load and replay them.
- **Run bots** against each other in bulk, for testing or balance work.

> **Status.** This is an actively developed, pre-1.0 project. The rules engine and the generators are the mature parts. The browser UI is playable, but the product-operation checklist in [`docs/quality/03-product-operation-verification-plan.md`](docs/quality/03-product-operation-verification-plan.md) is still being worked through. Rows there are `UNVERIFIED` until exercised in the real UI. The bot runs headless only and has no UI seat yet. Rules coverage is explicit: see [Rules coverage](#rules-coverage).

This project is not affiliated with Multi-Man Publishing. The OCS rules belong to their authors and publisher. The files in `docs/rules/` are development transcriptions, and the printed rulebook stays authoritative.

## Quick start

Requirements: Node.js `^20.19.0` or `>=22.12.0`, and npm.

```bash
npm ci
npm run dev        # build, then serve the UI at http://127.0.0.1:4173
```

Open the URL, choose map and force settings in **New Game**, press **Generate operation** to preview the generated package, then **Start**. Two players share the screen (hot-seat), with a handoff screen between turns so each side's hidden information stays hidden.

If port 4173 is busy, the server tries the next 20 ports and prints the one it used. Set `OCS_UI_PORT` to require a specific port. There is no hot reload: restart after changing TypeScript.

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` / `npm run ui:serve` | Build and serve the web UI |
| `npm run typecheck` | Type-check sources and tests |
| `npm test` | Run the Vitest suite |
| `npm run build` | Compile `src/` to `dist/` |
| `npm run smoke` | Smoke-test the compiled `dist/` package surface |
| `npm run check` | Typecheck, test, build and smoke in one go (run before a PR) |
| `npm run test:sweep` | Opt-in slow seed sweeps (1,000-seed generator gates and equivalence checks) |
| `npm run ai:match` | Build, then run headless bot-vs-bot matches |

## How a game comes together

```text
New Game request (seeds + options)
   -> Random Map           (terrain, rivers, coast, towns, roads, strategic regions)
   -> Random OOB           (divisions, support, logistics, air; Piece Definitions)
   -> Deployment + Scenario composition + cross-domain validation
   -> Gameplay session     (seats, legal actions, pending decisions, history)
   -> Play: UI or headless client  --legal action-->  Rule Engine transition
   -> Game End: result, final save, replay
```

Map, OOB, deployment and rules each have their **own seed**, so you can vary one while holding the others fixed. All generation and all rule resolution is deterministic: the same seeds and the same actions give the same game, byte for byte. Saves and replays rely on this.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/core` | Hex geometry, identifiers, immutable data, `Result` type, validation primitives |
| `src/domain` | Map, Piece and Scenario data model (definitions, state, relations) |
| `src/serialization` | Canonical JSON, strict decoders, schema migration, state hashing |
| `src/rules` | The Rule Engine: sequence of play, modes, stacking, ZOC, movement, supply, combat, overrun, barrage, retreat/advance, reinforcement, air, rail, breakdown, hedgehogs, replacement, victory, projection. Also the executable rules manifest (`manifest.ts`) |
| `src/gameplay` | Session lifecycle, serialized dispatch, action discovery and drafts, pending decisions, hot-seat views, history, save/load, checkpoints and undo, replay, headless driver |
| `src/generation` | Random map (`map/`) and random order-of-battle (`oob/`) generators |
| `src/game-flow` | New Game orchestration: configuration, deployment, scenario composition, validation, seed-orthogonality sweeps |
| `src/ai` | Bot policies (`random-legal`, `heuristic`), match driver, training tooling |
| `src/ui` | Presenters, controller and view model for the browser UI (lit-html, SVG hex map) |
| `src/testing` | Fixtures for tests and for downstream users |
| `web/` | Static HTML and CSS shell served by `npm run dev` |
| `tests/` | Vitest suites mirroring `src/`, plus `integration/` and the `dist-smoke.mjs` check |
| `scripts/` | Dev server, bot runners, acceptance harnesses, perf tools, rulebook converter |
| `docs/` | Design documents, rules transcription, roadmap and quality records (see [Documentation map](#documentation-map)) |

Dependencies flow one way: `core` → `domain` → `serialization` / `rules` → `gameplay` → `game-flow` / `ui` / `ai`. The Rule Engine does not know about sessions, the UI or bots. Every client, including the bot, acts only through the same legal-action API.

## Using it as a library

The package is `private` and not published to npm. Build it and import from `dist/` (or from `src/` under a TypeScript toolchain). Everything is re-exported from `src/index.ts`.

Generate a complete, ready-to-play game and start a session:

```ts
import {
  DEFAULT_NEW_GAME_REQUEST,
  createGameplayEngine,
  createMemoryGameplayPorts,
  prepareNewGame,
} from './dist/index.js';

// 1. Map + OOB + deployment + scenario, from seeds and options.
const prepared = prepareNewGame(DEFAULT_NEW_GAME_REQUEST);
if (!prepared.ok) throw new Error(JSON.stringify(prepared.error));
const { scenario, configuration, bindings } = prepared.value;

// 2. A Gameplay session over the generated scenario.
const engine = createGameplayEngine(createMemoryGameplayPorts([scenario]));
const session = await engine.createSession({
  scenario, configuration, bindings, rulesSeed: 1, label: 'my game',
});
session.start();

// 3. Query a seat's redacted view, then act through legal actions.
const view = session.getView(bindings[0].seatId);

// 4. Persist and restore.
const save = session.serializeSave();
const restored = await engine.loadSession(save);
```

Useful entry points:

- `generateRandomMap({ width, height, seed, style })` and `generateRandomOob({ seed, scale, divisionsPerSide, armoredDivisionsPerSide })` for the generators alone. Both return a `Result` and fail closed on any validation problem.
- `DEFAULT_NEW_GAME_REQUEST` is a complete New Game request. Change its `seeds` and options to vary the game. `createNewGameOrchestrator(engine)` is the player-facing variant, which also enforces the UI's map-size limits.
- `ruleEngine.getActionFamilies(state, playerId)` lists the action families available to a player.
- `runHeadlessCommands` / `runHeadlessSession` (`src/gameplay/headless.ts`) drive scripted games without a UI.
- `runBotMatch` (`src/ai/driver.ts`) plays a bot match inside your own code.
- `serializeGameState`, `parseGameStateJson`, `hashGameState`, `serializeScenarioDefinition` and related functions handle canonical serialization and hashing.

`tests/dist-smoke.mjs` is a compact, runnable tour of the public surface and is the best worked example.

Functions return `Result` values (`{ ok: true, value } | { ok: false, error }`) instead of throwing for expected failures. Check `ok`.

## Bots and batch matches

Two policies ship: `random-legal` (a uniformly random legal action, useful as a baseline and fuzzer) and `heuristic` (objective-seeking, supply-aware movement and combat). Bots see only what the human in the same seat would see, and act only through legal actions.

```bash
# 20 matches, 4 workers, 8 turns, each match with different map/OOB/deployment/rules seeds
npm run ai:match -- --matches 20 --parallel 4 --turns 8 --out tmp/ai-match/smoke

# heuristic vs random, with sides swapped on alternate matches
npm run ai:match -- --allied heuristic --axis random-legal --swap

# Replay one match with a decision trace
npm run ai:match -- --matches 1 --start 7 --trace
```

Run `node scripts/ai-match.mjs --help` or read the header of that file for all options: map size, scale, air power, engagement type (`MEETING`, `ALLIED_ATTACKS`, `AXIS_ATTACKS`), fixed map or OOB seeds, and frozen baseline builds via `heuristic@<dist dir>`. A match exits non-zero if it stops for a reason other than a normal finish or fails its replay check. Outputs go under `tmp/` (git-ignored).

Other bot scripts (`ai-compare`, `ai-train`, `ai-acceptance`, `ai-narrate` and others) are in `scripts/`; each documents itself in its header.

## Rules coverage

`src/rules/manifest.ts` is the authoritative statement of what the engine implements. Each feature is marked `IMPLEMENTED`, `PARTIAL` (known gaps listed in its note), `DEFERRED`, `GAME_SPECIFIC` or `NOT_APPLICABLE`. Callers must not approximate anything marked unavailable. The engine currently targets the ground and logistics core of OCS 4.3, plus air, rail, breakdown, replacement and hedgehog rules. Game-specific rules from individual OCS titles are not included. Scenarios are generated (an Eastern-Europe-themed map and a BTR-derived order of battle) rather than taken from published games.

## Testing

```bash
npm test               # unit and integration suites (fast)
npm run test:sweep     # slow, seed-sweep gates; run when touching the generators or movement/trace code
npm run check          # what CI-quality changes should pass
```

Passing automated tests is necessary but not sufficient for UI behavior. See [Contributing](#contributing).

## Documentation map

Start at the top and go down as far as you need.

| Document | Read it for |
| --- | --- |
| [`docs/game-flow/`](docs/game-flow) | New Game pipeline, deployment, Game End and component ownership |
| [`docs/rules/README.md`](docs/rules/README.md) | The OCS v4.3 transcription and how it was produced |
| [`docs/rule-engine/`](docs/rule-engine) | Rule Engine scope, manifest and per-area design |
| [`docs/gameplay/`](docs/gameplay) | Session API, dispatch, drafts, pending decisions, save/load/replay |
| [`docs/generator/`](docs/generator) and [`docs/oob/`](docs/oob) | Map and OOB generator specifications |
| [`docs/game-flow/`](docs/game-flow) | New Game request, seeds, deployment, validation, bootstrap |
| [`docs/ui/`](docs/ui) | UI behavior, accessibility, hot-seat privacy |
| [`docs/ai/`](docs/ai) | Bot architecture, scoring and planning |
| [`docs/foundation/`](docs/foundation) | Hex geometry, data model, serialization contracts, ADRs |
| [`docs/roadmap.md`](docs/roadmap.md) and [`docs/roadmap/`](docs/roadmap) | Milestone plans and work breakdowns (project history, not required reading) |
| [`docs/quality/`](docs/quality) | Acceptance plans, TODO inventory, verification evidence |

## For AI agents working in this repo

- Read [`AGENTS.md`](AGENTS.md) first. It holds binding rules about delivery status and acceptance.
- Never describe a feature as done while any part of it is a placeholder. Record any simplification as a `TODO` that states the missing behavior, the user-visible impact and the evidence needed to close it (see [`docs/quality/01-delivery-status-and-todo-policy.md`](docs/quality/01-delivery-status-and-todo-policy.md) and [`docs/quality/05-todo-inventory.md`](docs/quality/05-todo-inventory.md)).
- User-facing flows must be operated through the real UI. The acceptance authority is [`docs/quality/03-product-operation-verification-plan.md`](docs/quality/03-product-operation-verification-plan.md).
- Rules behavior: look up the rule in `docs/rules/ocs-series-rules-v4.3.md` and in `src/rules/manifest.ts` before changing code. Do not widen or narrow rule support without updating the manifest.
- Keep the Rule Engine free of UI, session and bot concerns. Clients go through legal actions and queries.
- Determinism is a contract: no `Math.random`, wall-clock time or entropy inside generation or rules. Use the seeded RNG.
- Verify with `npm run check`. Slow generator and equivalence checks are in `npm run test:sweep`.
- Bot tuning: confirm the bot uses a mechanic correctly before adjusting balance from bot games.

## Contributing

1. `npm ci`, then make your change.
2. Add or update tests next to the code under `tests/`.
3. Run `npm run check` (and `npm run test:sweep` if you touched generation, movement tracing or reinforcement hexes).
4. For anything user-visible, exercise it in `npm run dev` and note what you observed. Tests alone do not close a UI change.
5. Record known gaps as TODOs per `AGENTS.md`; do not mark work complete over them.

## License

The code is released under the [MIT License](LICENSE). This does not cover the OCS rules text: the transcriptions in `docs/rules/` and the images extracted from the rulebook belong to their authors and Multi-Man Publishing.
