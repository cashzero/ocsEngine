# Deployment

## Scope

How the generated forces are placed on the generated map: zones, sectors, troops, supply, engineers, Air Bases,
reinforcements, starting control, objectives and garrisons. Code: `src/game-flow/deployment.ts`,
`src/game-flow/garrison-supply.ts`. The pipeline around it is in [overview.md](overview.md); the engagement scenarios and
their balance are planned in `docs/roadmap/13-engagement-scenarios-wbs.md`.

## Current behavior

The deployment seed changes location choices only. Too little land or too few strategic regions fails at `DEPLOYMENT`;
a unit is never silently dropped.

### Engagements

| | Meeting Engagement (default) | Allied attack / Axis attack |
|---|---|---|
| Zones | split at the middle | the split moves toward the attacker by 0.4 of the anchor distance, so the defender holds most of the map |
| Forces | equal divisions per side | the attacker has 2× the divisions and armored divisions (`ATTACKER_FORCE_RATIO`) |
| Front standoff | 4 hexes behind the split | attacker 3, defender 1; the defender's line starts in Combat Mode |
| Objectives | balanced VP, each side holds its own | in the defender's zone and held by it (attacker ports excepted) |
| Garrisons | one per held objective | the defender has one per objective and one per key point (hedgehog Level 1); half its objectives (rounded up, highest VP and then deepest behind the front first) start in a hedgehog, a third of those (rounded down, at least one) at Level 2 and the rest at Level 1; key points number half the objectives, rounded up: rail supply nodes first, then road junctions, spaced from each other and the objectives; the attacker has none |
| Victory | more VP held at the end wins; equal is a draw | the attacker needs its starting VP plus half the defender's, rounded up; no draw |
| First player, Game Turn 1 | Allied | the attacker (rolled as usual afterwards) |
| Off-map air | none | the attacker gets an off-map airfield with 2+2 / 3+3 / 4+4 fighters and bombers (Compact / Standard / Large), refitting without SP and with no Active limit |
| Rail Cap default | 0.8 points per division, at least 1 | the same, from each side's own division count |
| Sea Cap default (with a sea) | 0.25 points per division for a side with inland entry, 0.6 for a side landing by sea; at least 1 | the same |

### 1. Zones

Water is removed from the candidates and land is divided by distance to each side's entry anchors: equal halves in a
meeting engagement, most of the map for the defender in an attack. Each side's zone is ranked by distance plus
deployment-seed jitter.

### 2. Troops by sector

- The front (the part of the start-line band in trace supply) is split along its width into one sector per HQ. A
  sector's main axis is the strongest road or railroad hex crossing the start line in the middle half of the sector
  (rail, then primary road, then junctions); its HQ stands on that axis just behind the line, in trace supply, at least
  four hexes from other HQs where the front is wide enough.
- Divisions are shared between sectors, armored and mobile divisions first so no sector gets two while another has none,
  then by unit count. Each division's centre stands on the start line, spread across its sector, at least three hexes from
  other centres; its units share the centre or stand around it, at most two per hex.
- Independent units (not HQs, trucks or engineers) are shared out one by one, each role spread over the sectors before a
  sector gets a second, a row behind the divisions (artillery two rows), one to a hex where the map allows.
- A unit starting in Move Mode with Truck MA stands on the road net where it can; a front unit in Combat Mode holds its
  ground wherever it is.
- Units stand inside a trace source's draw range where the map allows (adjacent is the fallback), counting only rail
  stations behind the side's start line, which it controls.
- Line units within two hexes behind the start line start in Combat Mode, so the front has a ZOC on the first turn; in an
  attack the defender's whole line does. Where such a ZOC would cut the other side's trace supply at the start (4.5a B),
  the enemy unit whose ZOC cuts the most starts in Move Mode instead.
- In an attack, a unit with no room behind its start line waits off the map and arrives on Game Turn 2 (13.6); a crowded
  meeting engagement fills toward the front instead.

### 3. Supply, engineers and Air Bases

- Dumps are placed after both armies stand. Each goes to a sector by its unit count, behind the line, where its draw
  range fuels the most units no earlier dump reaches (an unfuelled HQ of its sector first), on a road or railroad hex, and
  outside every hex an enemy combat unit could enter in its first Movement Segment. On generated maps that is almost always
  a hex the side's own units hold. Only when no such hex exists does a dump stand within reach, with a warning; a dump
  leaves the road net only where no safe road hex is left.
