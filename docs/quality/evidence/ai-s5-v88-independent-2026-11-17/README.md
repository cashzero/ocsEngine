# S5.3: heuristic@88, independent batch

Boundary: the promotion process of [AI evaluation](../../../ai/evaluation.md), independent batch. The standard is
unchanged (heuristic@86). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan:
S5.3 (section 7.5) of the [AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md).
Candidate, development batch and registration: [heuristic@88](../ai-s5-v88-2026-11-16/README.md).

## Result

**Not promoted: the measures pass, a correctness condition does not; the decision is the user's.** `verify.py` stops at
the ordinary supply audit, so no acceptance.json exists. The measures below were computed from the batch's summaries
with `verify.py`'s definitions.

| 80 attack pairs (160 games), heuristic@88 − heuristic@86 a pair | Mean | SE | mean − 2.1 SE | Registered condition | |
|---|---:|---:|---:|---|---|
| **VP (primary)** | **+2.04** | 0.45 | **+1.10** | > 0, and positive in the changed engagement | met |
| Kill − Loss | +3.09 | 0.87 | +1.27 | > −1.5 | met |
| Supply | +0.16 | 0.26 | −0.39 | > −0.5 | met |

By map style, VP a pair: Western Europe +2.65 (SD 3.8, 40 pairs), Eastern Europe +1.43 (SD 4.1, 40 pairs). No pair ends
in the same state. The continuations had predicted +1.53 ± 0.32.

| Correctness and gates | |
|---|---|
| All 160 games finished Game Turn 8, no rejected action, replay hashes equal | met |
| Advance audit: no preview violation; unfunded advances of the candidate only in Game Turn 8 (5, all Combat) | met |
| **Ordinary supply audit: no trace or ration broken** | **not met: 16 moves** |
| Attacker supply gate, logistics: rail 100%, rear SP no front unit can draw 3.3 against 3.9, garrison stock 0 | pass |
| Attacker supply gate, fuel: SP no front unit can draw 3.6 against 4.1 | pass |
| `verify.py --delivered` | not run (the frozen-only run stops first) |

## The supply audit

All 16 are the same case: in an Exploitation Phase the attacker moves a unit toward its theater group's assault target,
the unit loses trace, and it has neither trace nor SP to eat when the Movement Segment ends (the case the user's rule of
2026-11-15 still counts). No other unit lost trace or rations, and no preview mismatched.

- **heuristic@86 makes them too**: 6 in the 80 games it attacked, against 10 in the 80 games heuristic@88 attacked.
- 12 of the 16 are six seed pairs where both policies make the identical move at the same action of Game Turn 1 (the
  attacker moves first; the candidate's changes have not acted yet). The other 4 are heuristic@88's alone (Game Turns 1,
  1, 3 and 7).
- The last batch (80 games, 40 of them attack) and both development batches had none, so the standard's fault was not
  seen before.

So the standard policy itself does not meet this condition on these seeds. It is recorded as TODO
`bot-exploitation-untraced-move`.

## Method

Registered in `94e3f00` ([registration.json](../ai-s5-v88-2026-11-16/registration.json)): VP primary, margins Kill − Loss
1.5 and Supply 0.5, Western Europe attack 2800200–2800279, Eastern Europe attack 2800300–2800379, 160 games by the
user's exception. Run 2026-11-17 06:49 to 09:02, Node v26.9.0.

```sh
P=artifacts/ai-promotion
python3 scripts/ai-promotion/batch.py $P/frozen-v88-freeze.json $P/frozen-v86-freeze.json independent
# heuristic@86 self-play on the same seeds, through the candidate's engine (inside $P/frozen-v88), 80 + 80 games:
node scripts/ai-match.mjs --matches 80 --start 2800200 --parallel 5 --turns 8 --size 32x24 --divisions 6 --armored 2 \
  --air NONE --air-transport NONE --style WESTERN_EUROPE --engagement AXIS_ATTACKS \
  --allied heuristic@../frozen-v86/dist --axis heuristic@../frozen-v86/dist --swap --out <self-play attack-western>
python3 scripts/ai-promotion/verify.py $P/frozen-v88-freeze.json $P/frozen-v86-freeze.json independent   # stops, exit 1
node scripts/ai-logistics-study.mjs <batch attack-western> <batch attack-eastern> --gate heuristic --baseline <self-play …>
node scripts/ai-fuel-study.mjs <same arguments>
```

Gate outputs: [logistics-gate.log](logistics-gate.log), [fuel-gate.log](fuel-gate.log).

## Limits

- The batch is judged once. It is not extended, and the same candidate is not rerun on other seeds.
- The self-play has no traces, so the supply audit could not be run on it; heuristic@86's count is from the batch's own
  games where it attacks (against the candidate's defender).

## Raw data

`artifacts/ai-promotion/frozen-v88-independent/`, `frozen-v88-v86selfplay-independent/`,
`frozen-v88-independent-gates/`, `frozen-v88-independent-verify.log` and `frozen-v88-independent-run.log` of the
`ai-truck-shuttle` worktree.
