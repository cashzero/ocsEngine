# AEP operation evidence — 2026-10-13

AEP-specific player workflow verified on the built application; overall product/regression gate remains IN PROGRESS.
Working tree based on `894eac2a2b6c03b9c1db31e8267515e1d7fe084b`, including the user's existing replacement/roster changes.
Run: `npm run build`, `node scripts/air-acceptance/run-aep.mjs`, Playwright Chromium, 1920×1080.

## Acceptance and observations

- First New Game: 16×12, TEMPERATE_INLAND, COMPACT, 1 division / 0 armored, Air None,
  seeds 13101/13102/13103/13104. Preview badges at Allied 0107 / Axis 1607. Generate 597 ms, mount 174 ms.
- Second New Game: 24×18, TEMPERATE_INLAND, STANDARD, 2 divisions / 1 armored, Axis attacks,
  Air STANDARD, transports STANDARD, September, eight turns, seeds 13201/13202/13203/13204.
  Attack scaling produces Allied 2 / Axis 3 divisions. Generate 714 ms, mount 783 ms.
- Preview and mounted map carry the same Allied 0110 / Axis 2410 AEPs. Actual screenshot inspection
  confirms airplane/AEP badges on both edges, separate from S discs; Hide units and three visible zoom-out
  clicks reveal the entire map. Keyboard hover announces each AEP's owner and range starting there +1 hex.
  Preview and mounted evidence: `final/03-attack-preview.jpg`, `final/04-mounted-first-aep.jpg`,
  `final/05-mounted-second-aep.jpg`.
- Axis Movement Barrage: plan shows AEP 2410, target 1611. Explicitly deselected every on-map aircraft;
  selected only JG 301 Bf.109 and JG 300 Fw-190a in the Axis off-map box. Plan screenshot:
  `final/06-off-map-barrage-plan.jpg`. Enemy interception prompt names only these two aircraft;
  real handoff to Allied, choose Do not intercept, hand back to Axis. Flak 9, no effect; barrage roll 7,
  no effect. Sortie including decisions/handoffs and scripted settle delays: 3998 ms; this is a multi-action
  interval, not a single action latency measurement.
- Completed the entire first Game Turn through the visible phase controls, pending First Player choice,
  and hot-seat handoffs. Turn 2 Axis Aircraft Refit offers the two surviving off-map aircraft; actual refit
  says "Refit 2 aircraft at the off-map airfield, from its own stocks." 445 ms including scripted settle.
  Final phase: Turn 2 / 8, Axis Aircraft Refit Phase. Visible checkpoint created at revision 18:
  `final/09-final-revision.jpg`. Console/page errors: zero.
- No blocking player issue observed in the final AEP run. All other unexercised product operations retain
  their previous statuses; this is not acceptance of the full product matrix or every air operation.

`final/results.json` and `final/log.md` preserve inputs, observations, timings, decisions and errors.
The initial run's root-level screenshots/log/results are invalid evidence for an off-map sortie: the
initial script accidentally flew the default-selected on-map aircraft, then used a nonexistent Log
selector and failed. That run is retained as the evidence trail. The corrected final script explicitly
selects only aircraft whose visible location is the off-map airfield; root-level PASS labels do not
promote the off-map acceptance gate.

## Regression support and open debt

- Typecheck, build, smoke: passed.
- AEP rules/UI/map regression: 4 files, 38 tests passed. Rule tests verify missing-friendly-AEP refusal
  despite ground entries and an enemy AEP, no ground-entry shortcut, out-of-range refusal from AEP,
  correct transaction launch hexes, return-to-box, refit and serialization.
- Full suite: 583 passed, 2 failed, 8 skipped. Deployment-plan timeout passed when independently rerun
  (5 tests, 23.81 seconds for that file). No timeout threshold was relaxed.
- Existing `tests/rules/air-integration.test.ts` fails because the generated policy never performs
  REFIT_AIRCRAFT. Reproduced in an isolated `/tmp/ocs-aep-baseline-*` copy retaining the user's preexisting
  changes with the AEP generation lines removed and pre-change aircraft launch rules restored.
  It is unrelated to the AEP launch restriction, but the full regression gate is not PASS.
- TODO: restore the whole-generated-game air regression's required refit coverage without removing
  any refit/air-combat/replay expectations. Missing behavior: its automated generated action policy
  currently completes the game without refitting. User-visible impact: this regression cannot establish
  continued generated-game refit/replay coverage, although the actual AEP UI refit was exercised here.
  Closure evidence: original air-integration assertions all pass, plus the relevant generated UI sortie,
  refit and whole-turn acceptance remains reproducible.

Existing saved maps without explicit AEP features do not silently inherit ground-entry launch points.
Their off-map aircraft cannot launch until the scenario defines an AEP; new generated operations include
AEPs automatically. No old-save migration was added.
