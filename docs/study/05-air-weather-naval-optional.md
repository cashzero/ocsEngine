# Study 5: air, weather, naval, ports, and optional rules

## Scope and sources

- OCS v4.3: 14.0 Air Power; 15.0 Air Bases; 17.0 Weather; 18.0 Naval
  Power; 19.0 Ports and Shipping; 21.0 Optional Rules.
- BCS v2.0: weather/Air Point portions of 1.0g, 2.0, and 5.4.
- Runtime reference: `bcsEngine/types.ts`, `constants.ts`,
  `hooks/useGamePhase.ts`, map weather/Air Point editors, and BCS barrage UI.

Port logistics are also covered in Study 4; this document focuses on their air,
naval, amphibious, and optional-rule interactions.

## Executive finding

BCS air support is an abstract, expend-once point pool. OCS air power is a full
unit-and-mission game layered over the ground game. OCS naval power is another
full movement, barrage, cargo, carrier, amphibious-landing, and beach-assault
system with no BCS counterpart.

No BCS air or barrage rule implementation is reusable. The useful assets are
limited to weather-table editing concepts, generic mission/pending-decision
patterns, seeded rolls, map range overlays, and UI infrastructure.

The first OCS vertical slice should be deliberately selected from a scenario
that does not require naval or airborne operations. The engine schema and phase
model must still reserve clean extension points for aircraft, naval units, and
missions; otherwise adding them later will break saves and legal-action APIs.

## Air-unit and base model

### Aircraft

OCS aircraft are two-step units with:

- type (`fighter`, `tacticalBomber`, `strategicBomber`, `transport`, or combo);
- full/reduced face values;
- range, Air Combat Rating, Barrage Strength, and optional cargo capacity;
- Active/Inactive status;
- current base or mission hex;
- mission history for the current phase;
- restrictions such as strategic-bomber or game-specific Hip Shoot capability.

Active aircraft may remain ready at a base indefinitely. A mission or abort
normally returns aircraft to a legal base and makes them Inactive, with explicit
fighter exceptions for successful Interception and short Base Transfer.

### Air bases

Air bases are mutable facilities with a Level. Level controls refit capacity,
Flak, unload capacity, and Active-aircraft stacking. A base:

- refits once per Aircraft Refit Phase for 1T and up to twice its Level;
- cannot refit in an unnegated EZOC;
- may be captured, causing aircraft loss/displacement;
- can be constructed, improved, voluntarily reduced, or damaged by barrage;
- never needs trace supply, but requires on-map supply for refit;
- can coexist with unlimited Inactive aircraft but only a level-dependent number
  of Active aircraft.

Air Strips are game-enabled restricted bases, not merely Level 0.

## Air mission transaction

Every mission follows a shared sequence:

```text
declare one mission type and participating aircraft (maximum four)
→ move each aircraft from its base to the mission hex within range
→ resolve air combat already present in the hex
→ offer/resolve interception
→ resolve flak and mission/cargo losses
→ resolve the mission-specific effect
→ select legal return base(s)
→ apply Active/Inactive outcome
```

The mission must retain origin base per aircraft because range, short-range
barrage, return legality, capacity, and optional long-range penalties depend on
it. A single `airPoints[faction]` number cannot represent any of these facts.

## Air mission families

| Mission | Core state/decision needs |
|---|---|
| Interception | Patrol Zone/base source, eligible Active Fighter, approach range, air combat rounds, abort/return choice, successful fighter remains Active. |
| Fighter Sweep | One attacking Fighter, target Active enemy aircraft, repeated air combat, return/Inactive outcome. |
| Barrage | Up to four aircraft, target category, interception/flak, spotter and table shifts, return Inactive. |
| Hip Shoot | One game-qualified non-strategic aircraft, correct spotter required, Movement Segment timing, does not consume normal per-hex barrage limit. |
| Trainbusting | Facility-table result, persistent zone, ground/rail penalties, removal in next enemy Clean Up. |
| Air Transport | Aircraft capacities, cargo type and transportation equivalent, base loading/unloading, range/capacity variants, half-MA ground movement interaction. |
| Air Drop | Planned combat-unit drop or unplanned supply drop, turn/hex plan, delay/cancel, Flak, per-cargo success roll, parachute/glider handling. |
| Base Transfer | Up to double range, destination capacity, fighter Active exception. |

