# heuristic@79 supply chain: development batches

Boundary: headless bot-against-bot matches through the Gameplay Engine (`scripts/ai-match.mjs`). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. It is development evidence only: the registered independent
promotion run has not been played, and heuristic@78 stays the standard.

## Inputs

- Candidate: the source of the commit that adds this folder (heuristic@79, `docs/ai/heuristic-policy.md`); generator
  `362e972` (half the defender's objectives dug in) for v79a–v79d, plus `2422b10` (Rail Cap 0.8 per division) for v79e–v79f.
- Opponent: frozen heuristic@78 (`artifacts/ai-logistics/candidate-78/dist`, from `affa01a`; `src/ai` unchanged since).
- Every batch: AXIS_ATTACKS, 32×24, six divisions per side before the attacker's ratio, eight turns, no aircraft, TEMPERATE_INLAND
  seeds 1300200–1300207 and EASTERN_EUROPE 1300300–1300307, `--swap --trace`: 16 games, the candidate attacking in 8.

```sh
B=artifacts/ai-logistics/candidate-78/dist
common="--matches 8 --parallel 4 --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE \
  --engagement AXIS_ATTACKS --allied heuristic --axis heuristic@$B --swap --trace"
node scripts/ai-match.mjs $common --start 1300200 --style TEMPERATE_INLAND --out <dir>/attack-temperate
node scripts/ai-match.mjs $common --start 1300300 --style EASTERN_EUROPE --out <dir>/attack-eastern
node scripts/ai-fuel-study.mjs <dir>/attack-* --gate heuristic        # 攻方送補 gate
node scripts/ai-logistics-study.mjs <dir>/attack-* --gate heuristic   # 攻方運補 gate
node scripts/ai-supply-study.mjs <dir>/attack-temperate               # and attack-eastern
```

## Expected

All games FINISHED with matching replays; the 攻方送補 gate (SP no front unit can draw ≤ half of v78's) and the 攻方運補 gate
pass; supply audit violations 0.

## Observed

Every batch: 16/16 FINISHED, replay ok, 0 failed. Attacker figures per Movement Segment from Turn 3 (SP measures) or per game.

| Batch | Change | SP no front unit can draw (v78 → v79) | Units unable to fuel a game (v78 → v79) | Attacker VP (v78 → v79) |
|---|---|---|---|---|
| v79a | trucks to stranded units, dry-HQ penalty | 7.4 → 4.7 | — | — |
| v79b | + arriving SP on rail entry hexes | 9.8 → 4.9 | — | — |
| v79c | + HQ railheads, rail after HQs, rail to HQs | 8.7 → 4.8 | 32.6 → 26.1 | 4.0 → 7.4 |
| v79d | + HQs cover different parts of the front | 6.1 → 3.3 | 22.6 → 27.4 | 6.6 → 7.9 |
| v79e | Rail Cap 0.8 | 6.5 → 2.7 | 23.1 → 31.1 | 6.1 → 8.8 |
| v79f | + trucks feed dry HQs, cover halved where dry | 6.5 → 2.6 | 23.1 → 32.5 | 6.1 → 8.8 |

"Units unable to fuel" counts, when the first combat unit acts, units not adjacent to the enemy whose fuel coverage is null and
that have no legal payment; v79a and v79b were measured before that check was fixed (`a04aa87`) and are left out.

v79f, the committed candidate:

- 攻方送補 gate: **PASS**, 2.6 vs 6.5 SP ([v79f-fuel-gate.json](v79f-fuel-gate.json)).
- 攻方運補 gate ([v79f-logistics-gate.json](v79f-logistics-gate.json)): rail 1.00 PASS; garrison stock 0/0 PASS; rear SP left
  after moving 7.4 vs 11.8 **FAIL** (needs ≤ 5.9). Trucks are sized at half the income since `4dd50c9`, so both policies leave SP
  in the rear for lack of lift; v79 leaves less.
- Rail (measured at v79b and v79c only): 10.7 and 10.3 SP railed a turn, against 3.5 at v79a; SP able to entrain 22.7 of 29.4 and
  21.9 of 27.4 SP on the map, against 6.8 of 31.6. At v79c, 100 of 157 attacker HQ observations stood on a rail hex (21 of 147 at v79b).
- Supply audit: preview mismatches, other-unit trace breaks, relocation trace breaks and feed breaks 0 in both groups.
- VP and steps as attacker 8.8 / killed 23.8 / lost 10.6 (v78 6.1 / 21.6 / 13.2); as defender VP 8.1 (v78 5.5).
- Units unable to fuel rose against v78 (32.5 vs 23.1 a game; dry HQs 16% vs 11%): the HQs spread over the front, and the ones
  that stay dry are mostly off the railroad in Move Mode 3–6 hexes from the enemy. Not gated; open.

Saves and traces: the ignored `artifacts/ai-logistics/supply-chain-v79/` of the `ai-truck-shuttle` worktree.
