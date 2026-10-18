# heuristic@85 promotion by user decision (the defender forms no main effort)

Status: heuristic@85 is the standard computer strategy by user decision (2026-10-18), without an independent batch. The
promotion procedure of `docs/ai/evaluation.md` was not completed: no seeds were registered and the primary measure and margins
were never set. This record collects the evidence the decision rests on.

Boundary: headless bot-against-bot matches and continuations through the Gameplay Engine. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`.

## The change

heuristic@85 = heuristic@79 (as heuristic@84 plays it, game for game) + artillery barrages against ports and air bases
(`7990052`, not measured in VP batches) + the defender of an attack engagement forms no main effort, so it never counterattacks
objectives the attacker holds. Source `f660ed1` (rebased from `89c15a8` onto a documentation-only commit; `src` and `tests`
are identical). The decline to counterattack is a workaround: counterattacking only with an advantage is the open TODO
`bot-defender-counterattack`.

## Evidence

| Measurement | Seeds | Result (v85 or no-effort defender against v79) |
|---|---|---|
| Continuation test, error item E1 ([record](../ai-defender-assault-continuation-2026-10-18/README.md)) | 49 positions from 56 games, 3 common dice each | defender steps lost −2.50 ± 0.69 (t −3.6), Kill − Loss +2.91 ± 0.97, VP margin +1.90 ± 0.89 (t +2.1); the attacker ends with 1.15 fewer units out of trace |
| Full games, no-effort defender ([record](../ai-defender-efforts-development-2026-10-18/README.md)) | 1330000–1330039, 1330100–1330139 (attack, 40 pairs, never used before) | VP +0.70 ± 0.60, Kill − Loss +2.29 ± 0.98, Supply −0.25 ± 0.35 a pair; defender effect +1.4 ± 1.2 VP a defender game |
| Promotion development batch of the frozen v85 ([development-acceptance.json](development-acceptance.json)) | 1300000–1300307 (32 games) | meeting unchanged (every pair's two games end in the same state); attack 8 pairs: VP +4.88 ± 1.81, Kill − Loss +3.44 ± 2.78, Supply −0.69 ± 0.50; attack VP 153–75 |

All games legal, replay hashes equal, supply and advance audits pass. Frozen quality of `frozen-v85`
([v85-freeze.json](v85-freeze.json)): typecheck 0, 799 tests passed / 8 skipped, smoke 0.

## Known cost

The counterattacks cut the attacker's supply: without them the attacker ends with fewer units out of supply in every
measurement (continuation −1.15 units; full games Supply −0.25 and −0.69 a pair). It is the reason the user left the
conditional counterattack as a TODO.

## Raw data

The ignored `artifacts/ai-promotion/frozen-v85*`, `artifacts/ai-assault/defender-1330` and `artifacts/ai-continue/defender-assault`
of the `ai-truck-shuttle` worktree.
