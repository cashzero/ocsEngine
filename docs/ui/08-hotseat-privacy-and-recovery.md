# U8 — Hot-seat privacy and recovery

## Study result

Handoff is a two-step Gameplay operation. The active player begins handoff, which makes `getView` return `privacyLocked: true` and `projection: null`. A full-screen privacy cover then hides map, stack, decisions, and action details. Only confirmation with the opaque handoff token activates the next seat.

UI selection is cleared after handoff and after save load. Gameplay remains responsible for token validation, active-seat ownership, fault isolation, and deterministic recovery.
