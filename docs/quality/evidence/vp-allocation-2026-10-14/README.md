# VP allocation correction, 2026-10-14

Acceptance requirements: do not skip valuable objectives to fit the quota; allow excess VP; balance only Meeting Engagement; retain attacker-owned ports at base VP in Attack; ports are rank 0 when either side lacks inland entry. The attacker must still capture approximately half the defender’s starting VP, so its initial port VP is included in its victory threshold as the baseline.

## Supporting automated evidence

35 tests passed across deployment-objectives, engagements, ports and garrison-supply (Vitest, maxWorkers=2, testTimeout=60000). Coverage includes three engagement types and all four inland-entry combinations; every port and every non-city defender junction remains an objective, attack-side VP equals its ports’ base value with no balancing addition, and Meeting Engagement balances starting VP. Small Eastern Europe seeds 1, 0x0c500001 and 777 are balanced in the generated package. Typecheck, build and dist smoke passed. The full suite was interrupted during a heavily loaded run and is not claimed as passed.

## Integrated browser evidence

`play-vp-allocation.mjs` operated the built UI in Chromium with visible controls: changed Map from 32×24 to 28×20 and OOB from 6 divisions / 2 armored to 4 / 1; Allied attack, flank sea, Allied ports only, Allied Sea Cap 5, Axis Sea Cap 0. It also checked refusal of Sea Cap 0 for the landing side. Map seed 206569473 (0x0c500001); other seeds retain the New Game defaults.

Preview (`03-preview.png`) shows 6 objectives, 19 VP: Allied 3, Axis 16, 3 ports and no generation warnings. Start the previewed operation (`04-start.png`): Allied acts first; the actual top bar agrees at Allied 3 / Axis 16. The preview ownership summary now uses actual controllers rather than the obsolete “all held by Axis” assumption. Visual inspection confirms the corrected summary and the changed map/OOB inputs.

End each required segment/phase, complete hot-seat handoffs and the First Player decision (“Go second”), then reach Allied Turn 2 Movement (`06-turn2-movement.png`). No combat or movement orders were exercised in Turn 1; the legal UI actions were phase completion, handoffs and the required decision. Ship 4T of supply to the Allied landing port 0105 in Turn 2 (`07-sea-ready.png`, `08-shipped.png`): Sea Cap falls from 5 to 4; starting VP remains 3 / 16. Browser log records the steps and zero browser/console errors. Attack VP was not balanced.

## Issues and verification limits

The initial implementation incorrectly balanced Attack to 16 / 16. The user rejected that interpretation; preserved evidence is in `superseded-balanced-attack/` and must not count as acceptance for the corrected rule. Its run also exposed stale preview ownership text, which was fixed and rechecked above. A navigation timeout during rerun occurred after the local server was stopped across an interrupted turn; restarting the server allowed the corrected run to finish. Generation/start latency was not measured.

Existing usability issue remains: the mounted map starts centred, with the landing port outside the initial view; the shipping destination list allows selecting it. TODO: centre the landing side’s initial view on its port or provide a visible navigation control; user-visible impact is extra navigation to locate the landing port; acceptance requires starting a ports-only game and locating the port directly through the visible map/navigation.

NG-11 stays IN PROGRESS: corrected Meeting Engagement and Axis Attack have not both been exercised through the full browser boundary. Small-map visual acceptance remains TODO in `docs/game-flow/03-deployment-generator.md`. Automated coverage does not promote those operations to PASS. Port capture and resulting VP transfer were not exercised in this browser run and remain under MAP-08’s existing IN PROGRESS gate.
