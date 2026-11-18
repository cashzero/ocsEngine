# S8.1: advancing into an emptied objective without the next ration in hand

Boundary: continuations of recorded positions; no new game. The standard is heuristic@90 and is unchanged
(`advanceUnfunded` defaults to 0). This record changes no row of `docs/quality/03-product-operation-verification-plan.md`.
Plan: S8.1 (section 9) of the [AI strategy improvement WBS](../../../roadmap/19-ai-strategy-improvement-wbs.md). The user
(2026-11-17): 「全部做完」.

## Result

**`advanceUnfunded` raises VP: +1.06 ± 0.32 an event (mean − 2.1 SE = +0.39), established.** By the registered reading it
goes into the next attack-engagement candidate. Adopting it needs a change to the promotion process's advance audit,
which stops on any unfunded advance of a candidate before Game Turn 8 (`scripts/ai-promotion/audit-advances.mjs`); that is
the user's decision.

| advanceUnfunded − heuristic@90, the attacker, end of the game (SE over maps) | Western Europe (32 events, 16 maps) | Eastern Europe (36, 16) | Both, weighted equally |
|---|---:|---:|---:|
| **VP margin** | +1.36 ± 0.54 | +0.76 ± 0.37 | **+1.06 ± 0.32** |
| Objectives margin | +0.34 ± 0.14 | +0.49 ± 0.23 | +0.41 ± 0.13 |
| Kill − Loss | +1.29 ± 0.45 | +0.42 ± 0.97 | +0.85 ± 0.52 |
| Own steps lost | −0.54 ± 0.42 | −0.14 ± 0.53 | −0.34 ± 0.33 |
| Own units out of trace | −0.19 ± 0.32 | +0.69 ± 0.62 | +0.25 ± 0.34 |

No measure shows a cost. The event happens 0.43 times a game for heuristic@88's attacker, so the gain is about +0.45 VP a
game for the attacker, +0.23 an attack pair. 67 of the 68 branches end differently.

## The events

The census of heuristic@88's independent batch (`scripts/ai-advance-census.mjs`, 160 attack games) found 68 regular
attacks on objectives that emptied the hex, offered an advance and had no supplied option, every option failing on
`supply.advanceFunded`. All 68 objectives lay out of the attacker's trace. 55 were the attacker's at the end of the game
anyway and 13 at its next player turn: the loss is mostly tempo. In 64 of the 68 dropping the funded test lets an advance
through; the other 4 would also cost another unit its feed and stay unchanged.

`advanceUnfunded` (`src/ai/decisions.ts`, ADVANCE_HEX): for the attacker of an attack engagement taking an objective it
does not hold, the advance no longer needs `supply.advanceFunded`. The other tests stay (no other unit loses trace or
feed). Its Movement Phase comes before its next Supply Phase. Regression test `tests/ai/advance-unfunded.test.ts`
(2800204, Game Turn 4, a 5-point objective).

## Method

[registration.json](registration.json), committed in `aee8704` before any continuation; [branches.jsonl](branches.jsonl)
(the attacker's ADVANCE_HEX decision of each event). Variants heuristic@90 and `advanceUnfunded` 1, 4 dice, against
frozen heuristic@90, build `aee8704`. 544 continuations, all finished (2026-11-17, 79 minutes).

```sh
F=docs/quality/evidence/ai-s8-advance-2026-11-17
node scripts/ai-continue-batch.mjs --branches $F/branches.jsonl --variant v90=heuristic --variant unfunded=heuristic:$F/unfunded-weights.json \
  --opponent heuristic@artifacts/ai-promotion/frozen-v90-standard/dist --dice 4 --horizons 1 --jobs 10 --out-dir artifacts/ai-s8/advance
python3 scripts/ai-continue-compare.py artifacts/ai-s8/advance/*.jsonl --baseline v90 --by-style --cluster-by-map \
  --metrics margin.vp,margin.objectives,margin.killLoss,loss,own.outOfTrace
```

## Limits

- The positions come from games against heuristic@86 and heuristic@88; the opponent here is heuristic@90.
- The branch is the decision itself, with fresh step memory for both variants.
- Only the attacker of an attack engagement; meeting engagements are S8.3.

## Adoption (heuristic@91)

The user (2026-11-18): 「一起採用」. `advanceUnfunded` and `meetingOptionAdvance` became defaults in heuristic@91
(`b935435`), frozen as `artifacts/ai-promotion/frozen-v91-standard`, without an independent batch. The advance audit
(`scripts/ai-promotion/audit-advances.mjs`, `verify.py`) now accepts a candidate's unfunded advance before the final turn
only into an objective the attacker of an attack engagement has just emptied, with no other unit losing trace or feed
(`unfundedObjectiveAdvance`).

Check on known development seeds, heuristic@91 against frozen heuristic@90 (8 Western attack games 1300200–1300207, 4
Western meeting games 1300000–1300003, seats exchanged, traced): all 12 finished and replayed; the ordinary supply audit
has no violation; the advance audit passes: 46 advances of heuristic@91, 2 unfunded and both under the exemption, no
preview violation. 834 tests pass (7 skipped), typecheck, build and smoke pass. Raw data: `artifacts/ai-s8/v91-check/`.

## Raw data

`artifacts/ai-s8/advance/` and `artifacts/ai-s8/advance-compare.{txt,json}` of the `ai-truck-shuttle` worktree; the
census `artifacts/ai-next/census.json`.
