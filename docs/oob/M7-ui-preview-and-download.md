# M7.8 UI preview and download

The original M7 delivery exposed Random OOB independently at `#random-oob`. That route was retired by the reopened M8/U10 integration gate because it did not prove deployment or active-game integration.

The current New Game flow controls scale, formations per side and uint32 OOB/deployment seeds, then shows both force packages beside the generated map and deployment metrics. **Start this operation** is unavailable until the combined package validates. Canonical OOB JSON remains covered at the generation API/serialization boundary rather than as a disconnected player workflow.

Allied and Axis columns display formation archetype, organic counters, and independent support/logistics. Counter summaries show combat/action/movement and artillery range. A note distinguishes synthetic normalized ratings from decoded VASSAL claims. Download emits the same canonical JSON available through the public API.

The dialog is responsive, stacking sides on narrow screens. All added text remains at or above the established 13px minimum. The UI does not imply deployment or playability; its header explicitly says deployment is separate.