Air combat itself is a repeated opposed procedure with voluntary aborts and
type-specific attack capability. It must be modeled as pending decisions rather
than folded into barrage resolution.

## Weather model

The series rules delegate actual weather outcomes and effects to each game's
Weather Table. Series-wide constraints include:

- the result can affect the two sides differently if game rules say so;
- weather can restrict phases/missions or prohibit flight;
- no-flight weather does not deactivate ready aircraft;
- weather never prohibits refit;
- increased movement costs are ignored for supply paths, while temporary cost
  reductions may apply.

Therefore `Weather` cannot be a fixed engine enum such as
`Good | Rain | Snow | Fog`. Model scenario-defined weather IDs with typed effect
capabilities: ground-cost profile, flight permissions by mission/phase, barrage
effects, visibility/range effects, and side-specific overrides. The UI can reuse
the BCS idea of a table/schedule editor, but not its fixed choices or Air Point
generation side effect.

## Naval and amphibious model

### Ships and carriers

- Ships need no supply, have unlimited friendly naval stacking, and move in
  friendly Movement, Reaction, and Exploitation at normal or slow speed.
- Ships have no ground mode but can receive naval DG; damaged single-ship
  counters may become slow and cannot be repaired.
- Ship barrages can target ground/facility or individual ships, with different
  limits and eligibility; air and Coastal Artillery may also attack ships.
- Carriers impose aircraft type/capacity limits, refit their aircraft without SP,
  move before or after plane missions, and project Patrol Zones from their
  current hex.

### Landing Craft and ports

- Landing Craft are capacity-point ships carrying combat units, SP, and
  Transport Points; loading is port/capacity constrained and cargo may not have
  moved earlier.
- DUKW can transform between Landing Craft and Transport Point behavior with a
  remaining-MA conversion.
- LST can deploy as a port after an amphibious landing roll.
- Amphibious landings have phase, cargo, mode, supply-access, timing, and
  per-hex landing-roll constraints.
- Beach Assault is a Combat Phase procedure, with a defender option to substitute
  an amphibious landing roll before information/payment is committed.
- Ports share capacity among shipping and landing operations, lose capacity to
  damage, and may cease to be trace sources below a threshold.

These rules require a common transport/cargo framework but separate movement
strategies for ground, rail, air, abstract shipping, and Landing Craft.

## Optional rules as configuration

| Rule | Systems affected | Configuration implication |
|---|---|---|
| 21.1 Recon | movement, SP cost, fog of war | Adds a legal action and information projection. |
| 21.2 Proportional Loss | multi-step combat strength | Swappable strength strategy. |
| 21.3 Independents | combat supply, internal stocks, AR choice | Combat declaration/payment strategy. |
| 21.4 Long Range Air | air combat, barrage, transfer | Mission range strategy. |
| 21.5 Re-Basing Limits | base capacity/reinforcement | Per-turn base ledger. |
| 21.6 Convention Tempo | starting supply, transport, rail, shipping, replacement rolls | Scenario initialization transform; not a runtime toggle. |
| 21.7 Revised Rebuilds | Repl arrival/hoarding/cost | Replacement strategy and mandatory-use ledger. |
| 21.8 Attacking Empties | combat declaration, supply, advance | Adds no-roll combat transaction. |
| 21.9 Reactive Artillery | Reaction eligibility | Barrage legal-action strategy. |
| 21.10 Supply Caches | barrage payment, emergency trace | New off-map resource and supply-source options. |
| 21.11 Construction | hedgehog/port build and capture | Construction-cost/effect strategy. |
| 21.12 Transport | air/sea transport, Strat limits/supply, drop DRM | Multiple transport and mode strategies. |

