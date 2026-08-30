# Operable UI work breakdown

The UI milestone consumes `GameSession`; it does not own rules or mutate authoritative state. Each study step produces one document before its implementation gate is accepted.

| Step | Study output | Implementation proof |
|---|---|---|
| U0 | `docs/ui/00-scope-boundaries-and-acceptance.md` | Scope, dependency boundary, exit criteria |
| U1 | `docs/ui/01-shell-typography-and-accessibility.md` | Responsive shell, keyboard focus, 13px text floor |
| U2 | `docs/ui/02-session-bootstrap-and-lifecycle.md` | Synthetic bootstrap, start, pause, resume |
| U3 | `docs/ui/03-hex-map-pan-and-zoom.md` | Deterministic SVG map, pan, zoom, reset |
| U4 | `docs/ui/04-counter-and-stack-inspection.md` | Projected counters, redaction, stack inspection |
| U5 | `docs/ui/05-legal-action-and-explanation-flow.md` | Families, candidates, drafts, explanation, dispatch |
| U6 | `docs/ui/06-pending-decision-flow.md` | Blocking decision dialog through Gameplay coordinator |
| U7 | `docs/ui/07-history-save-load-and-checkpoints.md` | Timeline, save/load, checkpoints, undo |
| U8 | `docs/ui/08-hotseat-privacy-and-recovery.md` | Privacy lock and confirmed handoff |
| U9 | `docs/ui/09-browser-playthrough.md` | Local browser smoke and responsive inspection |
| U10 | `docs/reports/U10-operable-ui-gate.md` | Automated and manual integration gate |

Random map/OOB, scenario editing, AI, multiplayer networking, and packaging are later milestones.
