# Candidate heuristic@81: assault planning by posture, development batches

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. It is development evidence only; heuristic@79 stays the standard and
no independent batch has been registered. The variants were built as "v80…" in `artifacts/ai-assault/`; the candidate is
numbered 81 because candidate 80 is the rejected artillery-mode change
([ai-artillery-mode-v80-development-2026-10-16](../ai-artillery-mode-v80-development-2026-10-16/README.md)).

## Question

The force-concentration research ([ai-force-concentration-v79-2026-10-16](../ai-force-concentration-v79-2026-10-16/README.md))
found the attacker spreading its strength, sizing assault groups without regard to terrain, stopping units 2–3 hexes out
because each judged its exposure alone, and dropping attacks over the combat supply term. The user asked to work on the
assault plan and the SP price together, with artillery concentrated for the assault, and then for different strategies by
engagement role.

## Inputs

- Source: `97ea6b0` plus the working-tree changes of each variant; the committed candidate is the last one (v80q).
- Opponent: frozen heuristic@79 (`artifacts/ai-promotion/frozen-v79/dist`, from `93df378`); both sides on the candidate's engine.
- 32×24, six divisions (two armored) per side before the attacker's ratio, eight turns, no aircraft, `--swap --trace`.
- Development seeds: TEMPERATE_INLAND 1300200–1300207 and EASTERN_EUROPE 1300300–1300307 (16 games per engagement).
- Wide seeds: TEMPERATE_INLAND 1310000–1310009 and EASTERN_EUROPE 1310100–1310109 (20 games per engagement). These were reused
  for every later variant, so the final numbers on them are selected, not independent.
- Baseline: the wide attack seeds with frozen heuristic@79 on both sides (`v79-baseline-wide`), for
  `scripts/ai-role-margin.mjs`.

```sh
B=artifacts/ai-promotion/frozen-v79/dist
for e in AXIS_ATTACKS MEETING; do
  node scripts/ai-match.mjs --matches 10 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE \
    --air-transport NONE --engagement $e --allied heuristic --axis heuristic@$B --swap --trace --start 1310000 \
    --style TEMPERATE_INLAND --out <dir>/$e-TEMPERATE_INLAND          # and --start 1310100 --style EASTERN_EUROPE
done
# baseline: the same with --allied heuristic@$B --axis heuristic@$B
node scripts/ai-compare.mjs <dir>/AXIS_ATTACKS-* <dir>/MEETING-*
node scripts/ai-role-margin.mjs <baseline>/AXIS_ATTACKS-TEMPERATE_INLAND <dir>/AXIS_ATTACKS-TEMPERATE_INLAND \
  <baseline>/AXIS_ATTACKS-EASTERN_EUROPE <dir>/AXIS_ATTACKS-EASTERN_EUROPE
node scripts/ai-objective-flow-study.mjs <dir>/AXIS_ATTACKS-* --out <dir>/flow
node scripts/ai-concentration-study.mjs <dir>/AXIS_ATTACKS-* --out <dir>/concentration
```

Ablations without a rebuild passed weights as `--allied heuristic:<weights.json>` (recorded per variant in
[results.json](results.json)).

## Observed

Every batch: all games FINISHED, replay ok, 0 failed. Paired VP margins of the candidate (per pair, ± SE) from
[results.json](results.json); "attacking" and "defending" are `ai-role-margin` changes against the v79 baseline (positive is
better than v79).

### Development seeds (8 pairs per engagement)

| Variant | Change | Attack | Meeting |
|---|---|---|---|
| v80 | effort sized to Open 3:1 (column 6) under the objective's terrain, from a new rules query; groups gather 2 hexes out until the units that can arrive reach it; exposure and contact judged by the gathered strength; up to 3 guns per effort in Combat Mode near it; DG assumed when a gun can fire; no piecemeal captures of defended objectives; SP priced by the stock in reach | −2.50 ± 1.38 | +1.63 ± 1.59 |
| v80c | sized to the column the Combat Segment would accept (`requiredColumn`) | −0.13 ± 1.67 | — |
| v80d | that column only if the attack empties the hex half the time | −4.25 ± 1.57 | — |
| v80e | size for at least column 6, launch at the accepted column; close in when the arriving units bring the group's column | +0.75 ± 1.32 | −3.50 ± 3.27 |
| v80f | members only within about two turns; HQs and trucks follow the strongest effort | −0.25 ± 2.04 | −0.50 ± 3.11 |
| v80g | posture split: attacker as v80e, defender and meeting sides as v80c without gathering and with piecemeal captures | −0.13 ± 2.01 | −1.88 ± 2.95 |

