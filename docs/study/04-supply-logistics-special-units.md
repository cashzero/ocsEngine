# Study 4: supply, logistics, special units, and reinforcements

## Scope and sources

- OCS v4.3: 12.0 Supply; 13.0 Specialized Units; 16.0 Hedgehogs;
  19.0 Ports and Shipping; 20.0 Breakdowns.
- BCS v2.0: 1.4 Command Radius; 1.5 Support; 1.8 Fatigue; 1.9 Safe
  Paths; 2.1 Reinforcements; 2.2 Replacements; 2.3 Assignment; 3.1 Main
  Supply Routes; 3.6 Isolation; 4.7 HQs and Combat Trains; 6.2 Formation
  Destruction.
- Runtime reference: `bcsEngine/utils/path.ts`, `utils/activation.ts`,
  `utils/scenarioGenerator.ts`, `hooks/useUnitManager.ts`, BCS replacement and
  reinforcement branches in `engine/legalActions.ts`, and related tests.

## Executive finding

Supply is the central OCS domain, and it is materially different from BCS.

BCS models a formation-level route from HQ through Combat Trains to a Supply
Source, plus Command Radius and purpose-specific Safe Paths. The route primarily
changes SNAFU, Prepared Defense, recovery, replacement, and isolation outcomes.

OCS models a conserved, capturable, mobile physical resource in quarter-SP
Tokens alongside an abstract trace-supply network. Units draw directly from
dumps or receive an immediate HQ throw; transport carries SP; rail, ports,
shipping, Extenders, and supply sources extend the network; specific actions
consume supply; internal stocks degrade per unit; failure of trace causes OOS,
attrition, or Breakout. The BCS MSR algorithm can inform graph-search design but
cannot implement OCS logistics.

## Supply concepts

| Concept | OCS v4.3 | BCS v2.0 | Classification |
|---|---|---|---|
| Physical supply | SP/Tokens at map locations, possibly loaded; owned, moved, spent, captured, destroyed | No physical general-purpose supply currency | OCS-only. |
| Trace supply | Abstract path to source/detrainable hex/Extender, often via HQ | Formation MSR plus unit Safe Path | Related graph problem, different topology and effects. |
| Distribution | Direct draw within 5 MP or HQ draw plus printed throw; adjacent hex is sufficient | Unit-to-HQ Safe Path and HQ→Train→source route | Different. |
| Combat supply | Per-combat SP expenditure or conditional internal stocks | Abstract eligibility/point mechanisms | OCS-only transaction. |
| Fuel | Formation/HQ/single-unit payment with different duration | No equivalent physical fuel payment | OCS-only. |
| Internal stocks | Per-unit Normal→Low→Exhausted; mandatory paid recovery in Supply Phase | No equivalent | OCS-only. |
| OOS/attrition | Persistent status, stack attrition each Supply Phase, combat/ZOC effects, movement remains allowed | Activation-time Isolation from OoC/Safe Path/MSR conditions | Different. |
| Breakout | Voluntary escape roll for out-of-trace units; death or delayed reinforcement | No equivalent | OCS-only. |

## Monetary representation and ownership

Represent all on-map supply in integer Tokens: `1 SP = 4T`. Never store SP as a
floating-point number. Every dump has an owner, hex or carrier location, and
Token quantity. A loaded quantity remains spendable, but cargo rules restrict
who may load, unload, draw, or receive it.

Supply mutations need ledger events such as:

- generated/arrived;
- loaded/unloaded;
- transported;
- spent for combat, barrage, fuel, refit, construction, rebuild, or internals;
- spent to substitute for trace supply;
- captured, destroyed, or blown;
- transferred through capture or consolidation.

The ledger is necessary for replay, save migration, debugging, and AI planning.

## Supply-query model

A single boolean `hasSupplyPath` is insufficient. Use a query that states its
purpose and returns candidate sources plus an explanation:

```text
SupplyQuery
├─ purpose: trace | combat | fuel | barrage | refit | construction | rebuild
├─ consumers and required Tokens
├─ allowed direct-draw mobility/range
├─ optional HQ and throw mobility/range
├─ source/cargo restrictions
├─ current phase and actor
└─ ZOC, enemy-unit, terrain, rail, port, and Extender constraints

SupplyOption
├─ source dump(s)
├─ draw path and optional HQ throw path
├─ exact cost
├─ internal-stock fallback eligibility
└─ derivation/rejection reasons
```

The player may need to choose among multiple legal dumps/HQs because spending
from one changes later actions. The engine must not silently choose the nearest
source.

## Direct draw, HQ throw, and trace

- Direct draw uses a movement-cost path within 5 MP to a dump, or reaches a hex
  adjacent to it.
