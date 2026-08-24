# Study 2: units, modes, ZOC, stacking, and movement

## Scope and sources

- OCS v4.3: 3.0 Units and Markers; 4.0 General Concepts; 5.0 Modes;
  6.0 Ground Movement; 7.0 Reaction Phase. Section 8.0 Overrun is deferred to
  Study 3 except where movement eligibility creates a dependency.
- BCS v2.0: 1.1 Units; 1.4 Command Radius; 1.6 Fire Events; 4.0 Movement;
  4.2 Stacking; 4.3 ZOC; 4.4 Stopping Engagements; 4.5 Engagement Zones;
  4.6 Screening; 4.7 HQs and Combat Trains; 4.8 Voluntary Retreats.
- Runtime reference: `bcsEngine/types.ts`, `utils/hexUtils.ts`,
  `utils/movement.ts`, `utils/stacking.ts`, and `utils/zone.ts`.

## Executive finding

The two systems share a hex grid, movement points, terrain costs, roads,
mobility classes, ZOCs, two-sided counters, and a one-hex minimum move. That is
enough to reuse geometry and search infrastructure, but not enough to reuse BCS
movement legality.

OCS movement is governed primarily by six mutually exclusive modes, phase role,
fractional MA, stack movement, supply/fuel, transport, and a ZOC that mainly
constrains Truck movement and logistics. BCS movement is governed primarily by
formation activation state, STOPPED/FINISHED, Fire Events, Command Radius,
normal versus AV ZOCs, Engagement/Screen Zones, and individual-unit sequencing.

## Unit-state crosswalk

| Concern | OCS v4.3 | BCS v2.0 | Classification |
|---|---|---|---|
| Counter sides | Combat side and Move side; current orientation supplies base values | Deployed side and Move side; current side defines capabilities | Related; share a generic `CounterFace`, not BCS profile semantics. |
| Mobility | Leg, Truck, Tracked; may differ by face | Leg, Truck, Tac; may differ by profile | Related; `Tracked` is not a harmless rename of BCS `Tac` because ZOC and terrain effects differ. |
| Combat quality | Action Rating plus Combat/Barrage ratings | Action Rating plus AV/attack-capable profiles | Related. |
| Size | RE is dynamic for multi-step units and drives stacking/transport | Usually two combat units per hex, independent of steps | OCS-only model. |
| Voluntary modes | Combat, Move, Reserve, Strat | Counter flip only, plus BCS prepared/screen states | OCS-only lifecycle. |
| Involuntary modes | DG, Exploitation | STOPPED/FINISHED and other status flags | Different. |
| Formation command | Multi-unit affiliation and Organic Trucks | HQ activation, CR, MSR, Support, blob, fatigue | BCS-only behavior must be excluded. |
| Logistical state | Trace supply, OOS, internal stocks, fuel, cargo | Formation MSR/Safe Path/isolation | Different; addressed in Study 4. |
| Air/naval/non-combat | Separate unit families and facilities | Mostly absent or abstract | OCS-only. |

OCS state should separate `face` from `mode`. A DG or Exploitation unit retains
its orientation toward Combat or Move even though its current mode is neither.
Encoding mode as the visible counter face will produce incorrect cleanup,
strength, MA, ZOC, and transport behavior.

## Mode rules and engine consequences

| Mode | Entry/removal | Movement | Combat/ZOC | Important restrictions |
|---|---|---|---|---|
| Combat | Voluntary in own Movement Phase | Printed Combat-face MA | Stronger combat; eligible units exert ZOC | Cannot use normal rail, air, or shipping transport; required for several engineering tasks. |
| Move | Voluntary in own Movement Phase | Printed Move-face MA | Weaker combat; normally no ZOC | Required for rail, air, and shipping transport. |
| Reserve | Voluntary; limited marker pool; release in Reaction or Exploitation | 1/4 MA in regular Movement; 1/2 MA when released in Reaction; full MA when released in Exploitation | Cannot attack/overrun/barrage before release; half defense while still Reserve | Cannot enter Reserve in EZOC; enemy combat result removes Reserve; orientation is preserved. |
| Strat | Voluntary; must orient to Move side | 2x MA | Combat Strength and AR become zero; no attack, overrun, barrage, or ZOC | Cannot enter/change in EZOC; must finish where trace supply is possible; cannot use other transport. |
| Exploitation | Involuntary combat award | 1/2 MA in Exploitation Phase | Normal combat/barrage; retains prior ZOC eligibility | Clean Up removes marker and restores face-derived mode. |
| DG | Involuntary from combat, retreat, or barrage | 1/2 MA | 1/2 combat and barrage, -1 AR, no overrun or Exploit | Hex-wide propagation at trigger; further retreat into EZOC may cost a step; removed in owner's Clean Up. |

