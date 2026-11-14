# S2.2–S2.4: a defender that cuts the attacker's supply, as far as it can see

Boundary: continuations and rollouts from recorded positions; no new game. The standard policy is unchanged (heuristic@86;
the change is behind the weight `defenderCut`, default 0). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S2 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#3-s2-有條件反攻的守方); TODO `bot-defender-counterattack`. Before it:
[S2.1–S2.2 census](../ai-s2-counterattack-census-2026-11-14/README.md), where retaking objectives showed no room and cutting
supply was left to the user's decision on what the bot may know.

The user (2026-11-14): 「用 bot 看得到的資訊做近似」 — approximate the enemy's trace from what the bot can see.

## The change

- **Rule query `queryTraceCut`** (`src/rules/query/projection.ts`; bot `traceCut`): which enemy combat units the actor sees
  would lose trace supply (12.6) if one of its units stood in a hex, in a given mode. The enemy's trace is computed on the
  map with only the enemy pieces the actor sees (4.9a: the top combat unit of each stack, the hedgehog, the air base and top
  plane), so an enemy HQ hidden in a stack counts as absent; the actor's own pieces are all there.
- **Weight `defenderCut`** (`planCuts` in `src/ai/policies/heuristic.ts`): at its first Movement decision of each step the
  defender of an attack engagement tries up to 30 hexes and sends up to 2 units to cut the trace of at least `defenderCut`
  attacker units it sees. A unit tries a hex when no garrison needs it, it reaches the hex in Combat Mode this step (or can
  pay fuel to), it stays in its own trace there, the hex holds no enemy, enemy stacks stand within 4 hexes, and the hex is no
  more exposed than the move scoring accepts (threat at most its and its stack's strength times `exposureSupport`). Hexes
  near more enemy stacks are tried first, no two adjacent. The unit moves in Combat Mode, pulled as a placed HQ is.
- Tests: `tests/ai/defender-cut.test.ts` on the registered game 2100425, Game Turn 2: the defender sees 23 attacker units in
  trace, 7 of them cut with its unit at 17,11 and none with it where it stands; the plan names that move only with the
  weight; played on, the unit ends the step at 17,11.

Over 1,920 recorded defender turns of 320 games (`defender-cut-plan.mjs` in this folder): a move cutting two or more units is
planned 1.50 times a game against the theater attacker and 1.75 against the standard attacker; half of all moves found cut
one unit only, so the threshold was set at 2 before any continuation. Planning takes 0.56 s at the median and 1.4 s at the
95th percentile (12 processes on the machine).

## S2.3 Continuations (registered)

[registration.json](registration.json), committed in `baa718c` before any continuation: the 239 branch points of
[branches.jsonl](branches.jsonl) (the first defender Movement Segment of Game Turns 2–7 in each recorded game of
2100100–2100479 where the plan cuts two or more units: 94 in Game Turn 2, 71 in 3, 39 in 4, 15 in 5, 10 each in 6 and 7);
variants `none` (this build's default, the heuristic@85 defender) and `cut` ([cut-weights.json](cut-weights.json),
`defenderCut` 2) for the defender, frozen heuristic@86 attacking; 2 dice seeds each; Node v26.9.0.

```sh
node scripts/ai-continue.mjs --save <save> --at <at> --subject <subject> --variant none=heuristic \
  --variant cut=heuristic:docs/quality/evidence/ai-s2-defender-cut-2026-11-14/cut-weights.json \
  --opponent heuristic@artifacts/ai-promotion/frozen-v86/dist --dice 2 --horizons 1 --out branch-<i>.jsonl   # 12 at a time
python3 scripts/ai-continue-compare.py branch-*.jsonl --baseline none --out compare.json
```

All 956 continuations finished the game. `cut` − `none` for the defender, dice averaged per branch, mean ± SE over the 239
branch points:

| Registered measure (end of the game) | Difference | mean − 2.1 SE | Threshold | Result |
|---|---|---:|---:|---|
| Attacker combat units out of trace (primary) | +1.57 ± 0.42 | +0.69 | > 0 | pass |
| Defender Kill − Loss (steps) | +3.66 ± 0.77 | +2.03 | > −1.5 | pass |
| VP margin (defender − attacker) | +0.85 ± 0.46 | −0.13 | > −1.5 | pass |

Reported: at the start of the next Game Turn the attacker has 4.13 ± 0.48 more units out of trace, and the defender has lost
0.10 ± 0.05 more steps and killed 0.30 ± 0.10 more. At the end the defender has killed 3.05 ± 0.52 more attacker steps and
lost 0.60 ± 0.40 fewer; the attacker has 2.21 ± 0.39 fewer units and 0.42 ± 0.23 fewer VP; the defender's own units out
of trace do not change (+0.07 ± 0.22).

## S2.4 The theater attacker against this defender

Rollouts of Game Turns 1–6 (`ai-theater-rollout.mjs --starts 1 --through 6`, now with `--defender-weights`) from the 80
development maps of S1 (the even-numbered games of 2100400–2100479 and 2100100–2100179): heuristic@86 or heuristic@85
(`theaterAllocation` 0) attacking, the defender with [cut-weights.json](cut-weights.json). All 160 rollouts reached the end
of the attacker's sixth player turn.

| Per map, heuristic@86 − heuristic@85 attacking | Against the cutting defender | Against the standard defender (earlier records) |
|---|---|---|
| Objective points over six attacker turns | +3.13 [+1.95, +4.30] (80 maps; 52 up, 12 down) | +2.80 [+1.23, +4.37] (2100400), +3.02 [+1.27, +4.78] (2100100) |
| Defender steps lost | +4.94 [+2.69, +7.18] | — |
| Attacker steps lost | +0.11 [−2.21, +2.43] | — |

Against the cutting defender, heuristic@86 loses 10.80 steps (2100400 set) where it lost 9.13 against the standard
defender, and heuristic@85 10.68 where it lost 8.20; heuristic@86's objective points are the same (8.45 against 8.47). The
theater attacker's units beyond trace do not make it the easier victim: its gain stands.

## What this shows

- Cutting the attacker's supply with units no garrison needs, judged on what the defender sees, works: the cut units starve
  (attrition), the defender loses no more, and the VP margin moves its way.
- heuristic@79's counterattacks also cut supply but cost the defender 2.5 steps a game (E1): what made them bad was
  attacking, not threatening the attacker's supply.
- heuristic@86's gain as the attacker holds against a defender that cuts supply.

## Limits

- Continuations from recorded positions against one attacker (frozen heuristic@86), Western Europe attack games only.
- The first qualifying segment of each game only; later segments are played by the variant but not branched on.
- Planning adds up to about a second to the defender's first decision of a step (`computer-main-thread`).
- What the defender sees: an attacker HQ hidden in a stack is treated as absent, so the plan may expect cuts that do not
  happen; the continuations measure what does.

## Raw data

The ignored `artifacts/ai-s2/` of the `ai-truck-shuttle` worktree (`cut-plan/`, `continue/run/`, `s24/`).
