# Off-map air: browser evidence (2026-10-07)

Real Chromium (Playwright headless shell 1243) on the built application at 1920×1080, driven through
`scripts/product-acceptance/session.mjs`. The step scripts are in `*/steps/NNN.mjs`, and their results are next to them in `NNN.out`.

## `box2/` — acceptance evidence (AIR-OM5, NG-12): the airfield and its aircraft off the map

| Step | Operation | Observed |
|---|---|---|
| 001 | New Game, Situation **Axis attack**, Generate, Start; sweep the whole map with the keyboard cursor; open All units | Preview: "AXIS: Air forces: 4 aircraft, off-map airfield". **No hex** of the mounted map holds the airfield or any of its aircraft (sweep of all 768 hexes). The roster lists JG 300 Bf.109, JG 301 Fw-190d, KG 66 Ju.88 and KG 76 Ju.88 at "Axis off-map airfield · Active" |
| 002 | End the Movement Segment (confirm the units-not-moved prompt), Air tab, **Air Barrage**, first target 1612, tick all four aircraft, fly | The mission panel lists the four aircraft at "Axis off-map airfield". Result: "Air Barrage on 1612 flown. Flak: 7 (roll 6 +1), no effect. Barrage 21 … roll 8, -, no effect." The roster then shows all four at "Axis off-map airfield · Inactive" |
| 003 | Play on to Axis's Aircraft Refit Phase of Turn 2, refit | Panel: "Off-map airfield · refits every aircraft from its own stocks, no SP · no Active limit", with the four aircraft Inactive. "Refit 4" gives "Refit 4 aircraft at the off-map airfield, from its own stocks." |

0 page errors.

## Superseded runs (kept as history)

- `final/`, `counter/`, `counter2/` and `hint/` tested the first version, which placed the airfield in a hex on the attacker's
  map edge. The user pointed out that off-map air cannot be on the map ("off map 怎麼在場內"), so that version was replaced
  by the off-map box above. The `hint/` fix (the Barrage Segment hint points to the Air tab when only aircraft can barrage)
  still applies.
- `box/`: the first run of the box version. Step 004 found the Air Barrage button disabled: the UI looked for flyable
  aircraft on the map only. The fix was in `controller.ts`, with the regression test `tests/ui/off-map-air.test.ts`; `box2/` re-ran it.
