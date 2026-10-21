# Theater potential on new games (plan P11.7)

Boundary: new headless bot-against-bot games of the standard policy and offline analysis of them. No policy change, no
change under `src/`; changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
[P11](../../../roadmap/18-position-metrics-wbs.md); design: [theater supply allocation](../../../ai/theater-supply-plan.md).
The user set the goal to complete P11 (2026-10-21), whose P11.7 step is new Western Europe games, at most 80, after a
power analysis.

## Registration

[registration.json](registration.json) was committed (`161f884`) before any game was played: games, commands, training
data, the single question, its pass rule, the power analysis and script hashes. Only Q2 passed in the
[retrospective comparison](../ai-theater-validation-2026-10-21/README.md), so only Q2 is confirmed here:

- Q2: on rows where the attacker moves, the mover's theater potential predicts the objective VP the attacker gains in
  its player turn better than `objectiveReachColumn` and `payableObjectiveVpInReach` (single-feature linear fits on the
  training rows, scored on the new games). Pass: both MAE gains have map-seed resampled 95% intervals above 0.
- Power: the retrospective MAE gain was about 0.22 with a 95% half-width about 0.10 on 48 games; 80 games give a
  half-width about 0.077, power about 99% at that gain and about 80% at half of it.
- Q1 (final margin), R² and the descriptive values are reported without a pass rule.

## Run

- Games: 80 new Western Europe Axis attacks, heuristic@85 self-play, matches 1900000–1900079, 32×24, six divisions (two
  armored), eight turns, no on-map air, `dist` built from `161f884` (no `src/` change since `cc0c68f`). All 80 finished
  and passed the replay check (985 s, 12 processes). Summary SHA-256 `4d0349ac…`.

```sh
node scripts/ai-match.mjs --matches 80 --start 1900000 --style WESTERN_EUROPE --engagement AXIS_ATTACKS --turns 8 --size 32x24 --divisions 6 --armored 2 --air NONE --air-transport NONE --allied heuristic --axis heuristic --parallel 12 --out artifacts/ai-theater-confirmation/attack-western
```

- Recording: 8 chunks of 10 games with `ai-position-record.mjs --theater` (7 min 36 s): 80 games, 1,280 rows, none
  skipped for a replay hash mismatch; 9 Combat entries not rebuilt (their realized value is null).
  [confirmation-manifest.json](confirmation-manifest.json).
- Training: all P11.6 rows, 147 trajectories ([training-manifest.json](training-manifest.json)); no map seed shared
  with the new games (the script rejects overlap).
- Analysis, as registered, `scripts/ai-theater-validate.py` unchanged (SHA-256 `9853c94e…`):

```sh
python3 scripts/ai-theater-validate.py --development artifacts/ai-theater-record/training-manifest.json --retrospective artifacts/ai-theater-confirmation/confirmation-manifest.json --artifact-root . --out artifacts/ai-theater-confirmation/validation.json
```

- Results: [results.json](results.json).

## Results

Q2, objective VP the attacker gains in its player turn, 640 rows of the new games:

| Predictor | MAE | R² |
|---|---:|---:|
| Mover theater potential | **1.303** | 0.294 |
| `objectiveReachColumn` | 1.512 | 0.167 |
| `payableObjectiveVpInReach` | 1.551 | 0.156 |

Gains of the potential: MAE +0.209 [+0.128, +0.290] over the reach column and +0.248 [+0.173, +0.334] over payable risk;
R² +0.127 [+0.022, +0.210] and +0.138 [+0.067, +0.224]. **Q2 is confirmed.**

Q1, final margin, MAE gain over M2 on the new games (not a registered confirmation): Game Turn 3 M2T +0.01 [−0.37,
+0.37], M2F −0.18 [−0.63, +0.27]; Game Turn 4 M2T +0.22 [+0.01, +0.48], M2F +0.19 [−0.06, +0.47]; Game Turn 5 M2T +0.08
[−0.42, +0.55], M2F +0.16 [−0.34, +0.63]. The Game Turn 4 M2T interval is above 0 here, but Q1 failed in the
retrospective comparison and is only an observation in this run.

Descriptive, attacker rows of the new games (mean potential / realized at Combat entry / objective VP gained):
Game Turn 1 5.87 / 1.45 / 1.30, 2 2.72 / 0.57 / 0.57, 3 2.37 / 0.96 / 0.85, 4 3.21 / 1.59 / 1.25, 5 2.80 / 2.03 / 2.15,
6 2.37 / 1.53 / 1.35, 7 2.07 / 1.47 / 1.61, 8 1.58 / 1.22 / 1.19.

## Conclusions

- Confirmed on games the metric was not developed on: the theater potential predicts the objective VP the attacker
  takes in its own turn better than the existing reach column and payable risk, on MAE and on R².
- It is not established as a final-margin predictor beyond M2.
- The attacker again realizes far less than the potential in Game Turns 1–3 (21–41%) than later.

## Limits

One policy (heuristic@85) self-play, one map size, Western Europe Axis attacks only. A near-term predictor is not
evidence that a policy raising the potential gains VP.
