# Study 6: `bcsEngine` reuse assessment

## Scope and method

Reviewed repository areas:

- application/tooling: `package.json`, Vite, TypeScript, Vitest, Playwright,
  Electron, `index.tsx`, `App.tsx`;
- domain facade: `types.ts`, `constants.ts`, `engine/`;
- pure/rules utilities: `utils/`;
- UI and state: `components/`, `hooks/`, `handlers/`;
- content tooling: `scenarios/`, `scenarioTemplates/`, map/scenario generators;
- automation: `ai/`, headless self-play, telemetry, unit and E2E tests.

Classification means:

- **Direct**: copy with names/license/tests adjusted, with no OCS rule meaning
  inherited.
- **Adapt**: extract a generic seam, replace BCS types/rules, and prove with
  focused tests.
- **Reference**: preserve an architectural or UX lesson but write OCS code anew.
- **None**: BCS semantics or coupling outweigh reuse value.

Approximate source/test size reinforces the need for selective extraction:
`utils` is about 9.9k lines, `ai` 7.8k, `components` 7.0k,
`hooks`+`handlers` 4.2k, unit tests 13.0k, and E2E tests 2.5k. A repository fork
would import far more BCS behavior than useful infrastructure.

## Executive finding

Do not fork `bcsEngine` as the starting OCS codebase. Build `ocsEngine` as a new
headless domain engine and selectively extract a small generic platform layer.

The only strong direct candidates are deterministic RNG and viewport math.
Hex-grid geometry is a high-value extraction from a mixed file. The random-map,
random-OOB/scenario, independent-seed, validation, and paired-self-play
pipelines are now primary architectural adaptation targets. Their BCS rule
predicates and content still must be replaced. All rules, unit state, phases,
legal actions, handlers, combat/logistics semantics, OOB content, AI policies,
and UI code are BCS-specific.

The product decision is to rebuild the UI. `HexMap`, counter components,
dialogs, editors, application composition, and the Electron presentation shell
are therefore excluded from extraction even when they contain useful UX ideas.
Pure viewport and coordinate algorithms remain eligible because they have no
visual design or rule ownership.

## Architectural evidence

### Positive patterns worth preserving

- `engine/gameAction.ts` uses a discriminated action union.
- `engine/gameState.ts` builds a serializable state containing explicit RNG and
  pending decisions.
- `engine/legalActions.ts` derives stable, de-duplicated actions from state and
  gives pending decisions precedence.
- Vitest covers rule utilities; Playwright covers shell/editor/player flows and
  large-map viewport behavior.
- seeded self-play, telemetry, and score explanations create a useful later AI
  validation loop.

### Boundary that must be improved in OCS

`getLegalActions` is headless-looking, but state mutation is not owned by a
single pure engine reducer. `useBotController` projects React context into a
`GameState`, chooses a legal action, then `botExecutor` calls UI/gameplay
handlers such as movement, activation, and combat handlers. Human and bot flows
therefore converge at React-oriented mutation functions rather than at a pure
`applyAction(state, action)` transition.

OCS has more multi-step transactions and resource reservations than BCS. It
should establish this boundary from the first milestone:

```text
getLegalActions(state, actor) -> Action[]
applyAction(state, action) -> { state, events }
projectState(state, viewer) -> ViewState
UI / bot / replay / tests all call the same two engine functions
```

React hooks should subscribe and dispatch only. They must not contain rule
transitions.

## Module-by-module decision

### Direct candidates

| Source | Decision | Conditions |
|---|---|---|
| `engine/random.ts` immutable RNG functions | Direct | Copy `normalizeSeed`, immutable RNG state, `nextRandom`, integer/dice helpers, and tests. Use immutable state in rules; avoid the mutable callback wrapper as the authoritative source. |
| `utils/mapViewport.ts` | Direct | Copy both pure viewport functions and `ut/mapViewport.test.ts`; keep UI offset/bucket parameters outside domain code. |

Both files are MIT-licensed with the rest of `bcsEngine`; substantial copied
code must preserve the license notice.

### Extract and adapt

