# Capped VP defense development measurement

Source base: `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Candidate 72 versus
frozen standard 66 through candidate common engine/generator. Relative to rejected
candidate 71, the defense multiplier is capped at 1: below-average VP demand is
discounted, high-value demand cannot exceed standard 66. Immediate postcombat
reinforcement, execution order and all supply guards remain standard 66 behavior.

Inputs: 32 known games; eight turns; 32×24; six divisions/two armored per side;
no air/air transport. Meeting Temperate 1300000–1300007, Eastern 1300100–1300107;
Axis Attacks Temperate 1300200–1300207, Eastern 1300300–1300307. Swapped seats on
identical map/OOB/deployment/rule seeds for each pair.

Expected: complete legal replay and zero supply violations, with positive VP
signal to justify a separate independent batch. Observed 349–315 VP (+34), meeting
+28, attack +6; subgroups +26/+2/+2/+4. Mean per-game paired difference +1.0625,
mean ±2.1SE [−0.1265023391, 2.2515023391]. This development signal is not promotion
acceptance; the interval includes zero and the seeds are known.

All 32 finish turn 8/COMPLETE, no errors/rejections, replay final hashes identical,
ordinary and strict supply violations zero. All 44 candidate Regular advances and
six successful Overruns actually funded. Full quality 743 passed/eight skipped,
typecheck/build/smoke succeeded, full suite duration 157.91 s. Delivered source and
build hashes match the freeze; verification ran before any promotion commit.
Decision: freeze the unchanged candidate for a fresh fixed independent 80 games.

Commands: `quality.py <candidate freeze>`, `batch.py <candidate> <baseline>
development`, `verify.py <candidate> <baseline> development --delivered`, all in
`scripts/ai-promotion/`. Individual check commands/durations/hashes in JSON.
Raw saves/traces/logs/audits under ignored `artifacts/ai-vp/candidate-72-development/`.
No UI operation acceptance status changes.