- An HQ that can draw can immediately throw supply using its printed range and
  mobility type; adjacent to the consumer is also sufficient.
- HQs cannot re-throw supply from another HQ and cannot stockpile a throw.
- A Strat-mode HQ cannot throw. Divisional HQs have series-level recipient
  restrictions; game-specific command/nationality limits may add more.
- Supply paths cannot traverse enemy combat units. Unnegated ZOC blocks paths
  using Truck MP, while Leg/Tracked distribution can differ.
- Supply path weather costs use the rule-defined normal terrain baseline except
  for temporary improvements.
- Off-map holding-box supply does not leak to on-map consumers.
- Trace sources include qualifying map-edge sources, detrainable rail hexes, and
  connected Extenders. A formation generally traces through a common HQ/source.

This is a multi-source, typed pathfinding service over a dynamic logistics
graph—not a stored BCS formation route.

## Fuel, trace, OOS, and internal stocks

### Fuel

- Truck/Tracked combat units cannot spend MP without the full fuel cost; Leg
  units and non-combat transports do not need fuel.
- Formation fuel (1 SP) and HQ fuel (1 SP for eligible independents) last until
  the next friendly Clean Up; single-unit fuel (1T) lasts only the current phase.
- A moving fueled HQ can throw fuel from only one location per phase.
- Fuel is unnecessary for attack, defense, barrage, retreat, and advance, but is
  required for an Overrun because it is movement.
- Internal stocks cannot pay fuel.

### Trace and OOS

- Trace is evaluated during Supply Phase. A unit without trace may voluntarily
  spend 1T per 2 RE to "eat off the map," subject to restrictions.
- A unit with neither trace nor paid substitute becomes OOS and rolls attrition;
  OOS persists until a later friendly Supply Phase restores trace.
- OOS removes ZOC and reduces combat strength, but does not stop normal movement
  or an adequately supplied artillery barrage.

### Internal stocks

- Internal stocks pay only combat supply, only when on-map supply is unavailable
  under the rule's priority exceptions.
- Use changes a unit from Normal to Low to Exhausted.
- Supply Phase recovery is mandatory if eligible SP exist, takes priority over
  eating off the map, and has costs based on unit/RE and status.
- A single counter cannot mix on-map supply and internals for its own combat
  cost; multi-unit attacks may combine payment methods across counters.

These lifecycles require ordering rules in the Supply Phase. A generic
`spendSupply` endpoint would permit illegal player optimization.

## Transport, cargo, and Extenders

### Transport Points

- Carry SP up to their point size; loaded SP are explicit cargo.
- May move, pause to spend cargo for eligible current actions, then continue;
  future combat/barrage cannot be prepaid.
- Loading/unloading normally costs 10% MA. Loading requires co-location;
  unloading requires an eligible friendly anchor/dump.
- May combine/divide within counter-mix and type restrictions.
- Never need fuel or trace and normally remain Move Mode.
- Organic Trucks restrict consumers to their formation, cannot normally unload,
  cannot form Extenders, can enter Reserve, can tag along on retreat, and become
  regular transports when captured.

### Extenders

- Five same-type Transport Points can spend half MA to form an Extender when a
  valid backward trace connection exists.
- Extenders create trace sources/connections only; they neither carry SP nor
  extend draw/throw.
- Extenders can chain, retain their counter while cut but cease functioning, and
  can collapse voluntarily or upon enemy entry.

Cargo and Extender conversion should be atomic transformations preserving
counter-pool limits and provenance.

## Rail, port, shipping, and construction network

- Rail Cap is a per-turn scenario resource, measured in SP/RE transportation
  equivalents and modified by multi-track and Trainbusting.
- Rail movement has entrain, move, and detrain steps in the same Movement Phase;
  cargo, gauge, control, detrainable status, EZOC, source connection, and phase
  all matter.
- Rail Repair units convert gauge and move Railheads under special rules.
- Ports have per-phase capacity, ownership, up to four damage hits, repair/
  voluntary damage, possible trace-source status, and abstract Shipping/Sea Cap.
- Engineer-capable HQs/units bridge, create detrainable locations, and perform
  one immediate construction action within range instead of moving.
- Hedgehogs are built/reduced in levels and affect combat, Surprise, AT, and
  Reserve eligibility.

The map model therefore needs mutable infrastructure state separated from base
terrain: rail ownership/gauge/control, railheads, Trainbusting, ports and damage,
air bases, hedgehog levels, bridges/construction, and per-phase capacities.

## Replacements, reinforcements, consolidation, and breakdowns

### Replacements and rebuilds

