# Game Flow acceptance correction — 2026-09-01

Status: **BLOCKER RESOLVED; FULL PRODUCT GATE IN PROGRESS (2026-09-03)**.

## Why the previous PASS was invalid

The previous M8/U10 gate proved package generation, DOM structure, preview/mounted terrain equality, and responsive rendering. It did not operate the browser through one complete game turn. `tests/ui/ui-contract.test.ts` also used source-string assertions, which can prove wiring conventions but cannot prove a usable Game Flow.

That evidence silently reduced the requested acceptance boundary from:

```text
New Game -> generate Map -> generate OOB -> deployment -> Gameplay
         -> complete an actual turn through the UI
```

to:

```text
prepare package -> render preview -> mount session
```

The reduced boundary was not approved by the user and must not have been marked PASS.

## Reproduction performed through the browser

Inputs deliberately differed from defaults:

- Map: `MEDITERRANEAN_COAST`, 18×12, seed 91001;
- OOB: `LARGE`, four formations per side, seed 91002;
- deployment seed 91003, rules seed 91004, three turns.

Observed integration before play:

- combined preview: 216 Hexes, 90 units, eight formations, 28 deployed Hexes;
- mounted session: Mediterranean 18×12, 90 units, eight formations, three turns;
- 55 counters visible in the active-seat projection;
- therefore the chosen Map/OOB values did reach the mounted package.

Observed play attempt:

1. `WEATHER / NONE`, revision 0: Advance Sequence succeeded.
2. `FIRST_PLAYER / NONE`, revision 1: Advance Sequence succeeded.
3. `AIRCRAFT_REFIT / NONE`, revision 2: Advance Sequence succeeded.
4. `REINFORCEMENT / NONE`, revision 3: selecting/advancing through the UI stopped responding for more than 15 seconds.

The attempt never completed Turn 1. This is a blocking Game Flow failure.

## Evidence-ranked hypotheses

1. Candidate discovery or UI recomputation scales poorly with the 90-unit Large OOB at Reinforcement.
2. Selecting an action family synchronously rebuilds too much map/counter/legality presentation on the browser main thread.
3. Reinforcement candidate enumeration may be unbounded or perform repeated full-state validation.

These are hypotheses, not fixes. Profiling must identify the responsible call boundary before product code changes.

## Resolution evidence (2026-09-03)

The candidate-discovery hot path was narrowed at the Rule Engine boundary and UI discovery now uses bounded, selection-aware probes. The generated OOB capability IDs were also aligned with the canonical Rule contracts, and eliminated pieces were excluded from active-location duplicate-stack validation.

After rebuilding, `scripts/ui-flow-gate.mjs` operated the real Edge UI for default, Large, and contact inputs. Default and Large entered Turn 2; contact reached Turn 4 and included legal unit actions, barrage/combat transactions, decisions, and visible privacy handoffs. Maximum measured selection/execution latency stayed within the frozen budgets and the browser reported zero errors.

This resolves the specific Reinforcement stall and whole-turn blocker. It does not promote the entire M8/U10 gate: session persistence, Game End downloads, remaining New Game/Map/layout/error operations, and keyboard traversal remain governed by `03-product-operation-verification-plan.md` and are still unverified until operated.

2026-10-04: the frozen matrix was run in the browser for §A (New Game), §B/§B1 (map, OOB and counters) and §C (rule actions);
see doc 03 "Execution record 2026-10-04" and `docs/quality/evidence/product-2026-10-04/`. One complete contact turn was again
operated through the real UI with every decision answered by the owning seat and every hand-over hiding the map. Four rows
failed (NG-07, NG-10, MAP-03, MAP-04) and the session, layout and keyboard rows were not yet run, so M8/U10 remain `IN PROGRESS`.

## Correct acceptance boundary

M8/U10 remain `IN PROGRESS` until browser runs prove all of the following:

- configured Map/OOB/deployment values remain identical through preview and mounted session;
- one complete turn is operated through the real UI for both default and Large OOB cases;
- every phase/segment transition, pending decision, and hot-seat handoff is recorded;
- no interaction produces an unexplained dead end or main-thread stall;
- interaction latency is measured and a documented budget is met;
- automated tests exercise behavior rather than using source-string presence as primary proof.
