# Artillery facility follow-up

## Scope and acceptance

Complete `bot-facility-barrage` and `barrage-empty-reason` from the artillery feature. Preserve the completed human
facility workflow, old saves and replays, and the existing combat-unit barrage policy.

- [x] The computer evaluates the actual Facility Table's six outcomes using public port capacity/damage, public base
  levels and visible aircraft. It chooses worthwhile port and base attacks, pays legal supply without destroying joint
  ration commitments, resolves them and replays to the same hash. Hidden aircraft and hidden counters cannot affect its
  choice. A zero-effect or uneconomic attack is declined and a better combat-unit attack can win the comparison.
- [x] The mounted UI names out-of-range, unavailable supply, artillery already fired and target hex already barraged
  accurately in both the phase hint and Targets. A mixed position with another legal target must remain operable.
  No hidden enemy identities or counts enter the diagnostic query.
- [x] Operate the computer's port and base attacks through the mounted application, including payment, displayed results,
  save/replay, screenshots and console checks. Repeat the changed New Game preview/start and a complete turn.
- [x] Run full typecheck, regression suite, build and smoke checks. Review the
  integrated diff independently before removing either TODO.
- [x] Update owning topic documents, acceptance rows and immutable evidence. Keep unrelated gates unchanged.

## Work sequence

- [x] `how` over the affected subsystem.
- [x] `architect` for parallel design exploration. Separate FacilityForecast from the ground forecast; derive typed
  availability reasons in the rule query instead of reconstructing legality in the UI.
- [x] Write the throughput checkpoint as four todo items.
  - Blocking first steps. Freeze the pre-change implementation and define acceptance before writing the new behavior.
  - Independent workstreams. Separate AI valuation and UI diagnostics owners; parent owns browser operation and acceptance.
  - Shared mutable state. Each writer has an isolated Git worktree; parent integrates patches. Engine imports merge once.
  - Smallest safe decomposition. Keep each feature's rules/query/UI or forecast/policy/tests under one writer.
- [x] Delegate code-writing to a subagent using your configured feature model.
- [x] Verify on the matching surface.
- [x] Rebase into small, ordered commits. Skip PR publication because none was requested.
- [x] If the design is contested, `interrogate` before shipping. No contested design at grounding.
- [x] Run **Opening a PR**. Skip because no PR was requested.

## Verification boundary

The user excludes an 80-game comparison from this feature task. Acceptance requires the actual port/base computer
workflow, diagnostics, public-information and supply behavior, save/replay, full quality checks and independent review.
This adds facility targets to the existing heuristic without claiming a stronger general strategy or promoting a new
standard-policy version. The independent strategy-promotion gate in `docs/ai/evaluation.md` remains unchanged.
The cancelled partial batch is retained only as an evidence record and cannot count as a passed gate.

## Verification

The owning acceptance rows are ACT-19 and BOT-12 in [the product operation plan](../quality/03-product-operation-verification-plan.md).
The [diagnostic evidence](../quality/evidence/artillery-main-2026-10-16/README.md) records both UI viewports.
The [computer evidence](../quality/evidence/artillery-main-2026-10-17/README.md) records the current default candidate's
UI operation, reviewed screenshots, source hashes, quality checks and independent rebase review.
