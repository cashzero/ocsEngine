# S4.7: why heuristic@87's VP did not improve

Boundary: replays and continuations of recorded games; no new game. The standard is unchanged (heuristic@86). This
record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: [S4.7 of the AI strategy
improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#5-s4-獨立批與基準重測). The user (2026-11-15):
「繼續研究為何vp未改善」. The independent batch: [S4 independent batch](../ai-s4-v87-independent-2026-11-15/README.md).

## Findings

1. **The VP gain is real only in attack engagements, and it comes from the defender.** Independent batch, VP per pair:
   attack +2.25 ± 0.82 (20 pairs, t 2.7); meeting −0.80 ± 1.37 (20 pairs, SD 6.1), which cannot be told from 0. Against
   heuristic@86's self-play on the same attack seeds (`ai-role-margin.mjs`), the candidate changes the attacker's VP
   margin by +0.90 ± 1.63 a game when it attacks and by +3.60 ± 1.03 when it defends.
2. **None of the four parts is shown to change VP on its own.** With 28–76 branch points the continuations could not
   separate them (below). The registered power analysis assumed a per-branch SD of about 2.5 VP (E5's continuations); a
   whole game from Game Turn 2 has 5.3–6.6, so the SEs are 2.5 times the planned ones.
3. **The parts buy kills and supply, not objectives.** Objectives decide VP (per-branch correlation of the objective
   and VP differences 0.90–0.94). The parts move fighting and supply measures clearly, but objectives barely move:
   - `defenderCut`: Kill − Loss +3.07 ± 1.28 (t 2.4), VP −0.18 ± 0.58, objectives +0.11 ± 0.19.
   - `approachAttack` (meeting): Kill − Loss +1.77 ± 1.26, contact +0.28 at the next Game Turn (t 2.5), enemy objectives
     threatened at the end +0.20 (t 3.0), objectives −0.03 ± 0.24. As the attacker it spends 5.1 SP more (t 3.3) on
     1.0 more attack, objectives +0.21 ± 0.18.
   - `arrivalRailForward` and `hqBridge`: stranded SP −1.4 to −1.8 (not established), objectives ±0.04–0.07.
4. **Exploratory, not registered: two parts trade objectives for kills.** In heuristic@86's continuations one step of
   Kill − Loss margin goes with 0.39–0.46 VP. Measured against that rate, the VP change minus what the part's Kill − Loss
   change would buy is −1.26 ± 0.53 for `approachAttack` in meeting engagements and −1.37 ± 0.54 for `defenderCut`;
   the other parts are within ±1 SE of 0. This uses a cross-game rate on within-branch differences and was chosen after
   seeing the data; it needs its own registered test.

## Continuations

[registration.json](registration.json), committed in `69376d0` before any continuation. Branch points: the first own
Movement Segment of Game Turn 2 of the subject ([branches-meeting.jsonl](branches-meeting.jsonl) 76,
[branches-attacker.jsonl](branches-attacker.jsonl) 28, [branches-defender.jsonl](branches-defender.jsonl) 28). Variants:
this build's heuristic@86 and the weight files in this folder; opponent frozen heuristic@86; 2 dice; build `69376d0`,
Node v26.9.0. All 1,168 continuations finished Game Turn 8 (12:46–15:06).

```sh
node scripts/ai-continue.mjs --save <save> --at <at> --subject <side> --variant v86=heuristic \
  --variant approach=heuristic:docs/quality/evidence/ai-s4-vp-diagnosis-2026-11-15/approach-weights.json ... \
  --opponent heuristic@artifacts/ai-promotion/frozen-v86/dist --dice 2 --horizons 1 --out <branch>.jsonl
python3 scripts/ai-continue-compare.py artifacts/ai-vp-why/cont/<group>/*.jsonl --baseline v86
```

| Variant − heuristic@86, subject, end of the game | VP margin | Registered reading | Objectives margin | Kill − Loss |
|---|---|---|---|---|
| Meeting: `approachAttack` | −0.43 ± 0.74 | not established | −0.03 ± 0.24 | +1.77 ± 1.26 |
| Meeting: `arrivalRailForward` | +0.03 ± 0.15 | not established | +0.04 ± 0.07 | +0.38 ± 0.40 |
| Meeting: both (heuristic@87) | −0.51 ± 0.76 | not established | −0.01 ± 0.25 | +1.83 ± 1.25 |
| Attacker: `approachAttack` | +1.11 ± 1.05 | not established | +0.43 ± 0.37 | +0.89 ± 2.01 |
| Attacker: `arrivalRailForward` | −0.11 ± 0.08 | not established | −0.07 ± 0.05 | −0.07 ± 0.52 |
| Attacker: `hqBridge` | +0.18 ± 0.40 | not established | +0.07 ± 0.16 | +0.84 ± 1.03 |
| Attacker: all four | +1.21 ± 1.00 | not established | +0.39 ± 0.36 | −0.39 ± 1.47 |
| Defender: `defenderCut` | −0.18 ± 0.58 | not established | +0.11 ± 0.19 | +3.07 ± 1.28 |
| Defender: `approachAttack` | +1.25 ± 1.01 | not established | +0.71 ± 0.45 | +0.79 ± 2.13 |
| Defender: `arrivalRailForward` | +0.57 ± 0.26 | raises (lower end +0.03) | +0.21 ± 0.09 | +1.36 ± 1.05 |
| Defender: all four | +1.82 ± 1.04 | not established | +0.89 ± 0.44 | +3.66 ± 2.01 |

Each group's table reports about 60 measures; at t ≈ 2 some are chance. The defender's `arrivalRailForward` row clears
the registered reading by 0.03 among eleven readings and is not treated as a finding.

## Objective flow of the independent batch

`ai-objective-flow-study.mjs` (run inside `artifacts/ai-promotion/frozen-v87r`), a game:

| Side | Objective VP held at the end | Gained | Lost | Attacks on objectives | Defenders stayed | Taken |
|---|---:|---:|---:|---:|---:|---:|
| Meeting, heuristic@87 | 12.4 | 3.85 | 4.25 | 4.63 | 3.30 | 0.85 |
| Meeting, heuristic@86 | 13.2 | 4.25 | 3.85 | 4.25 | 2.73 | 0.93 |
| Attacker heuristic@86 against heuristic@86 (self-play) | 8.1 | 8.65 | 0.55 | 4.55 | 1.35 | 2.60 |
| Attacker heuristic@87 against heuristic@86 | 8.6 | 9.15 | 0.60 | 4.45 | 1.50 | 2.05 |
| Attacker heuristic@86 against defender heuristic@87 | 6.3 | 7.70 | 1.40 | 4.05 | 1.40 | 1.75 |

The self-play's seat-exchanged games are identical (20 of 20 pairs), so its 40 games stand for one game a map.

## Tool changes

- `ai-role-margin.mjs`: a frozen build named by a relative or an absolute path is one opponent. Before, every game of
  the batch counted as the candidate attacking, because the self-play named heuristic@86 `heuristic@../frozen-v86/dist`.
- `ai-find-branches.mjs`: kind `first-movement`, a side's own Movement Segment in any engagement.

## Limits

- 28 attack branches a role, 76 meeting branches; one dice pair each.
- Finding 4 is post hoc.
- Branches start at Game Turn 2: Game Turn 1 effects (first moves, first arrivals) are not in the continuations.

## Raw data

`artifacts/ai-vp-why/` of the `ai-truck-shuttle` worktree (`cont/<group>/` continuations and compare reports,
`flow-*` objective flows).
