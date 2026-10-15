# Operable UI work breakdown

Status: **IN PROGRESS**. U10 (the operable UI gate) stays open while printed-counter fidelity
(`docs/roadmap/17-counter-fidelity-wbs.md`), session persistence (SES-09), keyboard traversal (UI-05) and the other
non-`PASS` rows of `docs/quality/03-product-operation-verification-plan.md` remain.

The UI milestone consumes `GameSession`; it does not own rules or mutate authoritative state. Current behavior is
described in `docs/ui/`; this plan only tracks the steps.

| Step | Scope | Described in |
|---|---|---|
| U0 | Scope, dependency boundary, exit criteria | `docs/ui/overview.md` |
| U1 | Desktop shell, keyboard focus, text floor | `docs/ui/overview.md`, `docs/ui/command-deck.md` |
| U2 | Session bootstrap and lifecycle | `docs/ui/overview.md` |
| U3 | Map, pan, zoom | `docs/ui/map.md` |
| U4 | Printed OCS counters, projected state and redaction, preview-to-map continuity, stack inspection — **IN PROGRESS** (counter fidelity) | `docs/ui/map.md`, `docs/roadmap/17-counter-fidelity-wbs.md` |
| U5 | Unit-centred actions, drafts, explanations, dispatch | `docs/ui/command-deck.md` |
| U6 | Pending decisions in the deck's task mode | `docs/ui/command-deck.md` |
| U7 | Log, save/load, checkpoints, undo | `docs/ui/overview.md` |
| U8 | Privacy lock and confirmed hand-over | `docs/ui/overview.md` |
| U9 | Browser operation | `docs/quality/03-product-operation-verification-plan.md` |
| U10 | Integration gate: every P0 row of `03` sections A–E `PASS` | `docs/quality/03-product-operation-verification-plan.md` |

Random map/OOB, scenario editing, AI, multiplayer networking, and packaging are later milestones.