The legal-action engine needs a mode-transition policy with phase, current
mode, face orientation, marker availability, EZOC, unit family, and transport
context as inputs. A free-form `FLIP_UNIT` action is insufficient.

## Stacking differences

### OCS

- Ground combat stacking limit is 10 RE, evaluated at the end of every segment
  or phase except the Reinforcement Phase.
- Temporary movement overstacking is allowed, but an overrun stack plus other
  friendly occupants cannot exceed 10 RE.
- SP and Transport Points stack without numeric limit; facilities have one-per-
  type limits; off-map boxes are unlimited; air/naval rules have separate caps.
- A multi-step unit loses one RE for each step loss; other combat units retain
  their rule-defined RE even though they are usually one-step units.
- Stack order is partly player-controlled and partly constrained by fog-of-war
  display rules.
- Friendly and enemy pieces can coexist only in enumerated specialized cases.

### BCS

- Normal stacking is two combat units; HQ, Support, Combat Trains, and markers do
  not count.
- Overstacking usually remains legal but affects combat/barrage and blocks Fire
  Events, Attack/Assist selection, and Traffic entry.

### Required OCS design

Use category-aware capacity rather than `units.length`. The validator must
accept a checkpoint (`duringMove`, `overrunDeclaration`, `segmentEnd`,
`phaseEnd`, `reinforcement`) and calculate current RE from losses. It must also
validate facility uniqueness, cargo, and permitted enemy coexistence.

## ZOC differences

### OCS ZOC

- Only Attack-Capable Combat Mode units that are not OOS exert ZOC, with an
  Exploitation-mode exception preserving a ZOC already held.
- ZOC affects six adjacent hexes regardless of terrain.
- Truck movement entering an unnegated EZOC must stop or overrun. Leg and
  Tracked movement are not stopped by ZOC.
- The same ZOC also blocks Truck-based supply traces, rail transport/trace,
  rail conversion, port operations, aircraft refit, Reserve/Strat mode entry,
  and rebuilds, each with rule-specific negation behavior.
- A friendly combat unit negates eligible ZOC effects only if it will spend no
  more MP that phase. This creates a persistent "movement committed" fact.

### BCS ZOC

- Most combat units exert a normal ZOC; AV-capable sources also exert an AV ZOC.
- Leg/Truck stop in ordinary EZOC, while Tac movement responds to AV ZOC.
- AV ZOC can trigger mandatory Stopping Engagements using Fire Events.
- Longer-range Engagement Zones and Recon Screen Zones create additional
  movement restrictions.

### Required OCS design

Do not port `getEnemyZOCs` plus BCS move-class branches as-is. OCS needs:

1. `exertsZoc(unit, state)` based on mode, attack capability, OOS, and Exploit
   provenance;
2. `zocEffectAt(hex, purpose, movingMobility)` because movement, supply, rail,
   port, refit, mode change, retreat, and rebuild use different rules;
3. a negation record tied to a friendly combat unit's remaining movement rights;
4. no BCS AV ZOC, Stopping Engagement, Engagement Zone, or Screen Zone in the
   OCS domain.

## Movement differences

| Topic | OCS | BCS | Consequence |
|---|---|---|---|
| Who moves | Units or stacks, in own Movement plus eligible Reaction/Exploitation segments | Individual active-formation units | Route search receives actor role, segment, stack, and mode. |
| Stack handling | Stack may move together and drop units; dropped units cannot resume | Units move individually | Need atomic stack move and irreversible drop-off bookkeeping. |
| Fractional MA | Never round; half/quarter/double modifiers are common | Mostly integer MA and STOP mechanics | Use rational or quarter-MP units, not floating-point equality. |
| Terrain | Hex + additive hexside, or continuous road overrides both; worst terrain in multi-terrain hex | Terrain/road costs with BCS-specific STOP and movement classes | Geometry can remain; terrain schema and cost strategy must change. |
| One-hex move | Allowed when otherwise eligible and not prohibited | Similar | Reusable abstraction with OCS eligibility inputs. |
| Bidirectional legality | A→B legal only if B→A would also be legal | No equivalent global invariant | Every OCS edge validator must enforce symmetric terrain entry. |
| Interleaving | Once unit/stack starts, it must finish before another unit or air mission; limited Transport Point exception | Similar unit sequencing via STOPPED/FINISHED, but activation-based | OCS needs per-segment `currentMover`, not Fire Events. |
| ZOC | Mainly stops Truck MP | Normal/AV/Engagement/Screen systems | Rewrite. |
| Overrun | Costs MP and is integrated into a movement path | Separate BCS combat interaction | Route execution must pause for an overrun decision/result. |
| Fuel/supply | Can restrict MA and movement eligibility | MSR/SNAFU-oriented | Movement request must include logistics projection. |

