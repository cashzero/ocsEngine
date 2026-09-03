# M8 orthogonal seed sweep

Status: PASS.

The automated sweep starts from `DEFAULT_NEW_GAME_REQUEST` and changes one seed at a time.

| Case | Required change | Required preservation | Result |
|---|---|---|---|
| Map seed | generated map | generated OOB | PASS |
| OOB seed | generated OOB | generated map | PASS |
| Deployment seed | Piece runtime locations | generated map and OOB | PASS |

The sweep compares canonical JSON, so success is structural rather than a UI-label comparison. It is exercised by `sweepGameFlowSeedOrthogonality` and `tests/game-flow/new-game-flow.test.ts`.

