# Study 8: rule crosswalk and full-series dependency backlog

## Inputs

This crosswalk is derived from, and should be reviewed with:

- [Study 1: foundations and sequence](01-foundations-and-sequence.md)
- [Study 2: units, modes, ZOC, stacking, and movement](02-units-modes-zoc-movement.md)
- [Study 3: combat, barrage, retreat, and exploitation](03-combat-barrage-exploitation.md)
- [Study 4: supply, logistics, and special units](04-supply-logistics-special-units.md)
- [Study 5: air, weather, naval, and optional rules](05-air-weather-naval-optional.md)
- [Study 6: `bcsEngine` reuse assessment](06-bcsengine-reuse-study.md)
- [Study 7: Beyond the Rhine VASSAL reference](07-beyond-the-rhine-vassal-reference.md)

The active product delivery plan is [ocsEngine Roadmap: Random Map, Random OOB,
and AI Bot](../roadmap.md). This document preserves the full OCS rule crosswalk
and subsystem dependencies. Its legacy `M0`–`M11` labels are not the current
delivery order and are not calendar estimates.

## Scope conclusion

`ocsEngine` should be a new OCS domain engine with a selectively extracted
platform layer from `bcsEngine`. It should not be a BCS fork or a gradual rename.

The first delivery target is the Hex/Map/Piece Foundation, followed by the pure
OCS Rule Engine, Gameplay Engine and a manually operable new UI using fixed
synthetic scenarios. Only after a human can complete that scenario through the
public gameplay contract does delivery proceed to random map/OOB generation.
AI follows generated scenario integration and consumes the same legal actions
and dispatch path.

The initial Rule Engine slice is ground/logistics plus artillery. Air/naval
schemas are reserved, while scenarios requiring unfinished systems fail
validation.

Beyond the Rhine supplies source-traceable OOB evidence and generator
archetypes. Its `buildFile.xml` is the primary catalog input; `.vsav` scenario
placement is optional and is not the generator's foundation.

The product UI will be implemented anew. BCS and VASSAL interfaces may inform
workflow requirements, but their components, dialogs, editors, and visual
composition are not implementation inputs.

## Plan-level reuse classification

| Classification | Roadmap boundary |
|---|---|
| Direct | Immutable RNG and pure viewport math only, with MIT attribution and focused tests. |
| Adapt | Dependency-free hex geometry, generic graph/search patterns, versioned persistence patterns, and test configuration after OCS contracts exist. |
| Reference | BCS headless/action/testing lessons and VASSAL setup, board, OOB, and workflow evidence. |
| None | BCS rules/domain/AI/UI, VASSAL UI/trait automation, and copyrighted game assets. The OCS UI is a new implementation. |

The full series target remains OCS v4.3 sections 1.0–21.12 plus game-specific
data adapters. “MVP complete” and “series rules complete” are separate gates.

## OCS-to-BCS rule crosswalk