### Wide seeds (10 pairs per engagement)

| Variant | Change from the row above | Attack | Meeting | Attacking | Defending |
|---|---|---|---|---|---|
| v80g | as above | −1.50 ± 1.65 | +0.50 ± 1.59 | −4.6 ± 3.8 | +1.6 ± 1.4 |
| v80h | exposure judged by the stack, group members exempt from crowding | −2.80 ± 1.52 | +3.80 ± 2.92 | −8.0 ± 4.0 | +2.4 ± 1.2 |
| v80i | no gathering for anyone | −1.90 ± 2.36 | +3.80 ± 2.92 | −6.2 ± 4.8 | +2.4 ± 1.2 |
| v80j | attacker uses the meeting posture | −2.50 ± 1.51 | — | −7.4 ± 3.4 | +2.4 ± 1.2 |
| v80k | v80j without SP pricing | −4.50 ± 1.59 | — | −11.0 ± 3.4 | +2.0 ± 1.1 |
| v80l | v80j without effort guns | −2.60 ± 1.38 | — | −8.6 ± 3.6 | +3.4 ± 1.7 |
| v80m | attacker launches only at column 6, near units, v79 captures | −3.60 ± 1.73 | — | −9.6 ± 4.2 | +2.4 ± 1.2 |
| v80n | attacker on the heuristic@11-79 effort rule (2.5 × printed strength, 12 hexes, 6 units) | −0.30 ± 0.67 | — | −3.0 ± 1.7 | +2.4 ± 1.2 |
| v80o | v80n without SP pricing | −1.30 ± 1.76 | — | −4.6 ± 3.3 | +2.0 ± 1.1 |
| v80p | v80n without effort guns | +0.20 ± 0.80 | — | −3.0 ± 1.7 | +3.4 ± 1.7 |
| **v80q** | v80n; only the main effort's objective counts double in combat (heuristic@11-79) | **+0.30 ± 1.40** | **+3.30 ± 2.57** | −1.8 ± 2.4 | +2.4 ± 1.2 |

v80q over the 40 wide games each side: VP 11.03 against 9.23 a game, margin +1.80 ± 1.59. Full suite 753 passed, 8 skipped;
typecheck and build clean.

### What the measurements showed

- **The roles had to be measured apart.** In a paired attack batch the candidate's attacker meets the opponent's defender, so
  "attacker VP" mixes both. Against the self-play baseline every variant defended better than v79 (+1.6 to +3.4) and every
  variant with a new attacker effort rule attacked worse (−4.6 to −11.0).
- **Why the new attacker rules lost** (`ai-objective-flow-study`, v80j against the baseline): the same number of objectives
  taken by combat (1.8 against 1.7 a game) but a third of the empty objectives walked into (0.5 against 1.7), with twice the
  attacks on defended objectives (6.9 against 3.4) at a lower column (4.6 against 6.9), the defenders staying in 68% (35%).
  Sizing to the column the Combat Segment accepts lets the objective's VP term launch efforts at 1:1–2:1; the units in them
  are not free to take empty objectives.
- **Gathering out of reach was attacked.** With v80g the defender attacked units on assault tasks 2.8 times a game (v79 0.8)
  and units that had not moved 3.6 times (1.4); the gathered groups stood beside the enemy line for turns.
- **Doubling every effort's objective** (v80n against v80q): the attacker attacked objectives 6.0 times a game at column 6.2;
  with only the main effort doubled, 5.6.
- **SP pricing helped** (v80j −7.4 → v80k −11.0; v80n −3.0 → v80o −4.6). **Effort guns made no measurable difference** (v80j
  −7.4 → v80l −8.6; v80n −3.0 → v80p −3.0).

Saves, traces and the `concentration` and `flow` outputs: the ignored `artifacts/ai-assault/` of the `ai-truck-shuttle` worktree.
