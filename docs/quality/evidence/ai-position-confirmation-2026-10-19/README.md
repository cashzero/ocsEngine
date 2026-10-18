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

## Results

Not yet run.
