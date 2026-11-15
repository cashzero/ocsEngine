# S4: candidate heuristic@87, development batch

Boundary: the promotion process of [AI evaluation](../../../ai/evaluation.md#標準策略的升級流程) up to the development batch.
The standard is unchanged (heuristic@86). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S4 of the AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md#5-s4-獨立批與基準重測). The user (2026-11-15): 「完成S4」, and for
`approachAttack`, 「例外帶到 S4」.

**Status: stopped before registration.** The development batch's ordinary supply audit reports violations that come from
heuristic@86's own design; the correctness rule must be decided by the user before an independent batch can be
registered.

## Candidate

heuristic@87 = heuristic@86 (`35b0147`) with four weights on by default ([candidate.patch](candidate.patch)):
`arrivalRailForward` 1 and `hqBridge` 1 (S1b), `defenderCut` 2 (S2), `approachAttack` 1 (S3, by the user's exception).
Tests that check those weights now set them explicitly (`35b0147`). Frozen with `scripts/ai-promotion/freeze.py` as
`artifacts/ai-promotion/frozen-v87`; `quality.py`: typecheck, full suite and smoke pass on the frozen build.

## Development batch

`batch.py <frozen-v87-freeze.json> <frozen-v86-freeze.json> development`: 32 games, seeds 1300000–1300007 (Western
Europe meeting), 1300100–1300107 (Eastern Europe meeting), 1300200–1300207 (Western Europe attack), 1300300–1300307
(Eastern Europe attack), seats exchanged, against frozen heuristic@86, Node v26.9.0. All finished and replayed. No pair
ends in the same state: the candidate changes both engagements.

| Per pair, heuristic@87 − heuristic@86 (4 pairs a group) | VP | Kill − Loss | Supply |
|---|---:|---:|---:|
| Western Europe meeting | +1.00 (SD 4.1) | +0.63 (SD 8.9) | 0.00 |
| Eastern Europe meeting | +0.75 (SD 1.5) | +6.63 (SD 4.6) | +0.75 |
| Western Europe attack | +1.25 (SD 5.5) | +3.75 (SD 5.6) | +0.38 |
| Eastern Europe attack | +0.00 (SD 3.2) | +9.13 (SD 5.5) | +0.50 |

Attacker supply gates on the 8 attack games the candidate attacked, against heuristic@86's self-play on the same seeds
(`artifacts/ai-promotion/frozen-v87-v86selfplay-development`, 16 games, through the candidate's engine): rail 100% of the
SP railable forward, rear SP no front unit can draw 1.8 against 2.0, garrison stock 0, SP no front unit can draw 1.9
against 2.4: both pass. Reported without a threshold, and worse: units unable to fuel 25.8 a game (26%) against 18.1
(19%), dry HQs 23% against 10%, SP front units can draw 11.8 against 18.1.

## The supply audit

`verify.py ... development` stops on `relocationTraceBreaks` (`scripts/ai-supply-study.mjs`: an ordinary move after which
some own combat unit that had trace has none). There are 90 in the 16 attack games, none in the meetings. In every one,
the unit that lost trace is the unit that moved; no other unit lost it. Both policies make them, in the games where each
attacks (`self-breaks.mjs` in this folder): heuristic@86 36, heuristic@87 54. Of those, 59 are fed where they stop (SP a
dump reaches them, 12.6c), and the other 20 (9 and 11) are stagers or members whose SP a truck unloads later in the same
segment: every one of the 90 has trace or SP to eat when the Movement Segment ends.

These are the theater allocation's designed moves (heuristic@86: a group's member may leave trace for an attack position
where it can eat; a stager stops at its drop before its truck; [design](../../../ai/theater-supply-plan.md#策略上層)). The
correctness rule of the promotion process ("ordinary moves and mode changes break no existing trace or rations") counts
them all. heuristic@86 was promoted by the user's exception without this audit, so the conflict was not seen.

## Limits

- Development seeds, 4 pairs per group: the effects are directions only.
- The fuel and dry-HQ numbers are from 8 games.

## Raw data

`artifacts/ai-promotion/frozen-v87*` of the `ai-truck-shuttle` worktree.
