# Attack supply declared with the attack (9.5, 12.10a)

- Part A New Game: Axis attack, 20×14, Compact, 3 divisions (1 armored), no air, 3 turns, seeds {"map":9101,"oob":9102,"deployment":9103,"rules":9104}
- Part A Axis Movement: I/3 Pz Bn / 2.Pz → 1509; II/3 Pz Bn / 2.Pz → 1509; vBohm Recon KG / 2.Pz → 1509, next to 1409
- PASS CMB-SUP: A fresh New Game reaches a Combat Segment with an attack target — observed: Turn 1 / 3, Axis player turn, Combat; 1 targets
- Part A plan for 1409 (976 ms): ☑ 1. I/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (25T there); ☑ 2. II/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (24T there); ☑ 3. vBohm Recon KG / 2.Pz 1509 — Supply: 1T from the dump at 2008 (23T there)
- PASS CMB-SUP: Each ticked attacker shows its declared combat supply in the plan before Declare — observed: ☑ 1. I/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (25T there); ☑ 2. II/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (24T there); ☑ 3. vBohm Recon KG / 2.Pz 1509 — Supply: 1T from the dump at 2008 (23T there)
- PASS CMB-SUP: A unit with SP in reach is not offered internal stocks — observed: ☑ 1. I/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (25T there); ☑ 2. II/3 Pz Bn / 2.Pz 1509 — Supply: 1T from the dump at 2008 (24T there); ☑ 3. vBohm Recon KG / 2.Pz 1509 — Supply: 1T from the dump at 2008 (23T there)
- screenshot 01-fresh-game-attack-plan.jpg
- Part A prompts after Declare: Allied commander (after hand-over): Defending 1409: 2T of combat supply still to pay. Choose where it comes from. / Allied commander: Choose the terrain in 1409 that modifies your defense and sets the Combat Table line. / Axis commander (after hand-over): Attacker option 1: take it as step losses, retreat, or both. / Allied commander (after hand-over): Defender option 1: take it as step losses, retreat, or both.
- PASS CMB-SUP: After Declare the attacker is not asked for its supply again — observed: 4 prompts, none to the attacker about supply
- Part A combat summary: 
- screenshot 02-fresh-game-attack-resolved.jpg
- PASS CMB-SUP: The Game Turn with the attack finishes — observed: Turn 2 / 3, Axis player turn, First Player Phase
- Part B1 loaded: Turn 1 / 8, Allied player turn, Combat; attackers Oden TF / 4.A and Alanis TF / 4.A in 1612 with a 1T dump, I/33 Pz Bn / 9.Pz in 1712
- B1 plan as opened: ☑ 1. Oden TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☑ 2. Alanis TF / 4.A 1612 — Supply: Internal stocks (marked Low); ☑ 3. US Objective Garrison 1612 — Supply: Internal stocks (marked Low)
- PASS CMB-SUP: The first ticked unit draws the 1T in reach; internal stocks are not offered to it (12.10a) — observed: ☑ 1. Oden TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☐ Alanis TF / 4.A 1612 — Would use: Internal stocks (marked Low); ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low)
- PASS CMB-SUP: The unticked unit shows it would have to use internal stocks — observed: Would use: Internal stocks (marked Low)
- PASS CMB-SUP: Ticked second, it declares internal stocks; the plan says one unit is on internal stocks — observed: ☑ 1. Oden TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☑ 2. Alanis TF / 4.A 1612 — Supply: Internal stocks (marked Low); ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low); Strength 42 : 6 Odds 7:1 (open) If defender withholds supply 14:1 AR DRM 4 − 5 = -1 Your supply cost 2T · 1 on internal stocks
- screenshot 03-short-first-dump-second-internal.jpg
- PASS CMB-SUP: Unticking the first moves the 1T to the second, whose internal option disappears — observed: ☑ 1. Alanis TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☐ Oden TF / 4.A 1612 — Would use: Internal stocks (marked Low); ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low)
- PASS CMB-SUP: Ticked again, the first unit comes second and is left internal stocks only — observed: ☑ 1. Alanis TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☑ 2. Oden TF / 4.A 1612 — Supply: Internal stocks (marked Low); ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low)
- screenshot 04-short-reordered.jpg
- B1 prompts after Declare (441 ms): Axis commander (after hand-over): Defending 1712: 1T of combat supply still to pay. Choose where it comes from. / Allied commander (after hand-over): 1712 is vacant: choose attackers to advance after combat, one at a time or all together.
- PASS CMB-SUP: After Declare the attacker is not asked for its supply; the defender decides after a hand-over — observed: Axis commander: Defending 1712: 1T of combat supply still to pay. Choose where it comes from. / Allied commander: 1712 is vacant: choose attackers to advance after combat, one at a time or all together.
- screenshot 05-short-resolved.jpg
- PASS CMB-SUP: The unit that used internal stocks is marked Low; the one that drew SP is not — observed: Oden TF / 4.A: Internal stocks Low; Alanis TF / 4.A: no marker
- screenshot 06-short-low-marker.jpg
- PASS CMB-SUP: With the 1T taken, the Exhausted unit cannot be ticked and the plan says why (12.10c) — observed: ☑ 1. Oden TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ⊘ Alanis TF / 4.A 1612 — Needs 1T but no SP is in reach after the units above, and its internal stocks are Exhausted (12.10c).; ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low)
- screenshot 07-exhausted-blocked.jpg
- PASS CMB-SUP: Ticked first, the Exhausted unit draws the 1T and the other uses internal stocks — observed: ☑ 1. Alanis TF / 4.A 1612 — Supply: 1T from the dump at 1612 (1T there); ☑ 2. Oden TF / 4.A 1612 — Supply: Internal stocks (marked Low); ☐ US Objective Garrison 1612 — Would use: Internal stocks (marked Low)
- screenshot 08-exhausted-first.jpg
- PASS CMB-SUP: The attack declares and resolves without asking the attacker for supply — observed: Axis commander: Defending 1712: 1T of combat supply still to pay. Choose where it comes from. / Allied commander: 1712 is vacant: choose attackers to advance after combat, one at a time or all together.
- PASS CMB-SUP: Game Turn 1 of the test position ends — observed: Turn 2 / 8, Axis player turn, First Player Phase
- PASS CMB-SUP: No browser console or page error during the run — observed: 0 errors

Ended at: Turn 2 / 8, Axis player turn, First Player Phase

Console/page errors: 0

