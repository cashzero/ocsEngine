# VP-weighted Movement defense development measurement

Source base: `716bac9d14a140df44f544e9e90c9b8d229ea2e4`. Frozen candidate 71
versus standard 66 through the candidate common engine/generator. Movement defense
requirements scale by objective VP / public map mean VP. Immediate postcombat
reinforcement, unit execution order and all supply guards retain standard 66 behavior.

Inputs: 32 known games, eight turns, 32×24, six divisions/two armored per side,
no aircraft/air transport. Meeting Temperate 1300000–1300007, Eastern 1300100–1300107;
Axis Attacks Temperate 1300200–1300207, Eastern 1300300–1300307. Every pair exchanges
seats on identical map/OOB/deployment/rule seeds.

Expected: legal complete replays, no guarded supply violations, and a positive VP
signal to justify independent evaluation. Observed: 330–334 VP (−4), meeting −16,
attack +12; subgroup deltas −8/−8/+8/+4. All 32 complete at turn 8/COMPLETE,
no errors/rejections, identical replay final hashes, zero ordinary/strict supply
violations. All 35 Regular advances and six successful Overruns actually funded.
Full quality: 743 passed, eight skipped; typecheck/build/smoke succeeded. Commands,
log hashes and durations are in the JSON records. No independent games started.

Paired divergence replay of Eastern meeting 1300100/1300101 finds the first fork
at revision 5, turn 1 Movement: candidate sends f1-combat-2 to garrison 4-VP 5,19;
standard sends it onward toward enemy 3-VP 19,22. The friendly objective already
has strength 15 against estimated threat 6.18916; mean objective VP is 2.
The phase plan reserves additional units using the amplified defense demand.
Standard captures 19,22 at turn 8/revision 588. This motivates capping demand at
standard 66 levels; a first fork alone does not prove the entire final VP cause.
Attack pair 1300204/1300205 also diverges when discounting a below-average 3-VP
objective, so the proposed cap still needs measurement.

Decision: reject candidate 71 and separately measure capped defense scaling.
Raw logs, saves, traces, divergence reports and audits remain ignored under
`artifacts/ai-vp/`. Frozen-only verification; no UI acceptance status changes.
