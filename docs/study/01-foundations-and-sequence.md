# Study 1: foundations and sequence of play

## Scope and sources

- OCS v4.3: Game Components; 1.0 Scale; 2.0 Sequence of Play; 3.0 Units
  and Markers (classification only).
- BCS v2.0: 1.0 Basics; 1.2 Core Concepts; 1.3 Formations; 2.0
  Game-Turn Sequence; 2.5 Activations; 3.0 Formation Activation Sequence.
- Runtime reference: `bcsEngine/types.ts`, `hooks/useGamePhase.ts`,
  `hooks/useActivation.ts`, `engine/gameState.ts`, `engine/gameAction.ts`, and
  `engine/legalActions.ts`.

The comparison is between series rules. A game-specific rulebook can override
either series and is therefore a future scenario input.

## Executive finding

OCS is not BCS with more unit types. Their control loops are fundamentally
different.

BCS is formation-activation driven: players alternate one formation at a time,
resolve Preparation/SNAFU/OBJ/Activities/Clean Up/Fatigue/Isolation, and may
immediately attempt a second activation. OCS is player-turn driven: one player
executes movement, supply, and combat phases; the opponent receives a dedicated
Reaction Phase; then eligible units receive an Exploitation Phase. Reusing the
BCS activation state machine would encode the wrong game.

The safe reuse boundary at this stage is below the turn engine: generic hex
coordinates, rendering conventions, seeded randomness, file import/export
patterns, and editor interaction ideas. Phase, action, pending-decision, unit,
and scenario state require an OCS model.

## Scale and identity

| Dimension | OCS v4.3 | BCS v2.0 | Engine consequence |
|---|---|---|---|
| Ground scale | Usually 5 miles/hex; may be 2.5 miles | Roughly 1 km to slightly over 1 mile/hex | Distances, ranges, map generators, and AI heuristics cannot retain BCS constants. |
| Time scale | Usually half a week/turn; may be quarter-week | One day/turn | Reinforcement schedules, weather duration, refit, supply, and operational tempo need OCS semantics. |
| Unit scale | Company through division | Mostly battalion | Stacking must use Regimental Equivalents (RE), not unit count; transport capacity and multi-step divisions become first-class. |
| Operational identity | Supply movement and expenditure, modes, reserves, exploitation, air/naval operations | Formation command, SNAFU, objectives, support, fatigue, and activation friction | Similar UI nouns must not be mistaken for compatible state. |

## Component model differences

### OCS requires first-class pieces absent from BCS

- Supply Points and quarter-SP Tokens exist at map locations and can be loaded,
  unloaded, moved, captured, destroyed, and expended.
- Transport Points have capacity and transport type; Organic Trucks belong to a
  multi-unit formation.
- Artillery is represented by map units rather than only an assigned point pool.
- Aircraft are individual active/inactive units with type, range, air-combat,
  barrage, damage, basing, and sometimes transport capacity.
- Ships and Landing Craft have naval movement/combat or cargo capacity.
- Ports, air bases, air strips, and hedgehogs are mutable facilities.
- Ground combat units have modes; multi-step units have RE values that fall with
  losses.
- Holding boxes distinguish congestion-only boxes tied to a map hex from true
  off-map locations.

These are not cosmetic counter variants. They introduce cargo relationships,
resource conservation, facility state, mission state, and phase-specific legal
actions.

### BCS concepts that must not enter the OCS core

- Formation HQ activation status (`Unused`, `Used`, `Done`).
- Formation SNAFU roll and Full/Partial/Fail effects.
- Combat and March OBJ placement and OBJ zones.
- Command Radius, Safe Paths, and formation-specific MSRs through Combat Trains.
- Formation Fatigue and Recovery Activation.
- Support assignment/distribution and Dropped Support.
- Per-activation Fire Events, STOPPED, and FINISHED.
- Prepared Defense as a formation marker/order.
- Initial versus Second Activation.

Some OCS systems solve related operational problems—HQ supply throw, trace
supply, reserve release, DG, modes—but their triggers and effects are different
and require separate names and types.

## Turn-sequence crosswalk

