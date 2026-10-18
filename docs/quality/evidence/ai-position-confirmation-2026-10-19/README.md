# Position metrics: prospective confirmation (plan P7)

Boundary: new headless bot-against-bot games and offline analysis of them. No policy change; changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [18-position-metrics-wbs](../../../roadmap/18-position-metrics-wbs.md).
The user approved new games for this confirmation, with the count registered beforehand (2026-10-19).

## Registration

Committed before any confirmation game was played: [registration.json](registration.json) holds the games, commands,
policy, training data, script SHA-256 and the hypotheses with their subsets and pass rule.

- Games: 160 new games of the standard heuristic@85 against itself, map 32×24, six divisions (two armored), eight
  turns, no on-map air, match numbers 1500000–1500347 (never used before): Axis attacks 48 temperate and 48 eastern,
  meetings 32 temperate and 32 eastern. No `--swap`: with one policy on both sides it would repeat each game.
- Training: the 255 trajectories of the [P5 record](../ai-position-metrics-p5-2026-10-19/manifest.json), which chose the
  metrics. Models are fitted on them only and scored on the new games; the scripts reject any map seed in both.
- Hypotheses (the results P2, P5 and P6 passed, each in the subsets where it passed):

| Id | Outcome ~ metric (baseline) | Subsets | Measure |
|---|---|---|---|
| H1 | Objective VP lost ~ `objectiveVpAtRisk` (`objectivesThreatened`) | attacker moving, defender moving, meeting | R² |
| H2 | Objective VP lost ~ `payableObjectiveVpAtRisk` (`objectiveVpAtRisk`) | attacker moving | R² or fixed-bucket MAE |
| H3a | Mover objectives gained ~ `mover.objectiveReachColumn` (`mover.contact`) | all three | R² |
| H3b | Mover objectives gained ~ `mover.objectiveReachColumn` (`mover.bestObjectiveEffectiveColumn`) | attacker moving, meeting | R² |
| H4 | Combat steps lost ~ `stacksExposedAllocated` (`contact`) | attacker moving, meeting | R² or MAE |
| H5 | Trace-loss rise ~ `supplyCuttable` (`contact`) | attacker moving, meeting | R² |
| H6 | HQs lost ~ `hqsInReach` (`contact`) | all three | R² |
| H7a, H7b | Trace-loss rise, HQs lost ~ `rearHexesInReach` (`contact`) | attacker moving | R² |
| H8a | Final margin: steps and out of trace over VP | Axis attacks, Game Turns 2–5 | R² |
| H8b | Final margin: objective reach and risk over steps and out of trace | Axis attacks, Game Turns 3–7 | MAE |

- Pass rule: on the new games, the 95% map-seed cluster interval of the listed gain is above 0. Every hypothesis and
  subset is reported, passed or not, and no test is added after the games are seen.

## Run

Commands exactly as registered, scripts of `e73b9ad`, dist built from src as of `eee03e2`. All 160 games finished and
passed the replay check (attacks 48 temperate in 721 s and 48 eastern in 594 s, meetings 32 temperate in 234 s and 32
eastern in 217 s, 12 processes). Recording: 160 games, 2,080 rows, 0 skipped. The evaluation used 255 training
trajectories (96 map seeds) and 160 test games on 160 new map seeds. Row files, game summaries and output hashes:
[manifest.json](manifest.json). Verdicts by `scripts/ai-position-confirm.py`: [verdicts.json](verdicts.json).

```sh
python3 scripts/ai-position-confirm.py docs/quality/evidence/ai-position-confirmation-2026-10-19/registration.json artifacts/ai-position-confirmation/validation.json artifacts/ai-position-confirmation/final.json
```

## Results

Near-term hypotheses, out-of-sample R² gain on the new games [95%]:

| Id | Attacker moving | Defender moving | Meeting |
|---|---|---|---|
| H1 objective VP risk | **+0.173 [0.107, 0.238]** | +0.136 [−0.026, 0.249] | **+0.166 [0.082, 0.235]** |
| H2 payable over plain risk | **+0.073 [0.029, 0.115]**, fixed-bucket MAE | | |
| H3a reach column over contact | **+0.253 [0.215, 0.297]** | +0.124 [−0.033, 0.175] | **+0.226 [0.200, 0.253]** |
| H3b reach column over 2-hex effective column | **+0.039 [0.016, 0.063]** | | **+0.035 [0.020, 0.051]** |
| H4 allocated exposure | **+0.092 [0.031, 0.144]**, MAE | | **+0.065 [0.013, 0.112]**, quintile MAE |
| H5 supply cuttable | +0.056 [−0.028, 0.121] | | −0.010 [−0.077, 0.049] |
| H6 HQs in reach | **+0.119 [0.003, 0.202]** | **+0.035 [0.025, 0.043]** | **+0.046 [0.025, 0.066]** |
| H7a rear hexes, trace losses | **+0.071 [0.025, 0.109]** | | |
| H7b rear hexes, HQs lost | +0.018 [−0.048, 0.075] | | |

Bold passes. H5 attacker moving beats the baselines on fixed-bucket MAE, but its registered measure is R² only.

Final margin in Axis attacks (96 games), out-of-sample R² of M0, M1, M2 by Game Turn 2–7: M0 −0.043, −0.023, 0.046,
0.300, 0.539, 0.769; M1 −0.109, 0.107, 0.251, 0.406, 0.583, 0.782; M2 −0.028, 0.274, 0.459, 0.593, 0.652, 0.826.

| Id | Game Turn 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| H8a steps and out of trace over VP (R²) | −0.066 [−0.216, 0.054] | +0.130 [−0.019, 0.268] | **+0.205 [0.092, 0.315]** | **+0.106 [0.003, 0.217]** | | |
| H8b objective reach and risk over M1 (MAE, VP) | | **1.02 [0.22, 1.77]** | **1.34 [0.54, 2.21]** | **0.94 [0.25, 1.62]** | **0.56 [0.01, 1.14]** | **0.55 [0.23, 0.82]** |

20 of 27 registered cells pass.

## Conclusions

- Confirmed on new games of a policy the metrics were not chosen on: objective VP at risk (attacker moving, meetings),
  the payable variant over it when the attacker moves, the reach-based objective column and its gain over the 2-hex
  effective column (attacker moving, meetings), allocated exposure (attacker moving, meetings), HQs in reach (all
  roles), rear hexes in reach for trace losses (attacker moving).
- In Axis attacks, objective reach and risk predict the final margin beyond VP, steps and out of trace at every Game
  Turn 3–7, by 0.55–1.34 VP of typical error; steps and out of trace beat VP alone at Game Turns 4–5.
- Not confirmed: supply cuttable for trace losses, rear hexes for HQ losses, and the objective metrics when the defender
  moves (point gains positive, intervals include 0; in the P2 data the defender's turns took little objective VP, a mean
  of 0.06 against 0.96 when the attacker moved).

## Limits

One policy (heuristic@85 self-play) and one map size; the rows are near-term predictions, not evidence that a policy
raising these metrics gains VP. Each cell is judged on its own; with 27 cells, a marginal pass (H6 attacker moving,
H8b Game Turn 6) is weaker than the others.
