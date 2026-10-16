# Surviving attacker VP option development

Base `2528b6d2274b4d80b118670438e7dcdc7e7b596d`. Candidate 76 versus frozen
current standard 75 through one candidate engine/generator, retaining every standard
75 improvement. On unheld VP attacks, pay all option points as step losses if own
attackers survive; attacker-only projected steps are recomputed from state. Movement,
garrison, attack selection and advance supply guards are unchanged from standard 75.

Inputs: 32 known games/16 swapped-seat pairs; 32×24, six divisions/two armored,
no aircraft/air transport, eight turns. Meeting Temperate 1300000–07/Eastern
1300100–07; Axis Attacks Temperate 1300200–07/Eastern 1300300–07. Same map/OOB/
deployment/rule seed within each pair. Expected legal complete replay, zero guarded
supply violations and a positive VP signal worth independent registration.

Observed 331–333 VP (−2), meeting +2 and attack −4; subgroups −6/+8/−2/−2.
All 32 legal turn 8/COMPLETE, no errors/rejections, replay final hashes identical,
ordinary and strict supply violations zero. Full quality 751 passed/eight skipped,
typecheck/build/smoke successful; full suite 157.43 seconds. Detailed advance/Overrun
counts, commands and log hashes are in results.json. Frozen-only verification.
No independent games registered. Decision: reject before independent evaluation.

The new branch occurs 33 times: 2/6/5/5/5/4/2/4 in turns 1–8 respectively.
Twenty-nine early option payments motivated a separate final-player-only ablation;
this observation alone does not establish the sole cause of the −2 VP result.
Next candidate restricts the change to when no opposing turn remains.
The rebased main owns its 120 s movement-trace-gain test timeout; this candidate
retains it unchanged. No earlier correctness assertions are relaxed.
Raw logs/saves/traces/audits remain ignored under `artifacts/ai-vp/candidate-76-development/`.
No UI operation acceptance rows change.