| OCS section | OCS subsystem | Closest BCS concept | Reuse conclusion | Planned milestone |
|---|---|---|---|---|
| 1.0 | Scale | 1.0a Scale | None at rule level; distances and time differ | M0 data, M2 model |
| 2.0 | Player-turn sequence, Reaction, Exploitation | BCS turn plus alternating Formation Activations | New state machine | M1, M3 |
| 3.0 | Ground, non-combat, air, naval units and markers | BCS `Unit`/markers | New piece families; rendering ideas only | M2; air/naval in M8/M9 |
| 4.0 | rounding, categories, RE, stacking, ZOC, transport equivalents, fog of war | BCS rounding, unit-count stacking, normal/AV ZOC | Geometry only; all rule calculations new | M1–M3 |
| 5.0 | six OCS modes | BCS counter side, STOPPED/FINISHED, screen/prepared state | No rule reuse | M2–M3 |
| 6.0 | stack/individual ground movement | BCS individual formation movement | Adapt search infrastructure only | M3 |
| 7.0 | non-phasing Reaction movement/overrun/barrage | No equivalent | New actor/phase permissions | M3, M5 |
| 8.0 | movement-time Overrun using ground CRT | BCS Shock/Regular Attack | New suspended movement/combat transaction | M5 |
| 9.0 | supplied odds combat, AR, Surprise, options, Exploit, capture | BCS Regular/Shock combat | Pure-calculation pattern only | M5 |
| 10.0 | artillery/air/naval and facility barrage | BCS abstract point barrage | New unit/phase/supply/target model | Artillery M5; air M8; naval M9 |
| 11.0 | Exploitation movement/barrage/combat | No equivalent | New state and permissions | M3, M5 |
| 12.0 | SP/Tokens, draw/throw/trace, fuel, internals, OOS, attrition, Breakout | BCS MSR/Safe Path/isolation | Generic graph-search ideas only | M4 |
| 13.0 | HQ, transports, rail, artillery, Repls, reinforcement, formation markers, engineers, consolidation | BCS HQ/Combat Trains/replacements | Names overlap but semantics differ | M4, M6 |
| 14.0 | aircraft and missions | BCS Air Points | None | M8 |
| 15.0 | air bases/refit/build/damage | No equivalent | Facility/render concepts only | Schema M2/M6; runtime M8 |
| 16.0 | hedgehog construction/combat effects | BCS Prepared Defense only superficially | New facility state | M6 |
| 17.0 | game-defined weather effects | fixed BCS weather enum/table | Adapt table/schedule UX only | M0, M3; air effects M8 |
| 18.0 | ships, carriers, naval combat, Landing Craft, ALT, Beach Assault | No equivalent | None | M9 |
| 19.0 | port capacity/damage/trace/shipping | no BCS equivalent | New facility/logistics/transport state | Trace/facility M6; shipping M9 |
| 20.0 | multi-step unit Breakdowns | No equivalent | New counter-pool transformation | M6 |
| 21.1 | optional Recon | No compatible BCS Recon mechanic | New option strategy | M10 |
| 21.2 | proportional multi-step loss | No equivalent | Alternate strength strategy | M10 |
| 21.3 | independent-unit supply/AR limits | BCS independents have different assignment rules | New option strategy | M10 |
| 21.4 | long-range air penalties | No equivalent | Air mission strategy | M10 after M8 |
| 21.5 | re-basing limits | No equivalent | Air-base ledger strategy | M10 after M8 |
| 21.6 | convention tempo | No equivalent | Scenario initialization transform | M10 |
| 21.7 | revised rebuilds | BCS replacements differ | Rebuild strategy | M10 after M6 |
| 21.8 | attack empty hexes | No equivalent | Combat declaration strategy | M10 after M5 |
| 21.9 | reactive artillery | No equivalent | Reaction eligibility strategy | M10 after M5 |
| 21.10 | Supply Caches | No equivalent | New resource/supply option | M10 after M4/M5 |
| 21.11 | construction changes | No equivalent | Construction strategy | M10 after M6 |
| 21.12 | transport and Strat changes | No equivalent | Transport/mode strategies | M10 after M8/M9 |

## Dependency graph

```text
M0 Evidence + first scenario/tables
  ↓
M1 Generic core + pure state/action/reducer/replay
  ↓
M2 OCS map, pieces, quantities, modes, view projection
  ↓
M3 Player-turn sequence + movement + ZOC + Reaction/Exploitation shell
  ↓
M4 Supply/logistics core
  ↓
M5 Ground combat + Overrun + artillery barrage + retreat/Exploit
  ↓
M6 Ground-system completion: rail, Repls, engineers, facilities, Breakdowns
  ↓
M7 One-scenario ground/logistics MVP and product hardening
  ├─→ M8 Air system
  ├─→ M9 Naval/amphibious system
  ├─→ M10 Optional rules (each after its owning subsystem)
  └─→ M11 OCS AI/self-play and advanced editors
```

M4 precedes M5 because combat and artillery require real SP selection and
payment. M8 and M9 can proceed independently after the ground MVP if their
shared mission/cargo/facility interfaces are stable.

## Mapping to the active generator roadmap

| Active phase | Uses this crosswalk for |
|---|---|
| M0 | Hex/map/piece representation needed by all OCS sections |
| M1–M3 | Rule contracts and sections 2–13 ground/logistics behavior |
| M4 | Public gameplay/session/replay contracts over all implemented rules |
| M5 | Viewer projections and explanations only; no UI rule ownership |
| M6 | Sections 1, 4, 6, 12, 13, 16, 17 and 19 map/logistics data requirements |
| M7–M8 | Sections 3–5, 12–13 and 20 OOB/setup constraints plus generated play |
| M9–M10 | All implemented legal actions, transactions, victory and replay behavior |
| M11 | Sections 14–15, 18–19 and 21 expansion |

## Full-series subsystem backlog (legacy M labels)

### M0 — Evidence, game data, and scope gate

Goal: eliminate dependencies that code cannot invent.

Deliverables:

- select the first OCS title and one scenario with explicit exclusion/usage of
  air, naval, airborne, amphibious, optional, and game-specific rules;
- use the Beyond the Rhine 1.27.0 module as the current candidate reference:
  decode and inventory one of its ten predefined setups with a supported VASSAL
  codec, then select the smallest rule-complete scenario rather than guessing
  from save-file size;