| Source | Reusable seam | Required change |
|---|---|---|
| `utils/hexUtils.ts` | axial coordinates, pixel conversion, key parse/format, neighbors, opposite direction, distance, interpolation, direction, range | Split into `core/hex`; replace BCS `Direction`/constants with generic types. Do not copy movement cost, OBJ, road, or BCS LOS functions into the geometry module. |
| scenario save/load | JSON boundary and explicit translation approach | Introduce a versioned OCS schema plus validation/migrations; never deserialize directly into live types. |
| Vitest/Playwright configs | unit/E2E separation, CI retries, screenshots/traces, Vite-owned server | Rename environment variables/ports, remove BCS names, and add pure-engine test projects. |
| generic graph-search shape in `utils/path.ts` | queue/visited/path reconstruction ideas | Create a typed weighted search service returning paths and rejection explanations. Do not retain MSR, Combat Train, Safe Path, BCS ZOC, or BCS terrain predicates. |
| `utils/mapGenerator.ts` | seeded staged generation, noise fields, hydrology, settlement suitability, graph construction, roads, summary and invariant testing | Make this a priority adaptation after the OCS map-requirements study. Replace all BCS terrain, supply, road, weather and balance assumptions. |
| `scenarioTemplates/*` | versioned templates, formation/independent blueprints, exact source metadata, scale-specific settings | Define OCS formation, support, logistics and scenario-template schemas. Do not copy BCS doctrines, HQ command, Combat Trains, AV or force ratios. |
| `utils/scenarioGenerator.ts` | independent OOB seed, force selection, deployment, objectives, result summary, warnings and fail-fast validation | Split OOB selection from placement, preserve force identity across maps, and replace MSR/formation/stacking/combat predicates with OCS rules. |
| `utils/selfplayScenario.ts` | compose independent map/OOB seeds into a headless scenario without editor automation | Add separate rules/bot RNG, canonical provenance and OCS scenario configuration. |
| self-play runner/evaluation shape | swapped-seat paired runs, fixed-map/fixed-OOB sweeps, common random numbers, telemetry and promotion gates | Build on the pure OCS reducer; do not retain the browser/React-handler executor dependency. |

### Reference only

| Source | Lesson to keep | Why not code reuse |
|---|---|---|
| `engine/gameState.ts` | explicit version, RNG, pending decisions, serializable snapshots | State fields and activation hierarchy are BCS-specific; OCS needs player turns, missions, cargo, resources, transactions, and infrastructure. |
| `engine/gameAction.ts` | discriminated command names and stable action keys | Action vocabulary is almost entirely BCS. OCS actions need actor/transaction/revision metadata. |
| `engine/legalActions.ts` | authoritative action enumeration and stable ordering | Its phase, formation, OBJ, combat, movement, replacement, and status logic is BCS. |
| combat/fire/retreat UI | present inputs, modifiers, outcomes, and guided decisions | Current dialogs calculate domain results and carry BCS fields; OCS transactions need engine-generated prompts/explanations. |
| AI strategy registry and telemetry vocabulary | strategy interface, traceable decisions, score explanations and promotion metadata | Policies and scores depend on BCS activations, formations, objectives, and legal actions. Write an OCS bot after the generated-scenario rules slice is executable. |
| rule-numbered test organization | trace tests back to rules and include E2E/performance gates | Fixtures and expected results are BCS; rebuild from OCS tables and scenarios. |

### No reuse

| Area | Reason |
|---|---|
| `components/`, UI portions of `hooks/`, dialogs, and editor UI | The UI will be redesigned. Copying components would retain BCS visual structure, interaction assumptions, and rule coupling. |
| Electron presentation/application shell | Packaging may be reconsidered later, but the BCS shell is not a UI baseline and is not part of initial reuse. |
| `types.ts`, `constants.ts` | They are the BCS domain vocabulary and tables; copying them would make OCS migration-driven instead of rule-driven. |
| `hooks/useGamePhase.ts`, `hooks/useActivation.ts`, `hooks/useUnitManager.ts` | React owns BCS rule state/mutations; OCS requires a pure player-turn reducer. |
| `handlers/gamePlay*` | BCS formation, Support, SNAFU, OBJ, Fire Event, AV, retreat, and MSR semantics are embedded throughout. |
| `utils/activation.ts`, `attack.ts`, `fire.ts`, `movement.ts`, `path.ts`, `retreat.ts`, `stacking.ts`, `unit.ts`, `zone.ts`, `urban.ts` | Names overlap, but rule meaning differs as established in Studies 1–5. |
| BCS scenario templates/OOB/presets | Historically and mechanically BCS-specific; also outside a generic engine's series-rule responsibility. |
| all BCS AI policies/executor | Deep imports from BCS actions, types, utilities, React context, and handlers; no stable OCS domain seam. |
| `App.tsx` | Nearly one thousand lines of orchestration and local UI state; copying would preserve the coupling OCS most needs to avoid. |

