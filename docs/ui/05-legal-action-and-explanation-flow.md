# U5 — Legal action and explanation flow

## Study result

The action rail follows the public query path:

1. `getActionFamilies(activeSeat)` supplies enabled command groups.
2. `getActionCandidates` supplies bounded, already validated actions.
3. `createDraft` plus `validateDraft` supplies current legality and explanation.
4. `dispatch` is the only authoritative action execution path.

The UI renders action and candidate summaries but never assembles domain actions. After dispatch it refreshes from the new revision, preventing reuse of stale candidates. Rejections are shown in an ARIA live status region.
