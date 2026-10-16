# Artillery barrage

## Scope

Artillery attacks against combat units, ports and Air Bases under OCS 10.0, 10.1 and 13.4.
Air missions use the same facility effects described here. Their flight sequence belongs to [air-power.md](air-power.md).

## Current behavior

`DECLARE_BARRAGE` announces `COMBAT_UNITS`, `AIR_BASE` or `PORT`. An omitted target in an older action means combat units.
The Targets tab offers enemy facilities within artillery range even when no enemy combat unit occupies their hex.
The barrage draft names the target and lets the player change it without changing the selected artillery.

Combat-unit targets use the ordinary 2d6 Barrage Table and its shifts. Facility targets use the Barrage vs Facility Table
with 1d6, no shifts and no spotter requirement. The preview displays the table, column, strength and supply cost.
The Facility Table costs 1T for strength 1–10, 2T for 11–20, 4T for 21–40, 6T for 41–80 and 8T for 81 or more.
Every barrage pays through one HQ or from one dump reaching all firers. Internal stocks cannot pay for artillery fire.

A port takes only the table's numbered hits, up to four accumulated hits. An Air Base loses the numbered levels down to
Level 1. An Air Strip never loses a level. A parenthesized result checks every enemy aircraft in the target hex separately,
including Inactive aircraft, and each qualifying die causes one step loss. The attack affects only its announced target.
It does not DG combat units while firing at a facility, or damage a port while firing at its colocated base.

Artillery fires only in Reaction, Combat and Exploitation Barrage segments, within its printed range and subject to mode
and reserve-release restrictions. A unit fires once per phase. A hex receives one barrage per phase across all target
types and both air and artillery attacks. Ports at four hits are no longer offered as targets.

The existing transaction reserves supply before resolution and permits cancellation before the roll. The log and result
card report the facility die and effects. Target selection is retained in saves and replays.

When no legal artillery attack remains, the phase hint and Targets show the rule query's actual blocking causes.
Range, unavailable supply, a fired unit and a previously barraged hex have distinct messages. Multiple causes can appear
because different attempted attacks can fail for different reasons. Any remaining legal attack keeps Targets available.
The query returns typed causes without hidden enemy identities or counts and is unavailable during a hot-seat handoff.

The computer compares facility and combat-unit attacks using separate forecasts. Its public-information scoring and
protection of supply commitments are described in [heuristic-policy.md](../ai/heuristic-policy.md).

## Decisions

The target is part of the existing barrage action and supply transaction. A separate facility attack action would duplicate
the phase, range, payment, cancellation and usage rules. Shared facility resolution keeps aircraft and artillery on the same
table and damage rules. Historical combat-unit actions retain their implicit target when read from older logs.

## Verification

Player-facing acceptance is [ACT-18](../quality/03-product-operation-verification-plan.md), with
[browser and regression evidence](../quality/evidence/artillery-main-2026-10-16/README.md).
Behavior coverage is in `tests/rules/artillery-facility.test.ts` and `tests/rules/ocs-air.test.ts`.
Generate training saves with `node scripts/artillery-facility-position.mjs`, then operate the mounted application with
`node scripts/artillery-facility-acceptance.mjs`. The script also previews and starts a changed coastal Map/OOB package,
moves a unit, and completes that same New Game's first turn. The focused facility attacks use explicitly arranged saves
loaded through the menu, separate from the unmodified New Game run.
`node scripts/artillery-facility-restrictions.mjs` exercises unavailable targets through the same load and map controls.
The typed diagnostics and remaining legal attacks are covered by `tests/ui/barrage-diagnostics.test.ts` and ACT-19.
Computer target valuation and payment use `tests/ai/facility-barrage.test.ts`; the mounted BOT-12 flow is operated by
`node scripts/artillery-facility-computer-acceptance.mjs`. Both rows are in the
[product operation plan](../quality/03-product-operation-verification-plan.md).
The [integrated facility evidence](../quality/evidence/artillery-main-2026-10-16/README.md) records human attacks and both
diagnostic viewports. The [computer evidence](../quality/evidence/artillery-main-2026-10-17/README.md) verifies the current
default candidate's port/base attacks, changed New Game turn, save/replay and full quality checks.
