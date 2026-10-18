# Extended position metrics and combat/attrition loss split on Temperate Inland matches

Boundary: headless bot-against-bot matches (`heuristic@85` self-play) and offline replay analysis on `TEMPERATE_INLAND`. No policy change; changes no row of `docs/quality/03-product-operation-verification-plan.md`. The metric definitions and conclusions are in [policy-errors](../../../ai/policy-errors.md#局勢指標).

## Question

Following the initial position-metrics analysis ([ai-position-analysis-2026-10-18](../ai-position-analysis-2026-10-18/README.md)), seven metric extensions and a combat-versus-attrition step-loss split were added to address the observed measurement blind spots on `TEMPERATE_INLAND` (excluding `EASTERN_EUROPE` by user scope):

1. Does filtering geometric objective reach (`objectivesAtRisk`, `objectiveVpAtRisk`) by combat-supply affordability (`payableObjectivesAtRisk`, `payableObjectiveVpAtRisk`, backed by `surplusCombatSp`) improve same-turn objective-loss prediction?
2. Does 1-to-1 unit-to-target assignment (`stacksExposedAllocated`, `stepsExposedAllocated`) and 2d6 CRT expected step loss (`maxSingleStackExpectedLoss`) reduce upper-bound saturation and predict same-turn combat step losses (`combatStepsLost`) once Supply Phase attrition (`attritionStepsLost`) is separated?
3. Does recording captured and blown dump SP (`spCapturedOrDestroyed`) provide a clean outcome for `dumpSpInReach`?
4. What are the 2-hex effective CRT columns (`bestObjectiveEffectiveColumn`) and local force ratios (`localForceRatioAt2Hex`) against unheld objectives after terrain and hedgehog modifiers?

## Inputs and commands

- Base commit: `c7b8602` with updated `scripts/ai-position-metrics.mjs`, `scripts/ai-position-record.mjs`, `scripts/ai-position-analysis.py`, `scripts/ai-vp-metrics-extract.mjs`, and `scripts/ai-vp-metrics-compare.py`.
- Matches generated (16 games, 32×24, 6 divisions with 2 armored, 8 turns, `--air NONE --air-transport NONE`, `TEMPERATE_INLAND`, `heuristic` vs `heuristic`):
  - `artifacts/ai-positions-run/meeting-temperate`: 8 `MEETING` games, seeds `1300000`–`1300007` (`--swap`). All 8 finished, 0 errors, replay hash matched.
  - `artifacts/ai-positions-run/attack-temperate`: 8 `AXIS_ATTACKS` games, seeds `1300200`–`1300207` (`--swap`). All 8 finished, 0 errors, replay hash matched.

```sh
node scripts/ai-match.mjs --games 8 --seed 1300000 --swap --theme TEMPERATE_INLAND --engagement MEETING --width 32 --height 24 --divisions 6 --armored 2 --turns 8 --air NONE --air-transport NONE --save-dir artifacts/ai-positions-run/meeting-temperate
node scripts/ai-match.mjs --games 8 --seed 1300200 --swap --theme TEMPERATE_INLAND --engagement AXIS_ATTACKS --width 32 --height 24 --divisions 6 --armored 2 --turns 8 --air NONE --air-transport NONE --save-dir artifacts/ai-positions-run/attack-temperate
node scripts/ai-position-record.mjs artifacts/ai-positions-run/meeting-temperate artifacts/ai-positions-run/attack-temperate --out artifacts/ai-positions-run/positions-temperate.jsonl
python scripts/ai-position-analysis.py artifacts/ai-positions-run/positions-temperate.jsonl --out artifacts/ai-positions-run/analysis-temperate.json
```

Outputs:
- `artifacts/ai-positions-run/positions-temperate.jsonl` (581,949 bytes, SHA-256 `5b683db14c3dd7acf7271c1975d2fb31690409ae1d46d53b2f85836f159804b5`): 16 games, 256 player-turn rows, 0 skipped.
- [analysis-temperate.json](analysis-temperate.json) (87,538 bytes, SHA-256 `dd978332cd1900dd448ecfa2add8bd78c03ab66288c048453e13d3165ba99ce1`).

## Observed

### 1. Same player turn (`n = 208` player turns from Game Turn 2 across 16 games)

| Subset | Outcome ~ metric | r (baseline r) | R² added [95% CI] | Bucket means (any-loss rate) | Share of loss at metric > 0 |
|---|---|---|---|---|---|
| all (`n = 208`) | objectives O lost ~ `objectivesAtRisk` | 0.34 (0.02) | 0.123 [0.043, 0.217] | 0: 0.00 (0%, n 69); 1: 0.17 (17%); 2–3: 0.35 (27%); 4–7: 0.37 (26%); 8+: 1.50 (100%) | 100% |
| all (`n = 208`) | objectives O lost ~ `payableObjectivesAtRisk` | **0.44** (0.02) | **0.201 [0.093, 0.296]** | 0: 0.00 (0%, n 72); 1: 0.18 (16%); 2–3: 0.37 (30%); 4–7: 1.00 (50%) | 100% |
| all (`n = 208`) | objective VP O lost ~ `objectiveVpAtRisk` | 0.34 (0.04) | 0.114 [0.043, 0.193] | 0: 0.00 (0%); 2–3: 0.23 (10%); 4–7: 1.02 (30%); 8+: 1.18 (27%) | 100% |
| all (`n = 208`) | objective VP O lost ~ `payableObjectiveVpAtRisk` | **0.41** (0.04) | **0.169 [0.074, 0.259]** | 0: 0.00 (0%); 2–3: 0.23 (10%); 4–7: 0.89 (27%); 8+: **2.05 (41%)** | 100% |
| all (`n = 208`) | total steps O lost ~ `stepsExposed` | 0.04 (0.00) | 0.002 [0.000, 0.031] | 0: 1.40 (60%, n 5); 4–7: 1.23; 8+: 1.29 (n 143) | 97% |
| all (`n = 208`) | total steps O lost ~ `stacksExposedAllocated` | 0.20 (0.05) | 0.050 [0.008, 0.120] | 0: 1.40 (n 5); 2–3: 1.09 (n 65); 4–7: 1.33 (n 123); 8+: 2.00 (n 6) | 97% |
| all (`n = 208`) | `combatStepsLost` ~ `stepsExposed` | 0.10 (−0.01) | 0.012 [0.000, 0.051] | 0: 0.40; 4–7: 0.82; 8+: 1.20 | 99% |
| all (`n = 208`) | `combatStepsLost` ~ `stepsExposedAllocated` | **0.23** (−0.01) | **0.057 [0.007, 0.138]** | 0: 0.40; 1: 0.20; 2–3: 0.64; 4–7: 0.77; 8+: 1.36 | 99% |
| all (`n = 208`) | `combatStepsLost` ~ `stacksExposed` | 0.10 (−0.01) | 0.011 [0.000, 0.051] | 0: 0.40; 2–3: 0.52; 4–7: 1.09; 8+: 1.29 (n 66) | 99% |
| all (`n = 208`) | `combatStepsLost` ~ `stacksExposedAllocated` | **0.25** (−0.01) | **0.064 [0.004, 0.163]** | 0: 0.40; 1: 0.56; 2–3: 0.74; 4–7: 1.25; 8+: 1.33 (n 6) | 99% |
| all (`n = 208`) | `combatStepsLost` ~ `maxSingleStackExpectedLoss` | **0.20** (−0.01) | **0.041 [0.000, 0.156]** | 1: 0.94 (52%); 2–3: 1.02 (49%); 4–7: 5.50 (100%) | 100% |
| all (`n = 208`) | `attritionStepsLost` ~ `outOfTrace` | **0.31** (0.02) | **0.093 [0.021, 0.220]** | 0: 0.00 (0%, n 113); 1: 0.00 (0%, n 19); 2–3: 0.16; 4–7: 0.48; 8+: 1.14 | 100% |
| all (`n = 208`) | `spCapturedOrDestroyed` ~ `dumpSpInReach` | 0.09 (−0.02) | 0.009 [0.000, 0.059] | 0: 0.00 (0%, n 11); 1: 0.00 (0%, n 4); 2–3: 0.20; 4–7: 0.38; 8+: 0.70 | 100% |
| attacker phasing (`n = 56`) | objectives O lost ~ `payableObjectivesAtRisk` (vs raw) | **0.34** (vs 0.27) | **0.110 [0.009, 0.281]** (vs 0.074) | 0: 0.00 (0%); 1: 0.17; 2–3: 0.32 | 100% |
| attacker phasing (`n = 56`) | `combatStepsLost` ~ `stacksExposedAllocated` | **0.30** (0.05) | **0.090 [0.000, 0.377]** | 0: 0.00 (0%); 2–3: 0.94; 4–7: 2.06; 8+: 1.50 | 100% |
| attacker phasing (`n = 56`) | `attritionStepsLost` ~ `outOfTrace` | **0.47** (−0.03) | **0.224 [0.008, 0.522]** | 0: 0.00 (0%, n 29); 1: 0.00 (0%, n 5); 8+: 1.38 | 100% |
| meeting (`n = 104`) | objectives O lost ~ `payableObjectivesAtRisk` (vs raw) | **0.44** (vs 0.31) | **0.225 [0.072, 0.344]** (vs 0.139) | 0: 0.00 (0%); 1: 0.20; 2–3: 0.38; 4–7: 1.00 | 100% |
| meeting (`n = 104`) | `combatStepsLost` ~ `stepsExposedAllocated` (vs raw) | **0.34** (vs 0.21) | **0.109 [0.001, 0.268]** (vs 0.046) | 0: 0.67; 1: 0.33; 2–3: 0.45; 4–7: 0.70; 8+: 1.23 | 98% |
| meeting (`n = 104`) | `combatStepsLost` ~ `stacksExposedAllocated` (vs raw) | **0.28** (vs 0.13) | **0.076 [0.001, 0.244]** (vs 0.020) | 8+ stacks reduced from 18 turns to 1 turn | 98% |
| meeting (`n = 104`) | `combatStepsLost` ~ `maxSingleStackExpectedLoss` | **0.37** (−0.10) | **0.134 [0.000, 0.292]** | 1: 0.57 (47%); 2–3: 0.89 (51%); 4–7: 5.50 (100%) | 100% |
| meeting (`n = 104`) | `spCapturedOrDestroyed` ~ `dumpSpInReach` | **0.27** (−0.20) | **0.067 [0.001, 0.232]** | 0: 0.00 (0%, n 8); 1: 0.00 (0%, n 1); 2–3: 0.15; 4–7: 0.25; 8+: 0.56 | 100% |

### 2. Why `stepsLost` previously mixed in O's Supply Phase attrition

When phasing player `P` passes `CLEAN_UP` at the end of `P`'s turn, `advanceSequence` enters `O`'s turn and, whenever `O` has no optional actions in `AIRCRAFT_REFIT`, `REINFORCEMENT`, or `SUPPLY`, immediately leaves `O`'s `SUPPLY` phase (`determineSupply`) inside that same `applyAction` call—before `state.sequence.playerTurnIndex` is observed at the start of the next action. Thus single-unit-hex attrition losses of `O` were recorded in `P`'s turn row (`row.turn[O].stepsLost`). In `defender phasing`, `O` (the attacker) lost 5.00 steps at `stepsExposed = 0` entirely from Supply Phase attrition; after separating `combatStepsLost` and `attritionStepsLost`, `combatStepsLost` at `stepsExposed = 0` or `1` in `defender phasing` is `0.00` (100% of `combatStepsLost` occur when exposure > 0).

### 3. Position combat-readiness summary by role (`n = 208` turns from Game Turn 2)

| Engagement & Phasing Side | Turns | Mean `surplusCombatSp` (`= 0` share) | Mean `bestObjectiveEffectiveColumn` (`>= 9` share) | Mean `localForceRatioAt2Hex` | Mean `objectivesInReach` → `payableObjectivesInReach` |
|---|---:|---|---|---|---|
| `AXIS_ATTACKS` — Axis (attacker) | 58 | 13.49 SP (3%) | 4.66 (19%) | 4.33 | 1.95 → 1.53 |
| `AXIS_ATTACKS` — Allied (defender) | 54 | 6.23 SP (11%) | 1.76 (4%) | 2.28 | 0.24 → 0.24 |
| `MEETING` — Axis | 60 | 4.60 SP (20%) | 4.08 (10%) | 2.62 | 1.65 → 1.20 |
| `MEETING` — Allied | 52 | 7.18 SP (4%) | 4.69 (19%) | 2.85 | 2.92 → 1.71 |