Store enabled options in immutable scenario/game configuration at game start.
Some options alter starting inventories or persistent planning, so changing them
mid-game would invalidate state. Each option needs focused contract tests plus a
test that the disabled path retains core rules.

## Recommended scope boundary

### Foundation schema (must exist before MVP saves stabilize)

- extensible piece families (`ground`, `air`, `naval`, `facility`, `resource`);
- scenario-defined weather IDs/effects;
- mission transaction and pending-decision envelope;
- cargo/capacity types in Token/RE units;
- phase permissions that can admit air/naval actors;
- optional-rule configuration with versioned defaults.

### Ground-logistics MVP candidate

- weather determination and ground/logistics effects;
- no aircraft units, naval units, airborne drops, shipping, or amphibious
  operations in the selected scenario;
- artillery barrages retained because they are part of the ground/logistics
  core;
- ports represented only if the scenario uses them as trace sources, with
  advanced naval operations deferred explicitly.

### Later independent feature slices

1. air bases, Active/Inactive aircraft, refit, transfer, air combat, and
   interception;
2. air barrage, Hip Shoot, and Trainbusting;
3. air transport, Drop Plans, Air Drop, and gliders;
4. ships, carriers, naval barrage, and Coastal Artillery;
5. Landing Craft, amphibious landing, Beach Assault, ports, and Sea Cap;
6. optional rules, grouped by the subsystem they alter rather than delivered as
   one large package.

This deferral is valid only if the first target scenario genuinely does not use
the omitted systems.

## Reuse classification

| `bcsEngine` candidate | Class | Decision |
|---|---|---|
| Weather table/schedule editing concept | Adapt | Retain configurable table UX; replace fixed enum and point-generation behavior. |
| BCS Air Point state/resolver/UI | None | OCS uses individual aircraft, bases, missions, air combat, flak, range, and cargo. |
| Map range/LOS overlays | Adapt | Useful for Patrol Zones, range, and spotters; OCS mission movement often does not trace paths. |
| BCS barrage dialog | Reference | Interaction decomposition may inform UX; fields, timing, costs, and resolver differ. |
| Seeded RNG and pending decisions | Direct/adapt | Suitable for air combat, interception, flak, mission loss, ALT, and naval barrage. |
| Naval/amphibious implementation | None | No BCS equivalent exists. |

## Test consequences

Air/weather/naval suites eventually need:

1. scenario-defined, asymmetric weather and its ground/supply/flight effects;
2. Active/Inactive, two-step loss, base stacking, refit cost/capacity/EZOC;
3. complete mission sequence with legal return and serialized pending choices;
4. air combat rounds, aborts, interception, Patrol Zones, Flak, and mission loss;
5. each mission's phase/range/type/capacity restrictions;
6. air transport and drop-plan timing, cargo survival, glider consumption;
7. ship movement/stacking/DG/damage and ground/anti-ship barrage limits;
8. carrier capacity/refit/movement with aircraft;
9. Landing Craft cargo, DUKW/LST transforms, ALT, Beach Assault, port capacity;
10. every optional rule enabled and disabled against the same baseline fixture;
11. replay/save migration for mission, plan, facility, cargo, and option state.

## Unresolved questions and dependencies

- The first game/scenario selection determines whether the proposed ground-only
  MVP boundary is legitimate.
- Game-specific Weather, Air Transport Success, ALT, naval, port, and aircraft
  capability tables must be transcribed and validated.
- Hidden-information behavior during air missions and stack inspection requires
  a player-specific projection/API if network or hot-seat privacy is desired.
- The official PDF must be checked where converted aircraft rules contain
  garbled symbols or truncated table references.

## Completion checklist

- [x] Aircraft/base state and shared mission sequence are identified.
- [x] All air mission families are mapped.
- [x] Weather is separated from BCS's fixed enum and Air Point generation.
- [x] Naval, carrier, Landing Craft, amphibious, and port interactions are mapped.
- [x] Every optional rule is assigned to an affected subsystem/configuration strategy.
- [x] Reuse limits, phased scope, tests, and game-specific dependencies are explicit.
