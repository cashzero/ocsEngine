# Current failure confirmation

Run: 2026-10-15, Asia/Taipei. Base commit `eca3a07f6e84c25550f4f631f2422d01d91d57ea`
plus working-tree changes identified by `fingerprints.json`. `npm run build` exited 0 before the run.
Playwright Chromium, actual built application, 1680×1050. No product code changed in this confirmation.

Reproduce with `node scripts/product-acceptance/run-fail-confirmation.mjs artifacts/fail-confirmation`
after building; choose a fresh artifact directory on a rerun. The runner exits nonzero only on an
unexpected execution error; the two FAIL results are deliberate observations of the product criteria.
All actions use visible controls, native download events and actual browser reload. Downloaded saves
are read solely to compare authoritative hashes, actions and revisions.

## SES-09

Expected: recovery is explicit during setup and active play; no silent state substitution.

Setup: change New Game width to 20, leave dialog open and reload. The address retains `#new-game`
and reopens Settings, but width resets to 32. Reload to usable Settings took 6,413 ms.

Active: configure 16×12 / COMPACT / 2 divisions / 1 armored / no air / 2 turns,
seeds 7101/7102/7103/7104; preview and start the same package. Select Brown TF / 7.A and change
Combat→Move legally. Downloaded save: revision 1, one accepted action, hash
`sha256:676178a9d211b92007def979b5221a72736cff0b58b0f38b83b0a49d156e130e`.

Reload: silently starts the default 32×24 / 6 divisions / 2 armored / 8 turns, seeds
206569473/206569474/206569475/206569476. Menu unit count changes 28→52; revision 1→0,
actions 1→0, hash becomes
`sha256:fd8ef086fedab7ea5eaa50a0c03530d194627f34ad87f2a74a0bcc638757e2d4`.
No browser dialog, warning, recovery banner or offer; localStorage/sessionStorage both empty.
Reload to usable game took 5,596 ms. **Observed result: FAIL**.

Source corroboration: `src/ui/browser.ts` bootstraps a new default operation with memory ports on
page load. It has no persistence/recovery or beforeunload handling. Manual downloaded saves remain
available, but this does not make the reload behavior explicit.

## UI-02

Expected: at 1680×1050, no clipped content, page overflow or whole-deck scrolling; map and commands reachable.

Configure the exact NG-07 package: TEMPERATE_INLAND / 18×12 / LARGE / 4 divisions / 2 armored /
no air / 3 turns, seeds 91001/91002/91003/91004. Preview, start, open All units.
`Chmbln TF (Det. 2) / 10.A` has 185 px content in 177 px available width. CSS uses nowrap and
ellipsis; the displayed name ends `... / 1…`. The full name is not visible in the row.
No page overflow, no whole-deck scrolling; map, phase and End remain reachable.
**Observed result: FAIL** because the name is clipped.

Source corroboration: `.roster-text` in `web/command-deck.css` uses `overflow: hidden`,
`white-space: nowrap` and `text-overflow: ellipsis` within the fixed roster grid columns.

## Visual review and final state

Screenshots stay in ignored `artifacts/fail-confirmation/`:

- `03-active-before-reload.jpg`: Turn 1/2, Brown TF / 7.A selected at 0410 in Move mode,
  Undo available and the small configured map visible.
- `04-active-after-reload.jpg`: Turn 1/8, default larger map, no selection, Undo disabled,
  generic initial guidance and no warning/recovery message.
- `05-roster-clipped-names.jpg`: 10.A second row visibly truncates `Chmbln TF (Det. 2) / 10.A`;
  the name is cut while map controls and End remain visible.

Final state: NG-07 Turn 1/3, Allied Movement, roster open. Zero browser console/page errors.
`results.json` records two FAIL rows; `observations.json` holds the measured widths, hashes,
settings, storage, dialogs and visible state. No acceptance criterion was changed. Existing immutable
runs remain intact. This check confirms the two defects; it does not implement their fixes.
