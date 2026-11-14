# S2.1–S2.2: is there room for a defender that counterattacks only with an advantage?

Boundary: replays of recorded games and planning on recorded positions; no game, rollout or continuation is played. The
standard policy is unchanged (heuristic@86). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S2 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#3-s2-有條件反攻的守方); TODO `bot-defender-counterattack`. The user asked
to complete S2 (2026-11-14: 「完成S2」), after S1's remaining gap was left as the exception it was.

Why: heuristic@79's defender sent groups against objectives the attacker held whatever the odds, and lost 2.5 ± 0.7 steps
a game for it ([E1](../ai-defender-assault-continuation-2026-10-18/README.md)); heuristic@85 forms none. The plan asks
whether a defender that attacks only with an advantage (retaking an objective with good odds, cutting the attacker's
supply, or striking an exposed stack) has room to act, before building and testing it.

## S2.1 Opportunities in the position records

The registered batch's position records (`artifacts/ai-theater-untraced-games/rows`, `ai-position-record.mjs`, metrics in
[局勢指標](../../../ai/policy-errors.md#局勢指標)), at the start of each defender player turn of Game Turns 2–8, 40 games with
the theater attacker and 40 with heuristic@85 attacking (280 defender turns each):

| Opportunity (metric) | Theater attacker | heuristic@85 attacker | Difference per turn, per map |
|---|---|---|---|
| Retake: attacker-held objectives the defender reaches at column 6+ or walks into (`objectivesInReach`) | 0.32 a turn, 2.2 a game (7.3 VP) | 0.13, 0.9 (3.2 VP) | +0.19 [+0.06, +0.31] |
| Cut: attacker units in trace that one defender move would cut off (`supplyCuttable` of the attacker) | 15.0 a turn | 18.2 | −3.2 [−5.5, −0.9] |
| Strike: attacker stacks the defender can attack at column 9+, one attack per unit (`stacksExposedAllocated`) | 4.1 a turn | 4.4 | −0.35 [−0.88, +0.17] |

98% of defender turns have at least one; by these metrics there is room. The theater attacker gives the defender twice as
many objectives to retake.

## S2.2 Each condition, measured before building more

**Retake: almost never with an advantage.** The defender was given the theater allocation's planning
([defender-counter.patch](defender-counter.patch), weight `defenderCounter`): at its first Movement decision it forms
groups only against attacker-held objectives with attacker combat units, reachable and supplied this step, with units no
garrison needs (`heldDefenders`), at the frozen capture model's probability. `defender-plan.mjs` (in this folder) planned
every defender turn of Game Turns 2–7 of four recorded batches (2100100–2100479 without 2100000–2100079, which is kept for
S1's check; 320 games, 1,920 defender turns), accepting any probability (it needs the patch applied and a build; the
build of this record's parent commit `8b4c98b` with the patch was used):

| | Theater attacker | Standard attacker |
|---|---:|---:|
| Groups formed, per defender turn | 0.54 | 0.48 |
| Groups with capture probability 0.25 or more, per game | 0.06 | 0.05 |
| … 0.5 or more, per game | 0.03 | 0.01 |

Of 976 groups, the median probability is 0.01 and nine in ten are below 0.08; 17 reach 0.25. The metric above counts an
objective as within reach at column 6 by geometry; with supplied attack positions, the defender's free units and the
combat result, the defender almost never retakes. By the plan's stop rule (fewer than one a game), retaking has no room.
The planning code was removed again; the patch keeps it.

**Strike: already done.** Replaying the registered batch (`defender-attacks.mjs`): heuristic@85's defender declares 3.0
regular attacks a game against the theater attacker (2.9 at 3:1 or better) and 3.3 against heuristic@85 (3.1); in 1.8 and
2.3 Combat Segments a game it had a 3:1 attack and made none. Making more such attacks was tested for heuristic@79 (error
list E5, [continuations](../ai-error-continuations-v85-2026-10-18/README.md)): more attacks and kills that turn, no
difference in Kill − Loss or VP at the end.

**Cut: needs a design decision.** The opportunities are many, but planning a cutting move needs to know which enemy units
lose trace if an own unit stands in a hex. The rules compute that from the whole state, including enemy pieces the bot
does not see (hidden counters in stacks, 4.9). The measurement script builds hypothetical states with full information;
the bot has only its projection and the rules' queries. A query for it would decide what the bot may know of the enemy's
supply, which is the user's to decide.

## What this shows

- A defender that attacks objectives only with an advantage would almost never act: such counterattacks do not arise.
  heuristic@85's "no counterattack" is what that rule would do nearly every turn.
- Striking exposed stacks at good odds is already in the standard's combat step.
- Cutting the attacker's supply is the open part, and it is blocked on what the bot may know.

## Limits

- The capture model was fitted on attacks the attacker's bot chose (P11.3); applied to the defender it may misjudge its odds.
- Planning only; nothing is played on.

## Raw data

The ignored `artifacts/ai-s2/` of the `ai-truck-shuttle` worktree (`plan/`, `attacks/`).
