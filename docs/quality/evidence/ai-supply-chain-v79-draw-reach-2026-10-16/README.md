# heuristic@79: HQs stay within rail draw range (development batches)

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). Development evidence only: the
registered independent promotion run has not been played, and heuristic@78 stays the standard. Follows
[ai-supply-chain-v79-development-2026-10-16](../ai-supply-chain-v79-development-2026-10-16/README.md) (v79a–v79f).

## Inputs

- v79g: the candidate of `48484f0` with the HQ rule the user set: an HQ ending where neither a dump nor a rail station is within its
  draw range costs 80 (replacing −30 for no dump and +20 for standing on a rail hex); draw range approximated as 2 hexes.
- v79h: the commit that adds this folder: draw range from the new rules query `queryDrawReach` (5 Truck MP along a supply path plus
  the adjacent hexes, 12.3a, 12.3c, normal terrain costs per 12.3d), used for the HQ rule, rail to the HQs and trucks feeding dry
  HQs. `tests/rules/draw-reach.test.ts`: 6 hexes over clear terrain, 2 through woods.
- Generator `2422b10` (Rail Cap 0.8 per division); opponent frozen heuristic@78; the same command, seeds and gates as the
  earlier folder (AXIS_ATTACKS, 32×24, TEMPERATE_INLAND 1300200–1300207 and EASTERN_EUROPE 1300300–1300307, `--swap --trace`).

## Expected

All games FINISHED with matching replays; the 攻方送補 and 攻方運補 gates pass; supply audit violations 0; fewer attacker units
unable to fuel than v78.

## Observed

Both batches: 16/16 FINISHED, replay ok, 0 failed.

| Attacker | v78 | v79f | v79g | v79h |
|---|---|---|---|---|
| Units unable to fuel a game (share of those needing fuel) | 26.6 (24%) | 32.5 (35%) | 16.4 (20%) | 5.9 (8%) |
| Dry HQs | 14% | 16% | 15% | 1% |
| SP no front unit can draw, a segment | 6.7 | 2.6 | 1.8 | 1.8 |

v78's figures are from the v79h batch (26.5, 14% and 6.7 in v79g; 23.1, 11% and 6.5 in v79f, played at a different revision). v79h:

- 攻方送補 gate: PASS, 1.8 vs 6.7 SP ([v79h-fuel-gate.json](v79h-fuel-gate.json)).
- 攻方運補 gate: PASS on all three items: rail 1.00; rear SP left after moving 6.0 vs 12.4; garrison stock 0/0
  ([v79h-logistics-gate.json](v79h-logistics-gate.json)).
- Supply audit (`ai-supply-study.mjs`): preview mismatches, other-unit trace breaks, relocation trace breaks and feed breaks 0 in
  both groups; every optional spending kept the ration commitments.
- As attacker VP 7.6, steps killed 27.6, lost 12.2 (v78 5.8 / 23.4 / 15.4); as defender VP 8.5 (v78 6.6).

Saves and traces: the ignored `artifacts/ai-logistics/supply-chain-v79/` (v79g, v79h) of the `ai-truck-shuttle` worktree.