## Proposed OCS module boundaries

```text
src/
├─ core/
│  ├─ hex/                 # extracted geometry only
│  ├─ rng/                 # deterministic immutable RNG
│  ├─ graph/               # typed path/search primitives
│  └─ quantity/            # Tokens, RE, exact fractional MP
├─ domain/
│  ├─ state/               # versioned authoritative GameState
│  ├─ actions/             # commands and pending decisions
│  ├─ reducer/             # only owner of rule mutations
│  ├─ sequence/            # OCS phase/segment hierarchy
│  ├─ units/               # ground/air/naval/facility/resource families
│  ├─ movement/
│  ├─ combat/
│  ├─ supply/
│  ├─ air/
│  ├─ naval/
│  └─ visibility/          # viewer-specific projections/fog of war
├─ data/
│  ├─ series/              # transcribed tables with provenance
│  └─ scenarios/           # game-specific adapters/data
├─ application/
│  ├─ store/               # dispatch/subscription, no rules
│  ├─ replay/
│  └─ persistence/
├─ ui/
│  ├─ map/                 # new OCS renderer; pure viewport math may be reused
│  ├─ counters/
│  ├─ panels/
│  └─ editors/
└─ tests/
   ├─ unit/
   ├─ contract/
   ├─ scenario/
   ├─ replay/
   └─ e2e/
```

The directories can remain shallow until enough code exists; these are
ownership boundaries, not authorization to scaffold empty abstractions.

## Extraction order and proof

1. Establish the Foundation first: copy immutable RNG and pure viewport math
   with tests/MIT notice, extract dependency-free hex geometry, then define OCS
   map, piece definition/state, location, relation, schema and fixture contracts.
2. Establish the pure OCS state/action/legal-action/reducer contract and
   implement the ground/logistics Rule Engine against fixed synthetic fixtures.
3. Build the Gameplay Engine for session lifecycle, dispatch, projection,
   persistence, save/load and replay.
4. Build a new manually operable map/counter/action UI against the Gameplay
   Engine; prove a human can finish the fixed scenario.
5. Complete the BCS random-map study, then adapt the staged generation
   architecture using OCS map invariants and the already-stable map schema.
6. Complete the BCS random-OOB and Beyond the Rhine catalog studies; extract
   reviewed OOB records and separate generator archetypes from `buildFile.xml`.
7. Adapt force selection, deployment, objectives, warnings and validation;
   prove generated scenarios can be completed through the existing UI.
8. Complete the BCS AI/self-play study, then build the OCS bot exclusively
   against the Gameplay Engine's view, legal actions and dispatch contract.
9. Add paired fixed-map/fixed-OOB self-play and only then expand advanced UI,
   editors or desktop packaging.

## Acceptance checks for reused code

Every extraction must pass:

- no import from BCS `types.ts`, `constants.ts`, hooks, handlers, or AI;
- original focused tests ported and passing;
- at least one OCS-facing contract test;
- no BCS terms in the public API unless the concept is proven identical;
- deterministic serialization/replay where state is involved;
- license attribution retained for copied substantial portions;
- repository remains free of BCS scenarios and copyrighted assets.

## Risks and unresolved questions

- Confirm both repositories' ownership/licensing expectations before copying
  files; the reviewed BCS repository carries an MIT license.
- Decide whether OCS maps use the same axial orientation and edge numbering as
  BCS before freezing scenario schema.
- UI reimplementation is an explicit product boundary; no proof-of-concept is
  needed to decide whether to extract BCS components.
- The random-map requirements study must define the initial ground/logistics
  terrain subset and synthetic TEC before adapting generation algorithms.
- Random OOB needs a reviewed Beyond the Rhine catalog and archetype policy;
  VASSAL saved-game placement is not a prerequisite.
- Browser-first versus Electron-first delivery should be decided in the final
  roadmap; current evidence favors browser/headless first.

## Completion checklist

- [x] Tooling, engine, utilities, UI, content, AI, and tests were inspected.
- [x] Reuse is classified as direct, adapt, reference, or none.
- [x] React/handler mutation coupling is identified as a non-reusable boundary.
- [x] Target module ownership and extraction order are defined.
- [x] Proof, licensing, and contamination gates are explicit.
