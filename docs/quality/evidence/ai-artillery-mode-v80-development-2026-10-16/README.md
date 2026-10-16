# Candidate heuristic@80: artillery in Combat Mode, development batch

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Decision: **rejected** before an independent batch.

## Candidate

[candidate-80.patch](candidate-80.patch) on `50eff97` (heuristic@79): artillery whose nearest enemy is within its range + 1 hexes
as it begins to move switches to Combat Mode (5.4: a mode is set as the unit begins to move); farther than range + 3 it switches
back to Move Mode. The patch includes a test on a recorded position (seed 1300205, Turn 4, eight Axis guns in 12,10 two hexes from
the enemy, all in Move Mode) that failed on heuristic@79 and passed on the candidate. Typecheck, build and the full suite passed
(753 passed, 8 skipped). The source was reverted after this batch; the recorded position is regenerated from the batch's save.

## Inputs

- Opponent: frozen heuristic@79 (`artifacts/ai-promotion/frozen-v79/dist`, from `93df378`); both sides on the candidate's engine.
- 32 games: 32×24, six divisions (two armored) per side before the attacker's ratio, eight turns, no aircraft; MEETING and
  AXIS_ATTACKS; TEMPERATE_INLAND 1300200–1300207 and EASTERN_EUROPE 1300300–1300307; `--swap --trace`.

```sh
B=artifacts/ai-promotion/frozen-v79/dist
for e in AXIS_ATTACKS MEETING; do
  node scripts/ai-match.mjs --matches 8 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE \
    --air-transport NONE --engagement $e --allied heuristic --axis heuristic@$B --swap --trace --start 1300200 \
    --style TEMPERATE_INLAND --out <dir>/$e-TEMPERATE_INLAND        # and --start 1300300 --style EASTERN_EUROPE
done
node scripts/ai-compare.mjs <dir>/AXIS_ATTACKS-* <dir>/MEETING-*
node scripts/ai-concentration-study.mjs <dir>/AXIS_ATTACKS-* --out <dir>
node scripts/ai-supply-study.mjs <dir>/<each>
```

## Expected

All games FINISHED with matching replays and no supply audit violations; more and stronger attacker barrages and a VP gain.

## Observed

- 32/32 FINISHED, replay ok; supply audit: HQ breaks, other-unit trace breaks, relocation trace breaks, preview mismatches and
  feed breaks all 0.
- VP margin of v80: −0.06 ± 1.85 over 32 games; attack +0.38 ± 0.98 (8 pairs), meeting −0.50 ± 1.15 (8 pairs).
- The mode changed: attacker guns at the Combat Phase COMBAT 298, MOVE 112, DG 6 (v79 in the same batch: MOVE 392, DG 14,
  COMBAT 10). Barrages fell: 0.3 a phase against 0.5, and 9 of 90 attacks hit a barraged hex against 17 of 83
  ([concentration.json](concentration.json)).
- Why: the Barrage Table charges by strength column (25–40: 4T, 41–68: 6T, 69–116: 8T, 10.0c costs), so a Combat-side barrage
  with the same guns costs more. The policy scores a barrage as chance of DG or better × 10 (4 when no own unit is adjacent)
  + expected steps × 10 − Tokens × 1.2 against a threshold of 2: per target hex the best barrage's column rose 5.1 → 5.9, its
  cost 6.2 → 7.1 Tokens, and the hexes clearing the threshold fell from 16 of 52 to 8 of 34. Guns 4–5 hexes from the enemy rose
  from 0.6 to 2.1 a segment: the Combat side moves 3–5 MP against 14 and lags behind an advance.

The barrage is limited by the price the policy puts on SP and by its 2-hex range (1.2–1.4 hexes in reach a segment), not by the
mode. Not adopted; recorded in `docs/ai/heuristic-policy.md`.

Saves and traces: the ignored `artifacts/ai-artillery/v80-development/` of the `ai-truck-shuttle` worktree.
