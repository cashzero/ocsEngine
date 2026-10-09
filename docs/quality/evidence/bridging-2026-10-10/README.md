# Engineer bridging: browser evidence (2026-10-10, NG-14)

Real Chromium (Playwright) on the built application at 1920×1080, driven by `scripts/bridging-acceptance.mjs`. Every step is a
click, key press or selection on the page; every check reads the page (`log.md`, `results.json`). Result: **11/11 PASS, 0 page errors**.

New Game: Situation **Axis attack**, 24×16, Compact, 3 divisions (1 armored), no air forces, 3 turns, September, seeds map 8911 /
OOB 8912 / deployment 8913 / rules 8914. The Axis engineer (Ge Pi Bde 508) starts in Move Mode at 2114 (Antdorf), on a river.
Its HQ stands with it.

| Step | Observed | Screenshot |
|---|---|---|
| Axis Movement, Turn 1 | No bridge drawn (engineer in Move Mode) | |
| Tank at 2113 (Ge 506 Tgr Bn), fueled | Hover 1915: "out of reach" | |
| Engineer → Combat Mode (Unit tab, Mode) | Bridges drawn 2114→2213, 2114→2014, 2114→2113; BRIDGE status mark "Bridging: 3 river hexsides at this hex (13.8b)…"; hover 2114 "your engineer bridges 3 river hexsides here (Minor River: no extra MP) for your units moving in or out; not for overruns" | `01-engineer-status.jpg`, `02-bridges-on-map.jpg`, `close-bridges.jpg` |
| Tank at 2113 again | Hover 1915: "4 MP, 0 left · reachable"; moved there over the bridge (2113→2114→2014…), Confirm 535 ms | `03-move-across-bridge.jpg`, `close-tank-across.jpg` |
| Rest of Game Turn 1 | "Turn 2 / 3, Allied player turn, First Player Phase" | |
| Axis Movement, Turn 2 | The 3 bridges are still drawn (engineer still in Combat Mode); engineer → Move Mode: no bridges | `04-bridge-removed.jpg`, `close-bridge-removed.jpg` |

Observations recorded from this run:

- An earlier run (seed 8902, before main's "Engineers start in the rear by their HQ, in Move Mode") drew the planks under the
  counters. With units on both banks only slivers showed. The planks are now drawn over the counters and are smaller.
- In this run the two upper planks of 2114 lie over the top corners of the engineer's own counter, beside its size mark.
  No printed value is covered. Not blocking.
- That 8902 run also showed the unbridged price on the same seed after the rebase: the tank at 2008 paid "4 MP" for the
  Minor River crossing that cost 2 MP with the bridge.
- The worktree had no `node_modules/lit-html` of its own. The local test server therefore served 404s until it was linked
  from the main checkout. That is an environment setup issue, not a product issue.