- inventory its map, OOB, setup, terrain, weather, arrival, supply,
  reinforcement, rebuild, attrition, combat, Surprise, barrage, facility,
  capture, rail, port, and victory tables;
- create a machine-readable table/data manifest with rulebook version, page,
  source checksum, transcription status, and review status;
- verify garbled/transcribed passages against the official PDF;
- establish legal/IP policy: generic/test data and user-owned imports only; no
  copyrighted map/counter/scenario art checked in without permission;
- reconcile every VASSAL-derived fact with the official game rules or mark it
  `module-only/unverified`; never treat a VASSAL trait or hotkey as a rule;
- record enabled optional rules and MVP exclusions.

Exit criteria:

- every rule/table needed for the chosen scenario is `available`, `verified`,
  or explicitly `deferred because unused`;
- the scenario can be expressed without inventing a value;
- product owner approves the ground-only MVP boundary.

Stop condition: no runtime feature work starts if the first scenario or required
tables remain unknown.

### M1 — Generic platform and deterministic headless kernel

Goal: establish the one state-transition path used by UI, tests, replay, and AI.

Deliverables:

- TypeScript/Vite/Vitest application skeleton and CI gates;
- extract MIT-attributed immutable RNG, viewport math, and pure hex geometry
  from `bcsEngine` with focused tests;
- exact quantities for Tokens, RE, and quarter-MP ticks;
- versioned `GameState`, `GameAction`, pending-decision, and `GameEvent` envelopes;
- pure `getLegalActions` and `applyAction`, including optimistic state revision;
- event log, snapshot serialization, schema validation, and migrations;
- deterministic replay tool that produces a final state hash;
- hierarchical phase/segment skeleton for both player turns.

Exit criteria:

- domain packages have no React/browser import;
- two players can pass through an empty complete turn using only legal actions;
- save/load/replay yields byte-stable canonical state and identical RNG draws;
- invalid/stale actions cannot partially mutate state.

### M2 — OCS map, piece, mode, and projection foundation

Goal: represent and display OCS pieces without implementing all behavior yet.

Deliverables:

- piece families: ground combat, non-combat/resource, air, naval, facility;
- two-sided counter face separated from six-mode state;
- steps, current RE, mobility, Action Rating, categories, capabilities, ownership,
  formation/nationality, off-map/holding-box location;
- multi-terrain hexes, hexsides, roads, rail/gauge/control, supply/entry points,
  mutable facility layer, and scenario-defined weather ID;
- category-aware stacking validator and fog-of-war view projection;
- new OCS map/counter renderer with viewport culling; only pure viewport and
  coordinate algorithms may come from the BCS reuse list;
- minimal scenario loader/schema validator and a newly implemented generic
  fixture editor/importer.

Exit criteria:

- full chosen-scenario setup round-trips through save/load;
- full/reduced faces, all modes, dynamic RE, stack order, facilities, resources,
  off-map boxes, and viewer-specific visibility render correctly;
- no BCS state names appear in the OCS public domain model.

### M3 — Turn sequence, modes, movement, ZOC, Reaction, and Exploitation shell

Goal: complete non-combat player-turn mobility.

Deliverables:

- Weather and First Player decisions, both Player Turns, all phase/segment
  transitions, actor role, Clean Up, and optional Simulcast deferral flag;
- voluntary/involuntary mode lifecycle and Reserve marker pool;
- exact MA modifiers, stack movement/drop-off, one-hex minimum, terrain/road/
  hexside cost, symmetric edge legality, current mover lock;
- purpose-specific OCS ZOC and persistent negation commitment;
- Reserve release and different Reaction/Exploitation movement allowances;
- placeholder Overrun boundary that suspends movement but cannot yet resolve;
- movement history/events and legal-path explanation overlay.

Exit criteria:

- mode, stacking, movement, ZOC, role, and cleanup tests from Study 2 pass;
- a no-contact turn can be completed headlessly and in hot-seat UI;
- Reaction cannot use phasing units and ordinary movement cannot use the
  non-phasing side;
- all fractional movement is exact and replayable.

### M4 — Supply and logistics core

Goal: make operational-resource decisions authoritative and explainable.

Deliverables:

- owned Token supply ledger, dumps, cargo, Transport Points, Organic Trucks;
- direct draw, HQ draw/throw, adjacency rule, typed supply-query explanations;
- trace sources, detrainable nodes, Extenders/chains, dynamic path invalidation;
- combat/barrage/fuel/refit/construction supply reservation API;
- formation/HQ/single-unit fuel and duration;
- trace/eat/OOS/attrition/Breakout lifecycle;
- Normal/Low/Exhausted internal stocks and mandatory Supply Phase recovery;
- loading/unloading, combine/divide, leapfrog, pause-and-spend, capture/blow
  ledger primitives.