| OCS step | Closest BCS step | Equivalence | Required OCS state/action |
|---|---|---|---|
| Pre-Turn: Weather | Weather | Related | Weather table/schedule can share infrastructure, but OCS weather governs many ground, air, naval, and supply rules. |
| Pre-Turn: First Player | First Player Determination | Related | OCS winner elects first or second; store the roll and election as separate decisions. |
| Aircraft Refit | None (BCS air is an abstract pool) | OCS-only | Base-by-base refit action, 1T payment, base capacity, ZOC restriction, active/inactive aircraft. |
| Reinforcement | Reinforcement | Related | OCS adds Supply Table, Variable Reinforcement Table, map entry, rebuild, and consolidation. |
| Movement: Breakout | None | OCS-only | Out-of-trace eligibility and breakout resolution before normal movement. |
| Movement: Movement Segment | Formation Activities | Related only at hex/path layer | Move stacks or units; voluntary mode change at movement start; overrun, construction, destruction, rail/sea movement, and air missions. |
| Movement: Air/Naval Barrage | BCS barrage during Activities | Different | Strict firer and phase eligibility; artillery is explicitly excluded. |
| Supply | BCS MSR preparation/isolation | Different | Replenish internal stocks, trace supply, spend on-map supply if needed, mark OOS, resolve attrition. |
| Reaction: Movement | None | OCS-only | Non-phasing player moves ships, aircraft, and released reserves at half MA. |
| Reaction: Barrage | None | OCS-only | Non-phasing air, naval, and artillery barrage without a combat segment. |
| Combat: Artillery Barrage | BCS barrage | Different | Artillery-only barrage segment followed by ground combat. |
| Combat: Combat Segment | Regular/Shock attacks | Different tables and eligibility | Phase-scoped attack declaration, supply payment, surprise, results, retreat/advance. |
| Exploitation | None | OCS-only | Released reserves at full MA, Exploitation-mode units at half MA, then barrage and combat. |
| Clean Up | Activation clean-up/end turn | Different | Remove DG and Exploitation markers and fuel markers; handle Trainbusting timing. |
| Second Player Turn | Alternating next formation | Different | Repeat the entire player turn with roles reversed. |
| Simulcast Turn | None | OCS-only optional flow | Bilateral declaration; simultaneous non-offensive execution; no combat/barrage. |

## Domain and action implications

### State hierarchy

Use an explicit hierarchy rather than a flat `phase` enum:

```text
GameTurn
├─ PreTurn
│  ├─ WeatherDetermination
│  └─ FirstPlayerDetermination
├─ FirstPlayerTurn
│  ├─ AircraftRefit
│  ├─ Reinforcement
│  ├─ Movement (Breakout, Movement, AirNavalBarrage)
│  ├─ Supply
│  ├─ Reaction (Movement, Barrage)
│  ├─ Combat (ArtilleryBarrage, Combat)
│  ├─ Exploitation (Movement, Barrage, Combat)
│  └─ CleanUp
├─ SecondPlayerTurn (same structure)
└─ TurnEnd
```

Every legal action must be derived from the current leaf node plus actor role
(`phasing` or `nonPhasing`). This prevents UI handlers, AI, and headless tests
from disagreeing about who may act.

### Minimum action families implied by this study

- determine weather;
- roll for first player and choose turn order;
- refit aircraft at a selected base and pay supply;
- resolve and place reinforcements/supply;
- start/end each segment and phase;
- declare/pass a Simulcast Turn;
- expose only role-appropriate movement, barrage, combat, and clean-up actions.

The detailed move, supply, combat, and mission actions are specified in later
study documents.

## Reuse classification

| Candidate from `bcsEngine` | Class | Decision |
|---|---|---|
| Axial hex coordinate math and neighbor/distance helpers | Adapt | Geometry is system-neutral; terrain and movement costs are not. |
| SVG map viewport/zoom concepts | Adapt | Rendering infrastructure is reusable after OCS terrain, stack, facility, and marker layers are introduced. |
| Seeded RNG | Direct | A deterministic random stream is system-neutral, subject to API and test verification in Study 6. |
| Scenario save/load pattern | Reference | OCS needs versioned cargo, supply, facilities, modes, air/naval, and game-specific tables. |
| `GamePhase` and `useGamePhase` | None | Encodes the BCS phase order and point-generation behavior. |
| `ActivationState` and `useActivation` | None | Encodes BCS-only formation activation mechanics. |
| BCS `GameAction` union | Reference | The discriminated-union pattern is good; the actions themselves are mostly BCS-specific. |
| `getLegalActions` | Reference | Preserve the authoritative-legal-action design, not its BCS rules. |
| BCS unit and objective types | None | Their fields and invariants are tied to BCS. |

## Test consequences

Before detailed rules are added, the OCS engine needs sequence tests proving:

1. first-player determination stores a choice of first/second rather than
   automatically assigning the high roller;
2. both player turns execute in the elected order;
3. phasing and non-phasing permissions switch during Reaction;
4. barrage-source eligibility changes among Movement, Reaction, Combat, and
   Exploitation;
5. Clean Up affects only the phasing player's relevant markers;
6. turn advance occurs only after both player turns;
7. a Simulcast Turn forbids offensive actions and barrage/combat;
8. seeded rolls replay exactly from serialized state.

## Unresolved questions and dependencies

- Which OCS title/scenario is the first playable vertical slice? The series
  rules do not provide map, OOB, terrain table, arrival schedule, weather table,
  supply table, or victory conditions.
- Does the first milestone need Simulcast Turns, or can they remain an explicit
  post-MVP rule option?
- Must hot-seat fog of war be enforced in the first UI, or only preserved in the
  domain/API design?
- A rules-lawyer pass against the official PDF is required where the converted
  Markdown contains garbled punctuation or figures/tables.

## Completion checklist

- [x] OCS components and turn phases are identified.
- [x] BCS activation-only concepts are separated from OCS concepts.
- [x] Every OCS top-level phase has an engine consequence.
- [x] Initial reuse classifications are recorded.
- [x] Sequence-level acceptance tests are listed.
- [x] Game-specific dependencies are explicit.
