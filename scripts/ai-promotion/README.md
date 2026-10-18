# VP promotion measurements

Use a frozen current standard as the opponent, through the candidate's common
engine and generator. The contract and acceptance gates live in
[AI evaluation](../../docs/ai/evaluation.md).

Raw worktrees, logs, saves, traces and audits belong under ignored `artifacts/`.
Do not modify a completed freeze or overwrite a previous quality or match run.
The policy version comes from the frozen source, independently of folder names.

1. `python3 scripts/ai-promotion/freeze.py artifacts/ai-vp/baseline --baseline`
   freezes the committed standard before editing the candidate.
2. After a real policy change, freeze it with `freeze.py <candidate directory>`.
   `quality.py <candidate freeze.json>` runs typecheck, the full suite and smoke
   against that immutable build. Build and source hashes are in the freeze.
3. `batch.py <candidate freeze.json> <baseline freeze.json> development` runs
   32 known games, then ordinary supply and owner-identified advance audits.
   `verify.py` with the same three arguments verifies the complete batch and
   writes `acceptance.json`. Known seeds guide development; they do not qualify
   a policy for promotion. Rejected policies and failed checks remain recorded.
4. Once development warrants independent evaluation, build the delivered source
   and run `register.py <candidate freeze.json> <baseline freeze.json> <start> --primary <vp|killLoss|supply>
   --margin <measure>=<per pair> ...`. It records the primary measure and the non-inferiority margins, gives the
   80 games to the engagements the development batch changed, checks unused match indices and writes a new,
   exclusive registration.
   Preserve this registration as text evidence before starting any independent game.
5. Run `batch.py ... independent`, then `verify.py ... independent --delivered`.
   Read its `vpGate`; the verifier records failed VP results without discarding
   their legal/hash/supply evidence. `gate` and `gateChecks` apply the registered primary measure and margins;
   `metrics` lists VP, Kill − Loss and Supply for the changed engagements. Never extend or pool a failed batch.

The full settings are explicit: 32×24, six divisions/two armored per side,
no aircraft/air transport, eight turns, two current styles and two engagements,
with exchanged seats on identical map/OOB/deployment/rule seeds.

`audit-advances.mjs` identifies candidate actions by actual player ID and verifies
their trace policy version; artifact labels cannot substitute for actor identity.
It replays all accepted actions, checks conservative regular-advance bounds,
records conditional Overrun funding, and retains trace/ration trigger mechanisms.
Those mechanisms do not establish intention or prove an avoidable mistake.
