# S12.1–S12.2: do this step's assault units stop short of an open attack position?

Boundary: replays of recorded games, each with one Movement segment played again by frozen heuristic@91; no new game.
The standard is heuristic@91 and is unchanged. This record changes no row of
`docs/quality/03-product-operation-verification-plan.md`. Plan: [S12](../../../roadmap/19-ai-strategy-improvement-wbs.md#s12-西歐第-3-回合的主攻組到位).
The user (2026-11-19), on closing the Extender line: 「1」 (close it and go on to S12).

## Result

**No fork, so the hypothesis ends here (S12 step 2's stopping rule).** In Game Turn 3 the theater plan's first main effort
arrives this step on only 4 of the 40 Western maps. 13 of its 14 members end beside the objective. The other one, an
anti-tank unit at 13,5, could have reached 6,8 beside its objective 5,8, but it would have had neither trace nor SP to eat
there, and three other units would have lost their ration. No member stops short while an open attack position is
within reach, so there is nothing to change and nothing to continue (steps 3 and 4 are not run).

| First main effort of the theater plan, Game Turn 3, 40 Western maps | Maps |
|---|---:|
| Its group arrives this step (`t1`) | 4 |
| Its group arrives at the next step (`t2`) | 22 |
| Not one of the plan's groups: every group was dropped (chance under 0.25) and the main effort is the older fallback | 9 |
| No main effort | 5 |

The hypothesis came from the low-column attacks of [the Western fork study](../ai-western-low-column-fork/README.md): 11
of them in Game Turn 3, on 10 maps. Those come from groups that arrive at the next step and from the fallback effort, not
from this step's groups arriving one unit short. With heuristic@91 in Game Turn 3, this step's groups already arrive.

## Method

```sh
npm run build
node scripts/ai-arrival-fork-census.mjs artifacts/ai-promotion/frozen-v88-independent/attack-western --out artifacts/ai-s12/census.json
```

- **Maps**: the 40 games heuristic@88 attacked in its independent batch.
- **Replay**: each save is replayed to the start of the attacker's ordinary Movement segment in Game Turn 3. The frozen
  heuristic@91 build (`artifacts/ai-promotion/frozen-v91-standard`) then plays that segment again, with fresh step
  memory and the seats' recorded bot seeds.
- **Which effort**: the policy's own debug lines give its first main effort (`MAIN EFFORT`) and whether the plan's group
  for it arrives this step (`t1` on the `THEATER` line).
- **Members**: the units the policy gives an ASSAULT target on that objective.
- **Per member move**, the passive movement observation gives the policy's score for every candidate destination, after
  its trace correction. Each destination beside the objective is then checked as `scripts/ai-arrival-fork-census.mjs`
  describes:
  - stacking: the policy's overstack term;
  - supply after the move, as heuristic@91 checks a group member leaving trace: the move is allowed, the mover has trace
    or SP to eat, and no other unit loses trace or ration.
- **Unknown**: none of the 14 members' candidate lists hit the 1,500 budget.

Every map's effort and members, with each adjacent destination and why it was ruled out: [census.json](census.json).

## Limits

- One recorded position per map, 40 maps, one style.
- The plan only asked about this step's groups. The next-step groups (22 maps) and the fallback efforts (9) were
  outside its question.

## Raw data

`artifacts/ai-s12/` in the main checkout (`census.json` with the chosen actions, `census.txt`, `census.log`).
