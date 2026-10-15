# Reinforcement percentage selectors

## Boundary and expected behavior

Replace both reinforcement percentage number fields with discrete options. Fix edits that rewrite other settings while numbers are temporarily empty and fix preview/deployment count disagreement. The user explicitly retained automatic fitting as early as T2; it is not treated as a defect. The automatic higher defender default for ports-only attacks is separate, open work.

Acceptance requires real controls in the built application: choose independent ratios, edit numbers with the keyboard, visibly change Map and OOB inputs, preview and start the same package, complete legal actions and entire Game Turns through decisions/handoffs, and actually enter scheduled land and sea reinforcements. The automated suite is supporting evidence only. NG-15 records the operation result in doc 03.

## Build and inputs

Base commit `05c9b84f7dfc460691b77edff1c943312c341b8f` plus the working changes whose hashes are recorded in sources.json. No session-state injection, engine calls, fixture loads or bypassed decisions in the browser script. Run `npm run build`, then:

```sh
node scripts/reinforcement-ui-check.mjs artifacts/reinforcement-select/third-run
```

Chromium through Playwright at 1920×1080. Initial settings use the default 32×24 Western Europe, Compact, six divisions / two armored, eight turns, Meeting Engagement. The final operation changes the map to 28×20 and OOB to four divisions / one armored; Allied attack, flank sea, Allied ports only, Axis inland entry, Sea Cap 5/0, six turns, Allied 25% / Axis 75%, first arrival T3. Seeds map/OOB/deployment/rules: 206569473/206569474/206569475/206569476. Attack scaling gives Allied six divisions, Axis four; actual delayed divisions are two / three.

## Observed controls and package

Both fields are SELECT controls with 0%, 25%, 50%, 75% and actual whole-division counts. Initial six-division labels are 0, 2, 3, 5 divisions. Clearing the first-turn field leaves it empty; typing 4 then leaving it keeps 4. With 75%/T3 selected, clearing the turn limit does not change those values; typing 10 and leaving the field preserves them. Shortening to four turns fits the settings to 25%/T2 and disables larger choices with an explanation. This preserves the fitting behavior the user wanted.

The final Settings summary says Allied two divisions T3–T4 and Axis three T3–T5. Preview agrees at Allied 2 / Axis 3, from Turn 3; 28×20, 49 units, ten total divisions, six objectives / 19 VP, Allied 3 / Axis 16, no warnings. Start uses the preview's own button. The mounted menu agrees on engagement, 49 units, ten formations, six turns and all four seeds; the starting top bar agrees on Allied 3 / Axis 16. Generation measured 591 ms, Start 296 ms (single local run, not a general latency guarantee).

## Integrated play and arrivals

A roster-selected 35.Inf makes a legal Move Mode move 0206 → 0205 via the highlighted map destination and confirmation button. The run then ends required segments/phases, completes handoffs and answers First Player decisions with the visible Go first choice. Both complete Game Turns 1 and 2 are exercised. Axis acts first in Turn 3, so its entry is recorded before Allied movement rather than assuming a fixed player order.

At Axis Turn 3 Reinforcement, 5.FJ appears as the scheduled divisional arrival. Clicking its Arrivals row and a highlighted map entry places it at 2819; the serving roster then contains it at that hex. Pax, Eq and SP for that phase are also placed using the visible controls.

At Allied Turn 3 Movement, 101.Abn is available in the sea cargo list. Tick it, choose friendly port 0105, and press Ship. The notice reads Shipped 1 unit from the reinforcement Box to 0105 for 2 Sea Cap. Sea Cap drops from 5 to 3; the serving roster now contains 101.Abn at 0105. This is an actual legal sea arrival, not an inferred Box placement.

Final state: Turn 3 / 6, Allied player turn, Movement; no pending decision or handoff. All 18 script checks succeeded; console/page errors: zero. Build, typecheck, dist smoke and 13 tests across reinforcement-options, truck-reinforcements and new-game-flow succeeded. The full test suite was not rerun.

## Screenshots reviewed

Images remain under the gitignored artifacts directory, never in this evidence folder:

- 01-short-campaign-options.jpg: visible 25% / two divisions at T2 after shortening the campaign; controls fit in the dialog. Native option.disabled values establish that unavailable percentages are disabled.
- 02-settings.jpg: both dropdowns, distinct percentages/counts, T3, changed 28×20 / four divisions / one armored, flank sea and per-side entry/capacity settings are readable.
- 03-preview.jpg: the same map and force setup, initial VP, reinforcement totals and first turn; the minor metrics wrap within the available area.
- 04-started.jpg: mounted Allied Turn 1 and the expected 3/16 starting VP.
- 07-land-arrived.jpg: Axis Turn 3 Reinforcement; 5.FJ is in the roster at 2819.
- 09-sea-arrived.jpg: Allied Turn 3 Movement; 101.Abn is in the roster at 0105, Sea Cap 3/5 and the shipping notice are visible.

## Issues and limits

The land-arrival screenshot also shows a separate nonblocking issue: after SP placement merges into an existing dump, the left panel retains the eliminated 0 SP arrival as its selection. The arrival itself succeeds. This is tracked as arrival-merged-selection in doc 05. The existing landing-port-view issue remains: the mounted map starts centered away from the port, although the shipping destination list lets this run use it. Neither issue is claimed fixed.

Two preliminary script runs were incomplete and remain in artifacts. The first incorrectly relied on Playwright option.isDisabled(), which returned false despite the native disabled property; the successful run checks the actual property. The second assumed Axis T3 Reinforcement would follow Allied T3 Movement, missed that boundary when Axis went first, and continued to game end. The script was corrected to handle either order; no product behavior was changed to force turn order. Their outcomes are not used as acceptance for entry.

This run verifies one configured Allied attack and its two entry routes, not all engagements, sizes, OOB scales, balance, every future wave, or automatic defender defaults. NG-11 and other existing operation statuses are unchanged. NG-15 is the scoped selector/edit/entry operation; reinforcement-options remains open for the missing automatic default.
