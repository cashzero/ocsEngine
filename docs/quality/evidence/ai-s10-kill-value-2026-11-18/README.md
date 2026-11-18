# S10: attacks where the defenders stay, and what a kill is worth

Boundary: replays and continuations of recorded games; no new game. The standard is heuristic@90 and is unchanged. This
record changes no row of `docs/quality/03-product-operation-verification-plan.md`. Plan: S10 (section 9) of the [AI
strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-17): 「全部做完」, and on
kills: 「但長期來看kill應該對長期VP有幫助?」.

## S10.1 Attacks on objectives where the defenders stay

[attack-exchange.mjs](attack-exchange.mjs) on the 80 games heuristic@88 attacked in its independent batch: every regular
attack, its Combat Table column (Open 3:1 is 6) and the steps each side lost while it resolved.

| Attacks on objectives the attacker does not hold, a game | Column 0–3 | 4–5 | 6–7 | 8–9 | 10+ |
|---|---:|---:|---:|---:|---:|
| Attacks | 1.32 | 1.76 | 1.13 | 0.36 | 0.97 |
| Attacker's steps lost an attack | 0.62 | 0.58 | 0.33 | 0.17 | 0.01 |
| Defender's steps lost an attack | 0.50 | 1.01 | 1.32 | 1.21 | 1.13 |
| Objective taken | 11% | 40% | 68% | 83% | 92% |
| Defenders stayed | 75% | 41% | 19% | 7% | 0% |
| Attacking units | 2.0 | 3.5 | 3.9 | 4.7 | 4.7 |

**The defenders stay because the attacks on objectives are at low odds: 58% of them are at column 5 or below.** Those at
0–3 are about even in steps (Kill − Loss −0.12) and take the objective one time in nine, so at the rate below they are
not losing attacks; they are weak ones. Units beside the target that could have joined but did not are few (0.10 to 0.34
an attack, [S9](../ai-s9-eastern-attack-2026-11-18/README.md)). More strength at the objective is the lever: the
concentration TODO (`bot-force-concentration`) and, in Eastern Europe, the supply reach of S9. No change was made.

## S10.2 What a step of Kill − Loss is worth in VP

Across the S5 continuations (3,741 pairs of a variant and heuristic@86 on the same branch and dice,
[s5-two-segments.py](s5-two-segments.py)), every variant's VP and Kill − Loss changes lie on one line: about **0.3 VP a
step** (0.25 to 0.35 for each variant with enough branches; heuristic@86's own games across positions give 0.34).
`optionAdvance` is the exception that proves the rule: it gives up 1.15 steps of Kill − Loss and gains 1.24 VP, because it
converts directly into objectives.

By Game Turn ([kill-value.py](kill-value.py)): 100 Western Europe attack branches of S5.2 (50 attacker, 50 defender, Game
Turn 2), heuristic@90 against heuristic@86's weights in the same build, rows at the start of every Game Turn:

| Kill − Loss in Game Turn | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---:|---:|---:|---:|---:|---:|---:|
| End-of-game VP a step | +0.19 ± 0.36 | +0.18 ± 0.19 | +0.39 ± 0.13 | +0.29 ± 0.13 | +0.17 ± 0.11 | +0.34 ± 0.13 | +0.08 ± 0.15 |

Game Turns 2–4 together: +0.31 ± 0.10; 5–8: +0.23 ± 0.04. A step taken through Game Turn 7 is worth about 0.2 to 0.4 VP
at the end; one taken in the last Game Turn about nothing, since VP counts only the objectives held at the end and there
is no time left to convert it. So kills do help VP over the game, roughly a third of a VP each, and more when they come
early enough to be turned into ground. In a game longer than 8 Game Turns more of them would have time to convert; that
needs new, longer games and was not measured.

These are associations between two outcomes of the same divergent games, not the causal value of a kill: a turn whose
fighting goes better also tends to take ground.

## Method

```sh
P=artifacts/ai-promotion/frozen-v88-independent
node docs/quality/evidence/ai-s10-kill-value-2026-11-18/attack-exchange.mjs $P/attack-western $P/attack-eastern
F=docs/quality/evidence/ai-s10-kill-value-2026-11-18
node scripts/ai-continue-batch.mjs --branches $F/branches.jsonl --variant v90=heuristic --variant v86w=heuristic:$F/v86-weights.json \
  --opponent heuristic@artifacts/ai-promotion/frozen-v90-standard/dist --dice 1 --horizons 1,2,3,4,5,6 --jobs 8 --out-dir artifacts/ai-s10/kill-value
python3 $F/kill-value.py; python3 $F/s5-two-segments.py
```

Build `aee8704` for the per-turn continuations (200, all finished).

## Raw data

`artifacts/ai-next/attack-exchange.json`, `artifacts/ai-s10/kill-value/` and `artifacts/ai-s5/` of the
`ai-truck-shuttle` worktree.