## State and action implications

Minimum new state:

- counter family, face orientation, OCS mode, printed values per face;
- original and current steps, current RE, mobility per face;
- attack capability and unit special capabilities;
- current segment movement allowance as an exact fractional value;
- moved/not-moved and `movementCommitted` state for ZOC negation;
- active moving group, common path, per-unit MP spent, and dropped-off members;
- reserve marker pool and release provenance;
- OOS, internal-stock, fuel, cargo, and facility references (detailed later);
- fog-of-war visibility projection independent from authoritative state.

Minimum action families:

- choose voluntary mode and orientation at movement start;
- begin a unit/stack move, enter a hex, drop units, finish movement;
- release a Reserve in Reaction or Exploitation;
- declare overrun when movement enters a valid target (resolved in Study 3);
- record/clear phase-scoped ZOC negation commitments;
- enforce segment-end stacking and Clean Up mode removal.

## Reuse classification

| `bcsEngine` candidate | Class | Reason |
|---|---|---|
| Axial coordinate conversion, neighbors, distance, line drawing | Direct/adapt | Geometry is independent of series rules; names and edge conventions must be verified. |
| Generic graph search / reachable-set structure | Adapt | Keep algorithm shape; replace cost, stop, ZOC, stack, phase, and status predicates. |
| Terrain and hexside data model | Reference | OCS needs multiple terrain types per hex, full TEC data, road families, rail, ports, air bases, hedgehogs, and game-specific overrides. |
| BCS movement-cost function | None | Encodes BCS move classes, STOP terrain, Traffic, and unit statuses. |
| BCS stacking utilities | None | Unit-count stacking is incompatible with OCS RE and checkpoint rules. |
| BCS ZOC/Engagement/Screen utilities | None | Source eligibility and movement effects differ materially. |
| Map viewport/render culling | Adapt | Independent of movement rules, but must render much denser stacks and markers. |

## Test consequences

The OCS movement suite must cover at least:

1. every mode's MA multiplier without rounding;
2. face orientation surviving DG/Exploit entry and restoring at Clean Up;
3. Reserve marker limits, release timing, and different Reaction/Exploitation MA;
4. Truck versus Leg/Tracked behavior in negated and unnegated EZOCs;
5. negation ending when the carpet unit later spends MP;
6. supply/rail/port/refit ZOC effects as separate purposes;
7. dynamic RE after multi-step losses and checkpoint-specific overstacking;
8. stack drop-off preventing later movement;
9. continuous-road override versus additive hexside cost and worst terrain;
10. bidirectional terrain legality and minimum one-hex movement;
11. move execution pausing/resuming around an overrun;
12. role restrictions in regular Movement, Reaction, and Exploitation.

## Unresolved questions and dependencies

- The first game's Terrain Effects Chart is required before concrete movement
  costs or map import can be accepted.
- The first game's Reserve marker limits must be scenario data.
- A representation is needed for exact quarter-MP arithmetic; integer quarter-MP
  ticks are the current recommendation, pending TEC review.
- Fog-of-war UI requirements affect stack rendering and hot-seat workflows, but
  should not hide data inside authoritative engine state.
- Study 4 must decide how fuel, trace supply, rail, cargo, and transport modify
  movement requests.

## Completion checklist

- [x] All six OCS modes have lifecycle and rule effects recorded.
- [x] OCS and BCS stacking semantics are distinguished.
- [x] OCS ZOC purposes and negation are separated from BCS AV/Screen systems.
- [x] Movement differences are mapped to state and actions.
- [x] Reuse candidates are classified.
- [x] Required movement tests and external TEC dependency are explicit.