- OCS replacements are owned on-map combat units: Equipment and Personnel.
  They occupy 1/4 RE, require supply/fuel, can take losses, and may be saved.
- A rebuild consumes game-table-defined Repl types near an eligible Combat-
  oriented HQ. Dead-pile rebuilds are placed near the HQ; on-map step rebuilds
  also require co-location with the Repls.
- Truck and aircraft rebuilds have separate restrictions; no-rebuild units are
  permanently removed.

This is not compatible with BCS's abstract faction replacement pool.

### Reinforcements

- Arrival is mandatory in the friendly Reinforcement Phase.
- Placement respects arrival hex, port capacity, air-base stacking, rail entry,
  fallback for enemy-blocked edge hexes, selected voluntary mode, and cargo.
- Ground placement may temporarily overstack; later checkpoints enforce limits.
- Reinforcing aircraft arrive Active at a friendly base.

### Consolidation and breakdowns

- Reinforcement Phase consolidation transforms identical units/formations,
  preserves relevant mode/marker/cargo state, and is barred by Low/Exhausted/DG.
- Multi-step units can create Breakdowns only at movement start or during
  advance/retreat; step/RE, AR, mode, and marker compatibility govern creation
  and mandatory absorption.

Both systems require a counter-pool inventory and transformations that retain
history. They should not be implemented as arbitrary editor create/delete.

## Reuse classification

| `bcsEngine` candidate | Class | Decision |
|---|---|---|
| Generic BFS/path reconstruction | Adapt | Reuse algorithmic scaffolding after introducing weighted, purpose-specific OCS constraints and explanations. |
| BCS MSR `calculateMSRPath` | None | Fixed HQ→Combat Train→source road topology is not OCS draw/throw/trace. |
| BCS Safe Path | Reference | Demonstrates purpose-tagged queries, but OCS range, cost, ZOC, adjacency, sources, and effects differ. |
| BCS isolation logic | None | Activation/CR/Safe Path loss model is not OCS OOS/attrition/Breakout. |
| BCS replacement pool/rebuild actions | None | OCS Repls are on-map units and costs are game-specific. |
| Scenario import/versioning patterns | Adapt | Extend for supply ledgers, cargo, infrastructure, arrival tables, rail/port capacity, and counter pools. |
| Deterministic scenario validation | Reference/adapt | Preserve invariant checking; replace BCS-required HQ/Combat Train/MSR invariants. |

## Test consequences

Required suites include:

1. Token-exact supply arithmetic and ownership;
2. direct draw, adjacent sufficiency, HQ throw, forbidden re-throw, and command
   restrictions;
3. purpose-specific supply path handling of enemy units, ZOC, mobility, weather,
   holding boxes, sources, detrainable rail, and Extenders;
4. player choice among supply sources and atomic rollback on cancelled actions;
5. all three fuel methods, durations, and moving-HQ location lock;
6. trace/eat/OOS/attrition lifecycle and Breakout return scheduling;
7. internal-stock eligibility, Normal→Low→Exhausted, mandatory recovery order,
   and mixed payment restrictions;
8. Transport cargo, load/unload cost, pause-and-spend, combine/divide, Organic
   Truck exceptions, capture, and Extender conversion/collapse;
9. rail capacity, gauge, detrainability, Trainbusting, control, and cargo;
10. port capacity/damage/repair/shipping and trace-source threshold;
11. engineer bridging/construction timing and immediate infrastructure effects;
12. Repl arrival, rebuild variants, mandatory reinforcement entry, consolidation,
   and Breakdown create/absorb;
13. save/reload and replay of all quantities, paths, transformations, and pending
   supply decisions.

## Unresolved questions and dependencies

- The first game's Supply, Variable Reinforcement, Rebuild, Attrition, Capture,
  Dump Blowing, and arrival tables are mandatory data inputs.
- Its rail gauges, Rail Cap, Shipping Allowance, port capacities, Extender types,
  formation fuel rules, and counter-mix limits must be known.
- Pathfinding performance must be tested on the intended map size with many
  candidate dumps/HQs. Cache keys must include all dynamic blockers and cannot
  assume a saved route is still legal.
- The UI needs a logistics overlay that explains draw, throw, trace, cargo, and
  rejection reasons without revealing hidden enemy stack information.

## Completion checklist

- [x] Physical supply and abstract trace are separated.
- [x] Supply purposes, draw/throw, fuel, OOS, attrition, and internals are mapped.
- [x] Cargo, Extenders, rail, ports, construction, and hedgehogs are included.
- [x] Replacements, reinforcements, consolidation, and breakdowns are distinguished.
- [x] BCS logistics reuse boundaries are explicit.
- [x] Required tables, invariants, tests, and performance risks are listed.
