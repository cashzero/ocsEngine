# Capped VP defense independent result

Source base `716bac9d14a140df44f544e9e90c9b8d229ea2e4`, immutable candidate 72
versus standard 66, common candidate engine/generator. The unchanged source and
build hashes and pre-match registration are in
[registration evidence](../ai-vp-defense-cap-registration-2026-10-16/README.md).
Candidate patch and full quality record are in
[development evidence](../ai-vp-defense-cap-development-2026-10-16/README.md).

Inputs and gates are exactly the pre-registration: fixed 80 games/40 exchanged-seat
pairs, eight turns, 32×24, six divisions/two armored per side, no aircraft/air
transport. Fresh indices 1301000–19/1301100–19/1301200–19/1301300–19. No games added,
pooled or replaced. No Mediterranean matches.

Observed: 770–700 VP (+70), meeting +88 (Temperate +74/Eastern +14), attack −18
(Temperate −12/Eastern −6). Paired mean +0.875, mean ±2.1SE
[−0.5891952699, 2.3391952699]. The attack and interval gates fail: reject candidate
72; standard remains 66. The positive total does not override those gates.

All 80 finish turn 8/COMPLETE legally, no errors or rejections, final replay hashes
match. Ordinary and strict supply violations zero. Candidate Regular advances
159: 158 funded, one allowed after the final Supply; 13 successful Overruns all
actually funded. Candidate losses 1003 versus standard 962. Full frozen quality
743 passed/eight skipped with typecheck/build/smoke successful. Match timings in
`timings.json`; quality commands/log hashes/durations in the linked development
record. Final verification is frozen-only because working source has moved on.
No UI operation acceptance status changes.

Paired first-divergence replay (both complete final hashes checked) finds:
- Temperate 1301204/1301205, revision 64, turn 1 Movement: standard reinforces
  3-VP −1,15; candidate hunts. Garrison strength 1, threat 2.092334, map mean VP
  3.428571. The discounted threshold falls below the token garrison strength.
- Eastern 1301308/1301309, revision 69: standard sends f1-recon to 1-VP 11,15;
  candidate hunts. Threat 16.275, map mean VP 2, existing strength 1. Later the
  candidate loses 4-VP 7,10; standard retains it. A first fork does not establish
  the sole cause of that later loss or prove every supply loss avoidable.

Next hypothesis restores standard defense requirements and stops redundant
reinforcement only after actual assigned strength reaches the original demand.
Raw logs/traces/saves/audits and divergence JSON remain ignored in `artifacts/ai-vp/`.
