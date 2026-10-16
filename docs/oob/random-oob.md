# Random OOB

## Scope

How `generateRandomOob` (`src/generation/oob/`, generator version 0.5.0) builds both sides' forces: options, divisions
and formation packages, independent units, balance, names, validation, determinism and the seed sweep. Printed values
come from the [counter corpus](counter-corpus.md); placement on the map is deployment
([docs/game-flow/deployment.md](../game-flow/deployment.md)).

## Current behavior

### Options and output

- Options: uint32 seed; scale `COMPACT`, `STANDARD` or `LARGE`; 1–20 divisions per side, 0–6 of them armored (never more
  than the divisions); air forces and air transport (`NONE` or `STANDARD`); the attacker in an attack scenario; whether the
  attacker has off-map air. Invalid options return every error and no output.
- Output: generator and schema versions, normalized options, exactly one Allied and one Axis side (formations and
  independent units), a one-to-one Foundation `PieceDefinitionCatalog`, metrics, provenance and warnings. No hex,
  `PieceState`, owner player, objective or scenario. `serializeGeneratedOob` emits canonical JSON; equal options give
  byte-identical output. `src/generation` imports only core, domain, serialization and its own seeded RNG.

### Divisions

- In an attack the attacker fields 1.5× the divisions and armored divisions (`ATTACKER_FORCE_RATIO`, capped at the
  limits).
- The plan lists the armored slots first (Allied armored divisions; Axis Panzer divisions, every second one a
  Panzergrenadier package), then the foot slots from a seeded cycle of three infantry to one airborne. The Allies have no
  mobile-infantry package; their mobile slot is an armored division. Every division has a distinct historical name; airborne
  slots beyond the airborne name pool (4 per side) become infantry.
- **Armored and mobile infantry** divisions are multi-unit formations: at least two combat units, organic artillery (two
  at `LARGE`) and reconnaissance; the scale gives two, three or four combat elements.
- **Infantry and airborne** divisions are single XX counters (no formation members, 3.1c) that can detach Breakdowns
  (20.0).
- **HQs are never formation members** (3.2f): each side gets one HQ per three divisions (at least one) among its
  independent units, each built from its own BTR HQ counter.

### Independent units

| Unit | Compact | Standard | Large |
|---|---|---|---|
| Armor and anti-tank battalions (each) | 2 | 3 | half the divisions |
| Artillery | one per three divisions (at least 1) | one per three divisions | half the divisions |
| Engineer (pontoon) | 1 | 1 | half the divisions |
| Truck points | half the expected SP income | same | same |
| Supply dumps | one per two divisions | one per two divisions | one per division |
| HQs | one per three divisions | same | same |

- A side expects about one SP a turn per division from the Supply Table (its Supply Status column is its division count,
  2 to 12 SP; `expectedSupplyIncome`) and gets half a point of trucks per SP (`TRUCK_POINTS_PER_SUPPLY_SP`), rounded, at
  least 1. With more divisions the attacker gets more. Half the points (rounded up) start on the map as one counter; the
  rest arrive as one-point trucks, one a Game Turn from Turn 2. Each truck counter prints its own size (13.2c).
- Starting supply is 8T (2 SP) per division, shared among the side's dumps.
- Each side also gets a garrison definition (one per objective at deployment), a hedgehog definition, Pax and Eq
  replacement definitions, Breakdown definitions, and with air forces aircraft and Air Bases
  ([docs/rule-engine/air-power.md](../rule-engine/air-power.md)).

### Balance

Balance is the ratio of the two sides' combat values (printed full-strength Combat Mode strength weighed by Action
Rating, ×0.7 at AR 0 up to ×1.2 at AR 5; defensive-only units at half; artillery at a quarter of its barrage strength;
HQs, trucks, dumps and garrisons not counted), with the attacker's value divided by 1.5. While the weaker side is
more than 10% behind it receives independent armor and anti-tank battalions in turn (a weaker Axis gets Tiger and
Jagdpanther battalions), up to max(8, 2 × divisions); a remaining gap is a warning.

### Names

Short counter forms (`82.Abn`, `2.A`, `35.Inf`, `12.SS`, `3.PG`, `352.VG`, `6.FJ`, `FBB`); a single-unit division is
named after itself; support units use abbreviations (`Div Arty I`, `Rcn Det`, `Truck Co`, `Pi Bde`). Formation names come
from reviewed US and German WWII formation profiles (`name-catalog.ts`, after `bcsEngine`'s formation catalog);
subordinate packages are synthetic and no historical order-of-battle accuracy is claimed. Names and local IDs are
deterministic functions of seed, side, formation, role and ordinal.

### Validation

Generation fails closed if Foundation catalog validation or the OOB validator reports an error: one Allied and one Axis
side with the requested divisions; unique unit and definition IDs mapped one to one; consistent side and formation
ownership; command, combat, organic and independent artillery, engineer, transport and supply present; positive integer
point costs; a positive combat value per side; valid faces, steps, quantities, profiles and sources.

### Seed sweep

`sweepRandomOobSeeds` generates 1,000 consecutive seeds and counts invalid outputs and exceptions separately;
`tests/generation/oob-seed-sweep.test.ts` requires zero of each.

## Decisions

All by the user unless noted:

- **Divisions per side and how many are armored** replace the old formations-per-side option (2026-10-03); the maximum
  is 20.
- **More independent units, including armor and anti-tank, and objective garrisons** (OOB 0.4.0, 2026-10-07).
- **Balance by combat value, not points** (0.4.0): equal points had left the US side about 40–57% stronger.
- **Truck points follow supply income; the late ones are one-point trucks** (2026-10-08, 2026-10-12, 2026-10-16). One
  five-point truck per three divisions gave the attacker about 15 points against about 9 SP of income: the trucks loaded
  0.41 SP per point a turn and left 1.6 SP in the rear, so income, not transport, limited the front. Published BTR
  scenarios give 0.07-0.4 truck points per division (Operation Queen: 1 point for about 14 US divisions). Half a point
  per SP makes lift the limit: in the same 16 attack games the attacker's trucks carried 0.94 SP per point and 6.2 SP
  stayed in the rear. Sizing trucks from the smaller side's divisions was rejected: the attacker should have more.
- **The attacker gets 1.5× the divisions** (2026-10-07: "進攻方兵力要比較多吧").
- **No standalone OOB laboratory**: forces are previewed only inside New Game.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `oob-revision-ui`, `oob-naming-ui`, `airborne-gpid`, `para-gpid`,
`oob-name-import`, `attack-balance`.

## Verification

`tests/generation/random-oob.test.ts`, `oob-revision.test.ts`, `oob-names.test.ts`, `oob-seed-sweep.test.ts`,
`generation-contract.test.ts`, `tests/game-flow/truck-reinforcements.test.ts`; New Game rows in `docs/quality/03-product-operation-verification-plan.md`.
