# Promotion of the theater allocation as heuristic@86

Boundary: the standard computer policy. `heuristic@86` is `heuristic@85` with the weight `theaterAllocation` at 1: the
attacker of an attack engagement plans by theater allocation. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Design:
[theater supply allocation](../../../ai/theater-supply-plan.md#策略上層).

## Decision

After the registered observation of this version, the user asked to promote it (2026-11-13): 「既然如此 promte此solution
並且commit and push」. That changes the earlier decision that P11 does not go through promotion (2026-10-21). The two
attacker supply gates then failed; the user chose to find the cause first, and after one cause was fixed and the gates
still failed, to promote as an exception (「例外升級並 push」). As with `heuristic@78`, `@79` and `@85`, the user's
decision stands in for parts of the promotion process of
[evaluation.md](../../../ai/evaluation.md#標準策略的升級流程); what that process asks and what was done:

| Promotion step | Done for heuristic@86 |
|---|---|
| Independent batch, 80 games, both maps and both changed engagements, registered primary measure and margins | Not run. Evidence is the registered observation on Western Europe attack games only: 80 games, VP +2.70 [+1.15, +4.25] a pair against heuristic@85 ([record](../ai-theater-untraced-games-2026-11-13/README.md)); no non-inferiority margins were registered. That batch played the version before the rail fix below; the fix is checked only in rollouts. |
| Engagements changed | Attack engagements only (the attacker's side). Meeting engagements are unchanged: in development games every pair's two final state hashes are equal (below). |
| Eastern Europe | Correctness only (below); its effect is not measured. |
| Attacker logistics gate and attacker supply gate (trucks and HQ placement change) | **Both fail** (exception). On the batch: rear SP left 9.3 against 5.6, SP no front unit can draw 3.9 against 1.7. With the rail fix, in rollouts of Game Turns 1–6 from the batch's states: 6.5 against 4.9 and 2.4 against 1.5; units unable to fuel 5.8 a game against 6.3 ([record](../ai-theater-supply-gates-2026-11-13/README.md)). |
| Correctness of every game, typecheck, build, tests, smoke | All 80 batch games and every check game below finished legally and replayed to their hash; typecheck, build, full test suite (816 passed, 7 skipped) and dist smoke pass on the promoted source. |

## Development checks (seeds not used before, not a registered batch)

`dist` built from the promoted source (`heuristic` is heuristic@86; the other seat is the same build with
`theaterAllocation` 0, which plays as heuristic@85), Node v26.9.0, 32×24, 6 divisions (2 armored), 8 turns,
`--air NONE --air-transport NONE`, `--swap` (`artifacts/ai-theater-promotion-check-final`).

| Games | Result |
|---|---|
| Eastern Europe Axis attacks, 2199100–2199107 | All 8 finished, replay check passed, no rejected actions. VP +3.00 [−0.87, +6.87] a pair over 4 pairs (not an evaluation). |
| Western Europe meetings, 2199200–2199203 | All finished and replayed; both pairs' two final state hashes are equal (unchanged). |
| Eastern Europe meetings, 2199300–2199303 | All finished and replayed; both pairs' two final state hashes are equal (unchanged). |

The same check on `c2e9713`'s build (before the rail fix) gave the same correctness results.

The standard is frozen for later candidates as `artifacts/ai-promotion/frozen-v86` (`scripts/ai-promotion/freeze.py
--baseline`, after the promotion commit).

## Limits

- No independent promotion batch; the effect is established on Western Europe attack games against heuristic@85 only.
- Eastern Europe attack games, other sizes, air and `ALLIED_ATTACKS` are not measured.
- The attacker supply gates fail: with the rail fix the theater attacker still leaves 1.6 times as much SP where no
  front unit can draw it, cause not found.
- The theater allocation's known gaps stay open (`bot-theater-allocation`): rail and sea capacity, next-step groups that
  convert poorly.
