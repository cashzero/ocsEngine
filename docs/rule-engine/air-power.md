# Air power

## Scope

How air power (OCS 3.5, 9.14f, 10.0c–e, 13.5f, 13.6, 13.8d, 14.x, 15.x) is set up and played in generated games, and
the decisions behind it. The rule-by-rule behavior and gaps are the notes of the manifest rows `air.bases-and-refit`,
`air.missions`, `air.transport-and-drop` and `air.replacements-and-reinforcements` (`src/rules/manifest.ts`); code in
`src/rules/air/`. The plan is `docs/roadmap/08-air-power-wbs.md`.

## Current behavior

### In generated games

- New Game's **Air forces** option (default None) gives each side aircraft and Air Bases from 22 transcribed US and German
  counters (`docs/oob/M11-air-counter-corpus.md`, `src/generation/oob/air-corpus.ts`); **Air transport** adds transports
  and one paratroop battalion per side. Aircraft reinforcements come with Air forces.
- In attack scenarios the attacker also has off-map air flying from an off-map airfield through its friendly AEP
  (`docs/quality/03-product-operation-verification-plan.md` section J).
- Eq replacements arrive every turn in every game ([replacements.md](replacements.md)) and rebuild aircraft as well as
  ground units.
- Air uses its own random-number stream in the generator, so turning air on does not change the rest of the package.

### In play

- **Bases and refit**: Active/Inactive aircraft, base capacity by Level, refit in the Aircraft Refit Phase for 1T, capture
  on the Air Base Capture Table with displacement, voluntary reduction, combining reduced aircraft.
- **Construction**: an Engineer-Capable unit in Combat Mode builds an Air Strip (1T), upgrades a Strip to Level 1 (3T),
  builds a new Level 1 base (4T) or raises a Level (4T a turn, at most Level 3), paid from a dump that can draw to the hex.
  Air Strips are always allowed in generated games.
- **Missions**: the 14.2f sequence with Air Combat at enemy bases, interception by one Active Fighter whose Patrol Zone
  covers the mission hex, Flak and the Mission Loss Table; air barrages on units, barrages against facilities (Air Bases,
  ports), Trainbusting, Fighter Sweep and Base Transfer; one barrage per hex and phase.
- **Air transport and drops**: transports carry SP and eligible Leg units; drops need a Drop Plan made in an earlier Refit
  Phase (supply drops do not); each unit and each 1T rolls the Air Transport Success Table.
- **Aircraft replacements**: 1 Eq beside a Combat Mode HQ rebuilds two aircraft steps.

### In the UI

Refit panel (every base with Level, refit capacity, Active count and why it cannot refit), mission flow (target hex,
aircraft, preview with column, shifts, Flak modifiers and whether the hex is in an enemy Patrol Zone), Patrol Zone overlay,
Trainbusting markers named in hover and keyboard text, air decisions in the decision panel, and every mission result in the
notice line and Log.

## Decisions

- **Rules left out** (user decision): BtR Flight Conditions, so weather never limits air missions; nationality rules, so no
  air force can Hip Shoot (the rule is implemented and tested, but unreachable in generated games); the Air Transport
  Success Table's game-specific −1 modifiers.
- **Eq is a fixed expected allotment per turn** (user decision 2026-10-03), now rolled on the Variable Replacement Table
  around the same averages.
- **Off-map air only for the attacker** (user decision 2026-10-07).
- **Hand-overs follow the rules**: Air Combat and interception alternate between the players as the rules require, with a
  hot-seat hand-over for each choice; there is no shortcut that changes the rules.
- **The UI need not explain every rule** (user decision 2026-10-14): a second barrage on the same hex or a second mission
  by the same aircraft is simply not offered.

## Known gaps

From `docs/quality/05-todo-inventory.md`: `glider-points`, `para-gpid`, `transport-art`, `air-audit-probe`, `bot-air`.
Also open, with closing evidence in the manifest notes and `03` section F:

- Mission Loss with its W/S choice has not been observed in the browser (AIR-04).
- Hip Shoot is BLOCKED in generated games (AIR-05).
- Every Movement and Barrage segment stops while any aircraft could fly a mission, which adds steps and hand-overs. It
  follows the rules; whether to add a "no missions this phase" shortcut is a pending user decision (`05`).
- The state revision is shown only on the Game End dialog, so mid-game evidence records turn, player and phase instead.

## Verification

- Rule tests: `tests/rules/ocs-air.test.ts`, `ocs-air-transport.test.ts`, `ocs-air-support.test.ts`,
  `off-map-airfield.test.ts`; `air-integration.test.ts` plays a generated game with air to `COMPLETE` and replays it.
- Browser rows AIR-01 to AIR-15 and AEP-01 to AEP-03 in `docs/quality/03-product-operation-verification-plan.md`; run
  records in `docs/quality/evidence/air-2026-10-03/RUNS.md` and `docs/quality/evidence/aep-2026-10-13/`.
