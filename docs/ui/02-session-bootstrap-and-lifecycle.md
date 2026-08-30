# U2 — Session bootstrap and lifecycle

## Study result

The browser boot path constructs the reviewed synthetic scenario, memory Gameplay ports, two stable seat bindings, and the OCS ground/logistics rule configuration. It then creates one READY session.

The UI exposes Start and Pause/Resume only when the matching transition is valid. Lifecycle and revision are rendered from `SessionMetadata`; phase, segment, turn, and acting player are rendered from the current viewer projection. Session notifications cause a fresh projection rather than local state patching.
