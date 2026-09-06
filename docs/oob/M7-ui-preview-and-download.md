# M7.8 UI preview and download

Status correction (2026-09-04): the counter-preview claims below describe the retired
standalone M7 surface and are not accepted as evidence for the current integrated New
Game flow. The integrated preview currently shows formation summaries rather than unit
counters. Unit-level preview fidelity is reopened under
`docs/quality/04-counter-fidelity-correction-plan.md`.

The original M7 delivery exposed Random OOB independently at `#random-oob`. That route was retired by the reopened M8/U10 integration gate because it did not prove deployment or active-game integration.

The current New Game flow controls scale, formations per side and uint32 OOB/deployment seeds, then shows both force packages beside the generated map and deployment metrics. **Start this operation** is unavailable until the combined package validates. Canonical OOB JSON remains covered at the generation API/serialization boundary rather than as a disconnected player workflow.

The retired surface displayed Allied and Axis formation archetypes, organic counter
summaries, independent support/logistics, combat/action/movement values, and artillery
range. That text-card presentation did not reproduce OCS unit counters and cannot satisfy
the corrected gate. A note distinguished synthetic normalized ratings from decoded
VASSAL claims. Download emitted the same canonical JSON available through the public
API.

The dialog is responsive, stacking sides on narrow screens. All added text remains at or above the established 13px minimum. The UI does not imply deployment or playability; its header explicitly says deployment is separate.
