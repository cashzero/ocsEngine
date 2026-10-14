# U4 — Counter and stack inspection

Status: **REOPENED / IN PROGRESS** (2026-09-04).

The previous U4 evidence established projection, selection, stack inspection, and
redaction only. It did not establish that the rendered object was an OCS unit counter.
The 46×40 role/steps/mode rectangle is a knowingly reduced implementation and cannot be
reported as a completed counter gate.

The corrected scope and acceptance plan are in
`docs/roadmap/17-counter-fidelity-wbs.md`.

TODO (U4 counter fidelity): the missing behavior is a rulebook-structured, role-specific
unit counter driven by the current printed face and projected state. The player-visible
impact is that unit identity, type, affiliation, strength, Action Rating, MA/range, and
logistics values cannot currently be read from the map or preview. This TODO closes only
with CF0–CF5 evidence and CTR-01 through CTR-08 recorded against the integrated built UI.

## Preserved interaction evidence

Counters are rendered from projected stacks, not initial scenario piece state. Friendly pieces display name, mode, and remaining steps. Enemy projection policy is preserved: redacted counters say “Enemy unit,” and hidden stack members are represented only by a count.

Selecting a Hex opens its visible stack. Selecting a counter scopes movement candidate discovery through Gameplay's `pieceId` filter. Counter colors identify player ownership but all counters also have accessible text labels, so color is not the sole signal.

This evidence remains useful for the interaction/redaction sub-gate. It is not evidence
for printed counter fields, face orientation, role-specific counter templates, source
fidelity, or preview-to-mounted counter identity.
