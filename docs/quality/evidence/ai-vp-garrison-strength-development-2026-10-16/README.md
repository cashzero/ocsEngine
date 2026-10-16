# Actual garrison strength development measurement

Base `716bac9d14a140df44f544e9e90c9b8d229ea2e4`; immutable candidate 73 versus
standard 66 on the common candidate engine/generator. Preserve baseline defense
demand, minimum count and upper count cap; stop extra GARRISON promises once the
actual assigned strength satisfies baseline demand. Count after RESUPPLY overrides.
The earlier candidate-73 freeze was not quality-checked or matched; candidate-73-plan
is the measured source, correcting when assignment strength is counted.

Inputs: 32 known games, 32×24, six divisions/two armored per side, no aircraft/air
transport, eight turns. Meeting Temperate 1300000–07/Eastern 1300100–07; Axis
Attacks Temperate 1300200–07/Eastern 1300300–07. Identical map/OOB/deployment/rules
within every swapped-seat pair. Expected legal replays, no guarded supply violations
and positive VP signal to justify independent evaluation.

Observed 329–335 VP (−6), meeting +4 and attack −10; subgroups +4/0/0/−10.
All 32 legally finish turn 8/COMPLETE, zero errors/rejections, identical replay hashes,
zero ordinary/strict supply violations. All 44 candidate Regular advances and six
successful Overruns actually funded. Full quality 743 passed/eight skipped,
typecheck/build/smoke successful, full suite 157.20 seconds. Commands, durations,
log hashes and source/build/test hashes in JSON. No independent games registered.
Decision: reject and restore standard defense planning. These measurements do not
close any UI operation acceptance row. Raw logs/saves/traces/audits stay ignored
under `artifacts/ai-vp/candidate-73-plan-development/`.