- Trucks stand out of enemy reach where the map allows, in a hex with room, on a road or railroad hex within 3 hexes of a
  dump of their side. A Truck or Track independent unit no dump can fuel moves to the nearest hex one can.
- Engineers start in Move Mode within 4 hexes of their sector's HQ, out of enemy reach, more than two hexes behind the
  start line, on the road and in a dump's draw range where the map allows.
- Air Bases go last: in the rear, on the road net, clear of dumps, HQs and troops, out of enemy reach.

### 4. Reinforcements

Units with an arrival turn (later trucks, reinforcing aircraft) wait in the side's reinforcement box and arrive on that
Game Turn; the attacker's off-map air waits in its off-map airfield box.

### 5. Runtime state

Owner, face, full steps, mode, resource quantity, stack order and formation membership are set for every piece.

### 6. Starting control (13.3h)

A hex's depth for a side is its distance to that side's nearest entry or supply hex; the side's front is the depth of its
most forward piece. Each side controls its entry and supply hexes, everything behind its own start line, and every land
hex of its zone no deeper than its front: railroads, objectives and open country alike. The ground between the fronts
starts neutral, so a rail station there is not detrainable (13.3c) until a combat unit enters it. On the default 32×24 map
each side controls about a fifth of the land.

### 7. Objectives

- Objectives are settlement hexes: Major City cores, towns, and villages with transport value. VP is the settlement's
  value plus port capacity and railroad value (junction and multi-track bonuses). Every eligible port carries VP,
  including the attacker's own.
- Rail junctions and Major Cities carry VP in both zones of a meeting engagement, or in the defender's zone of an attack.
  The land-area quota (at least 2 VP per side) is a minimum, not a cap; an oversized candidate is added whole.
- Priority: junction, port, city, other settlement (if a side lacks inland entry, ports rank first and junctions second);
  then higher VP, road degree, distance to the front and settlement order.
- **Meeting Engagement** balances starting VP: the lower side fills from its remaining candidates in priority order
  (overshoot allowed, then the other side fills); if it runs out, its highest-priority objective gets the exact shortfall.
  A side with no eligible objective produces an imbalance warning.
- **Attack**: the defender stakes the quota for the whole map, the attacker's ports keep their base VP, and no side gets
  balancing VP. The attacker wins with its starting VP plus half the defender's, rounded up
  (`RuleConfiguration.attackVictory`).
- Every objective has its own side's garrison; defender garrisons keep their hedgehogs, attacker garrisons have none.

### 8. Garrison supply

After composition every garrison's trace supply is checked with the actual rules (rail control, HQs, enemy ZOC). A
key-point garrison out of trace moves to a spaced, supply-connected friendly node within stacking limits, or is omitted
with a warning. An objective garrison out of trace keeps an emergency stock of 1T (one feeding payment, 12.6c); garrisons
in trace get none. The stock is taken from the side's existing on-map dumps, so total SP does not grow.

## Decisions

All by the user:

- **Troops first, supply after** (2026-10-09): HQs spread over the main axes, independents spread rather than grouped,
  divisions shared out, then the dumps placed where the opening enemy move cannot reach them.
- **Truck-MA units on roads; front in Combat Mode** (2026-10-09), so the front has a ZOC on Game Turn 1.
- **Engineers are not line units** (2026-10-10): they are placed with the supply.
- **Neutral ground between the fronts** (2026-10-05).
- **Every eligible port carries VP**, including the attacker's (2026-10-14).
- **Fewer garrison SP** (2026-10-13): only isolated objective garrisons get an emergency 1T.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `deployment-browser-check` (the sector plan, supply placement and Combat Mode
front seen only in automated seed scans), `small-map-visual`, `GS-AI`, `sea-landing-balance`, `reinforcement-options`.
The force-timing assessment and candidate settings are in [reinforcement-balance.md](reinforcement-balance.md).

## Verification

- `tests/game-flow/deployment-plan.test.ts` (100 seeds per engagement with every unit in trace; 50 with every enemy dump
  out of first-move reach and every Truck/Track unit fuelable), `deployment-spread`, `deployment-objectives`,
  `deployment-terrain`, `engagements`, `garrison-supply`, `ports`, `truck-reinforcements`.
- Browser rows NG-06, NG-07, NG-11, MAP-04 in `docs/quality/03-product-operation-verification-plan.md`.