Exit criteria:

- every logistics test group in Study 4 passes for the chosen scenario data;
- the engine exposes all valid supply-source choices instead of auto-spending;
- cancelled actions release reservations and consume no supply/RNG;
- a multi-turn encirclement produces reproducible OOS, attrition, and Breakout.

### M5 — Ground combat, Overrun, artillery barrage, retreat, and Exploitation

Goal: support the complete OCS ground action loop.

Deliverables:

- machine-readable, provenance-tagged Combat/Surprise/Barrage/Facility/Capture
  tables used only through typed lookup services;
- regular multi-stack attack declaration and transactional supply payment;
- terrain/category/AT, mode/supply/loss strength calculation with explanations;
- AR selection, Surprise, table shifts, combat results, loss and option choices;
- multi-step loss/RE effects, DG, Exploit awards/exclusions;
- suspended-movement Overrun with phase-start stack membership and mandatory
  advance;
- path-based retreat, tagalongs, EZOC/DG timing, optional regular advance;
- on-map artillery barrage, spotter, supply, phase/firer/target limits;
- specialized capture/destruction of supply, transports, Extenders, facilities,
  aircraft-on-base placeholders, and ships placeholders.

Exit criteria:

- all Study 3 tests pass using table fixtures verified in M0;
- a full attack with every intermediate player decision can save/reload/replay;
- human and scripted clients dispatch the same actions and receive the same
  state/events;
- no table math or resource mutation exists in UI components.

### M6 — Ground-system completion

Goal: implement remaining ground/logistics series systems used by the selected
scenario.

Deliverables:

- rail capacity, entrain/move/detrain, detrainable hexes, gauge, Railheads, Rail
  Repair, control, and Trainbusting hooks;
- Equipment/Personnel Repl units, all ground rebuild variants, mandatory
  reinforcement arrival, arrival capacity/mode/cargo;
- HQ and engineer functions, bridging, construction, air-base/port/hedgehog
  state, repair/reduction, and immediate effects;
- Formation markers/fueling display, consolidation, Breakdown pool and
  create/absorb lifecycle;
- port trace-source and capacity behavior required without naval shipping;
- scenario-specific victory/scoring adapter.

Exit criteria:

- OCS sections 1–13, 16, 17, 19 ground/trace subset, and 20 are covered for the
  selected scenario or explicitly unused by its validated configuration;
- multi-turn reinforcement, rebuild, rail, facility, and Breakdown fixtures
  replay deterministically;
- counter-pool conservation and no-rebuild invariants hold.

### M7 — Ground/logistics MVP integration and hardening

Goal: deliver one complete, reviewable play loop rather than a collection of
unit tests.

Deliverables:

- chosen scenario setup/import, turn track, weather, reinforcements, victory;
- newly implemented hot-seat player UI with legal actions, pending decisions,
  modifier/supply/path
  explanations, undo by replay/snapshot, save/load, and event history;
- tutorial/checklist for the OCS sequence of play;
- representative E2E turn, multi-turn scenario smoke, performance and save-
  migration tests;
- rules coverage matrix linked to executable tests and known limitations;
- web build; Electron packaging only if required by the product decision.

Exit criteria:

- a user can complete the selected scenario to a victory result without editor
  intervention or manual state repair;
- all required rules in the scenario manifest are linked to passing evidence;
- no air/naval feature is silently approximated—unused systems are blocked with
  explicit scenario validation messages;
- performance is acceptable on the chosen map and maximum expected stack/dump
  density.

### M8 — Air system

Goal: implement OCS sections 14–15 and their barrage/logistics interactions.

Slices:

1. bases, Active/Inactive aircraft, refit, base transfer, stacking/range;
2. mission transaction, air combat, abort, Patrol Zones, interception, Flak;
3. air barrage, Hip Shoot, Trainbusting;
4. Air Transport, Drop Plans, Air Drop, gliders, reinforcement/capture effects.

Exit criteria: all Study 5 air/weather tests pass in a scenario that actually
uses each supported mission, including save/replay at every interruption.

### M9 — Naval, amphibious, and shipping system

Goal: implement OCS sections 18–19 completely.

Slices:

1. ships, movement, stacking, naval DG/damage, anti-ship/ground barrage;
2. carriers and carrier aircraft integration;
3. Landing Craft cargo, DUKW/LST transformations, port capacity;
4. amphibious landing rolls, Beach Assault, abstract Shipping/Sea Cap.

