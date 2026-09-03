# U10 rework — Play-first generated operation

Status: **REOPENED / IN PROGRESS (2026-09-01)**.

## Study output

The `bcsEngine` reference keeps one fixed command sidebar and gives the remaining viewport to the map. Its scenario builder uses a meaningful two-stage interaction: build a combined preview, then apply it. OCS adopts that interaction shape without copying BCS components, rule state, styling, or its sub-13px typography.

```text
Configure New Game
  -> prepare one deterministic Map + OOB + Deployment package
  -> inspect graphical map, formations, metrics, warnings
  -> Start this operation
  -> mount that request as the active Gameplay session
  -> play legal actions
  -> authoritative Game End
```

The active shell is therefore one command deck plus one dominant theater. Disabled action families are not rendered as clutter. History and recovery tools are collapsed until needed. On narrow screens, the map remains above the command deck rather than being squeezed between rails.

## Visual map contract

- No per-Hex terrain-name text.
- Clear, woods, rough, mountain, marsh, and water use distinct color/texture combinations.
- Roads, rivers, settlements, strategic regions, objectives, and counters have separate vector marks and remain visible above terrain.
- Hex coordinates are secondary and appear on hover/selection; accessible Hex labels always retain the terrain name.
- All visible text remains at least 13px.

## Acceptance evidence required before DONE

- Automated contract proves the combined preview uses the prepared Map, OOB, and deployment and that standalone laboratories are absent.
- Changing an option invalidates Start; rebuilding restores a combined preview.
- Starting the preview mounts the matching generated operation and replaces the map/counters/session together.
- Desktop and narrow browser captures show a map-first layout, readable actions, graphical terrain/features, no horizontal overflow, no console errors, and no rendered text below 13px.

The visual and preview/mount conditions are recorded, but the play condition is not. A Large-OOB browser run stalled at Turn 1 `REINFORCEMENT`; full-turn acceptance is tracked in `docs/quality/02-game-flow-acceptance-correction.md`.
