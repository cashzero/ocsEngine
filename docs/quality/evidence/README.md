# Acceptance evidence

Each folder holds the text record of one acceptance run: what was run, on which commit, with which inputs,
what was expected and observed, elapsed times, console errors, and the final revision or phase.
The records are immutable; a re-run gets a new folder.

## What is committed

- `README.md`, `RUNS.md`, `log.md`: how the run was produced and what it observed.
- `results.json` and other small JSON records (under 200 KB).
- Small analysis scripts that belong to one run and are not reused.

## What is not committed

Screenshots, traces, compressed match logs, and large saves or replays. Acceptance scripts write them to the
gitignored `artifacts/` folder; they are reviewed there and then copied into the run's text record only as
observations. Reusable acceptance scripts live in `scripts/`, not here.

Runs recorded before 2026-10-14 also stored their screenshots, match logs and large saves in this folder.
They were removed from the working tree; the files are still in git history at commit `6b78e1a`:

```sh
git show 6b78e1a:docs/quality/evidence/<run>/<file> > <file>
git restore --source 6b78e1a -- docs/quality/evidence/<run>   # a whole folder, then do not commit it
```

Text records that still name such a file refer to that commit.
