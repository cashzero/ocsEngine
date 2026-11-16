# S5.3: candidate heuristic@88, development batch

Boundary: the promotion process of [AI evaluation](../../../ai/evaluation.md) up to the development batch. The standard
is unchanged (heuristic@86). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`.
Plan: S5.3 (section 7.5) of the [AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The
user (2026-11-16): 「好 3接2」 (S5.3 with an independent batch of 80 attack pairs, as an exception to the 80-game batch).

## Candidate

heuristic@88 = heuristic@86 with five weights on by default ([candidate.patch](candidate.patch)), the S5.4 cand3
([record](../ai-s5-cand3-2026-11-16/README.md), +1.53 ± 0.32 VP an attack pair in continuations): `approachAttack` 1 (the
attacker of an attack engagement only), `arrivalRailForward` 1 and `optionAdvance` 1 (attack engagements), `hqBridge` 1
(attacker), `defenderCut` 2 (defender). Source `bed3232`, frozen as `artifacts/ai-promotion/frozen-v88`; `quality.py`:
typecheck, 830 tests (7 skipped) and smoke pass on the frozen build.

## Development batch

`batch.py <frozen-v88-freeze.json> <frozen-v86-freeze.json> development`: 32 games, seeds 1300000–1300007,
1300100–1300107, 1300200–1300207, 1300300–1300307, seats exchanged, against frozen heuristic@86. All finished, replayed
and passed the supply and advance audits (110 advances, all funded; 16 overruns, all funded). **Both meeting groups end
every pair in the same state: meeting engagements are unchanged**, so the independent batch goes to attack engagements
only.

| Attack engagement, 8 pairs, heuristic@88 − heuristic@86 a pair | Mean | SE |
|---|---:|---:|
| VP | +0.38 | 1.89 |
| Kill − Loss | −2.06 | 4.11 |
| Supply | +0.81 | 1.59 |

The VP sums are +32 over the 8 Western games and −26 over the 8 Eastern ones. With 4 pairs a style, these are only
directions.

Attacker supply gates on the 8 attack games the candidate attacked, against heuristic@86's self-play on the same seeds
(`artifacts/ai-promotion/frozen-v87-v86selfplay-development`, 16 games; 1300200 and 1300201 rerun through heuristic@88's
engine give the same final hashes): rail 100% of the SP railable forward, rear SP no front unit can draw 2.0 against
2.0, garrison stock 0, SP no front unit can draw 2.1 against 2.4: both pass.

## Raw data

`artifacts/ai-promotion/frozen-v88-development/` (acceptance.json, logs), `frozen-v88-development-gates/` and
`artifacts/ai-s5/v88-selfplay-check/` of the `ai-truck-shuttle` worktree.

## Registration

[registration.json](registration.json), written by `register.py <frozen-v88-freeze.json> <frozen-v86-freeze.json> 2800000
--primary vp --margin killLoss=1.5 --margin supply=0.5 --games 160` before any independent game. The user approved the
batch of 160 games (80 attack pairs) as an exception to the 80-game batch (「3接2」) and confirmed the margins (「沿用」,
2026-11-17). Western Europe attack 2800200–2800279, Eastern Europe attack 2800300–2800379; meeting engagements unchanged.
heuristic@86's self-play on the same seeds (160 games) is the control of the two attacker supply gates. Expected pass
probability from the continuations: 0.89 at a pair SD of 3.7, 0.78 at 4.5 (optimistic: the weights were chosen on the
same positions).