Exit criteria: Study 5 naval/amphibious tests pass in a scenario using the full
operation chain, with cargo/capacity/resource conservation.

### M10 — Optional rules

Goal: implement section 21 as immutable game-start strategies.

Deliver each option only after its owning core subsystem. For every option, run
the same baseline fixture with the option disabled and enabled, prove only the
documented rules change, and migration-test the configuration default.

Exit criteria: sections 21.1–21.12 each have explicit support status, tests, and
UI/scenario configuration; none can be toggled mid-game when it would invalidate
existing state.

### M11 — OCS AI, self-play, advanced editors, and desktop packaging

Goal: add automation only after the rules engine is the single source of truth.

Deliverables:

- executor calls only `getLegalActions`/`applyAction`, never React handlers;
- logistics-aware baseline AI, replayable decisions, telemetry, paired self-play;
- new map/OOB/scenario editors against versioned schemas and validation;
- performance budgets and promotion gates modeled after lessons from BCS;
- optional Electron release with production security and update process.

AI is not an MVP dependency. It is a consumer and stress test of the headless
engine, not a second implementation of game legality.

## Cross-cutting engineering rules

### Rule and table provenance

Every implemented rule/table needs:

- series/game rule identifier and version;
- source page/table identifier and checksum where practical;
- normalized machine data separated from calculation code;
- unit tests for boundary columns/results and known examples;
- a documented resolution when series and game rules conflict.

### State and transactions

- only `applyAction` mutates authoritative state;
- state carries schema version, revision, RNG state, and immutable configuration;
- every random result and resource mutation produces an event;
- pending decisions are serializable and take precedence over unrelated actions;
- UI state never substitutes for unresolved domain state;
- viewer projections implement fog of war without deleting authoritative data.

### Tests and completion evidence

Use four levels:

1. pure rule/table unit tests;
2. state/action contract and property/invariant tests;
3. historical/generic scenario sequence and replay tests;
4. browser E2E/performance/save-migration tests.

Do not copy rule logic into tests. Tests must call exported runtime behavior.

### Reuse gate

Copied/adapted BCS code must:

- pass the Study 6 contamination checklist;
- retain required MIT attribution;
- import no BCS domain types/constants;
- contain no copied BCS UI component, dialog, editor, or application shell;
- be covered by original generic tests plus an OCS-facing contract test.

## Risk register

| Risk | Impact | Mitigation/gate |
|---|---|---|
| No first game/scenario or missing charts | Engine cannot calculate real movement/combat/supply | M0 blocks runtime work until data manifest is approved. |
| PDF transcription artifacts | Silent rule/table errors | Official-PDF verification and provenance status per rule/table. |
| Treating OCS as a BCS fork | Wrong phase, unit, logistics, and combat state becomes structural debt | New reducer and domain types before UI reuse; contamination checks. |
| Full-series scope explosion | No playable increment | Ground/logistics scenario MVP, then air/naval/options as explicit slices. |
| Cached path invalidation/performance | Incorrect supply legality or unusable large maps | Purpose-keyed queries, dynamic revision keys, explanation output, performance fixtures. |
| Hidden information leaks | Invalid hot-seat/network play | Authoritative state plus viewer-specific projections and access tests. |
| Resource/cargo rounding errors | Corrupt logistics economy | Integer Tokens, RE/quarter-MP exact quantities, conservation properties. |
| UI contains rules | Human/bot/replay disagreement | Pure reducer is the only transition path; E2E compares clients. |
| Copyrighted game assets/data | Distribution/legal risk | Generic fixtures and user-imported data; explicit licensing review. |
| VASSAL automation mistaken for rules | Module quirks or errors become engine behavior | Treat module data as reference evidence; verify against series and game rules and retain provenance. |

## Immediate next action

Do not begin with Beyond the Rhine extraction, random generators or AI. Follow
M0 in the active roadmap and its detailed Foundation WBS: first freeze hex/map/
piece/location/schema/fixture contracts. Then complete the Rule Engine,
Gameplay Engine and manually operable UI against fixed synthetic fixtures.
Study and implement random map/OOB only after that manual-play gate; study and
implement AI only after generated scenarios pass the same gate.

## Completion checklist

- [x] OCS sections 1.0–20.0 appear in the crosswalk.
- [x] Optional rules 21.1–21.12 appear individually.
- [x] Every milestone names prerequisites, deliverables, and exit criteria.
- [x] Ground MVP and full-series completion are separated.
- [x] `bcsEngine` reuse is constrained by explicit gates and extraction order.
- [x] Tables, game-specific data, testing, replay, performance, fog of war, and
  legal/IP risks are included.
