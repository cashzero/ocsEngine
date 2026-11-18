# S8.3: keeping the advance in meeting engagements

Boundary: continuations of recorded positions; no new game. The standard is heuristic@90 and is unchanged
(`meetingOptionAdvance` defaults to 0). This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: S8.3 (section 9) of the [AI strategy improvement
WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user (2026-11-17): 「全部做完」.

## Result

**`meetingOptionAdvance` raises VP: +3.12 ± 1.20 an event (mean − 2.1 SE = +0.60), established.** By the registered
reading it becomes a meeting-engagement candidate.

| meetingOptionAdvance − heuristic@90, the deciding side, end of the game (32 branches, 18 maps, 8 dice) | |
|---|---:|
| **VP margin** | **+3.12 ± 1.20** |
| Objectives margin | +1.16 ± 0.36 |
| Kill − Loss | −0.61 ± 1.08 |
| Own steps lost | +0.91 ± 0.65 |

It trades steps for objectives, as `optionAdvance` does in attack engagements. 31 of the 32 positions are Western Europe
(+3.12 ± 1.24 there). The changed decisions are 32 of the census's 58 retreat events (the other 26 would lose every
attacker), so about 0.34 a side a game: roughly +1 VP a side a game.

## The census

`scripts/ai-advance-census.mjs`, now counting each side of a meeting engagement for its own attacks, on 96 meeting sides
of the standard's meeting behaviour (heuristic@86 to heuristic@90 play meeting engagements alike): heuristic@90 self-play
of B5 (`artifacts/ai-b5-v90/vs-self`, 40 sides), heuristic@88's development meeting games (8 distinct games, 16 sides) and
heuristic@86's side of heuristic@87's independent meeting games (40 sides).

| A side a game | B5 self-play (40) | Development (16) | v87r batch, v86 side (40) |
|---|---:|---:|---:|
| Option retreats emptying an objective nobody entered | 0.88 | 0.38 | 0.42 |
| — VP not held at the side's next player turn | 2.05 | 1.00 | 1.07 |
| Unfunded advances, VP not held at the next player turn | 0.10 | 0.50 | 0.17 |

Unfunded advances are 0.20 VP a side a game pooled, below S5.4a's 0.5: not pursued in meeting engagements.

## Method

[registration.json](registration.json), committed in `dfeaae9` before any continuation; [branches.jsonl](branches.jsonl)
(the deciding side's OPTION_SPLIT decision of each event). The build of `dfeaae9` was compiled into
`artifacts/ai-s8/dist` so that another run could keep `dist`. 512 continuations, all finished. One branch (2400018, Game
Turn 8) ends before the next Game Turn, so it has no row at that horizon; `scripts/ai-continue-batch.mjs` first counted it
as failed and now accepts a game that ends before a horizon. Its two runs were played again.

```sh
F=docs/quality/evidence/ai-s8-meeting-option-2026-11-18
node scripts/ai-continue-batch.mjs --branches $F/branches.jsonl --variant v90=heuristic --variant meeting=heuristic:$F/meeting-option-weights.json \
  --opponent heuristic@artifacts/ai-promotion/frozen-v90-standard/dist --dice 8 --horizons 1 --jobs 6 --engine artifacts/ai-s8/dist --out-dir artifacts/ai-s8/meeting
python3 scripts/ai-continue-compare.py artifacts/ai-s8/meeting/*.jsonl --baseline v90 --cluster-by-map --metrics margin.vp,margin.objectives,margin.killLoss,loss
```

## Limits

- 31 of 32 positions are Western Europe, 21 from one self-play batch.
- The branch is the decision itself, with fresh step memory for both variants.

## Raw data

`artifacts/ai-s8/meeting/`, `artifacts/ai-s8/meeting-compare.*` and the censuses `artifacts/ai-next/meeting-census-*.json`
of the `ai-truck-shuttle` worktree.
