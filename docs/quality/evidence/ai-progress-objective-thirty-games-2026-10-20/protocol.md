# Frozen thirty-game progressObjective comparison

Scope: only WESTERN TEMPERATE_INLAND, AXIS_ATTACKS,32x24,six divisions per
side,twoarmored,eightturns. Explicit --air NONE --air-transport NONE meansno
on-map airOOB; attack-scenario offmap aircraft canstillparticipate. Freeze current
standard heuristic progressObjective15 and candidatepartialoverride30 only.
No other coefficient, map, engagement, cutoff or policyversion changes.

Runexactly30newgames,15same-seed opposite-seat pairs. Start1800000, workers4.
Alliedcandidate/even and axiscandidate/odd. The15mapseedsgeneratedbyrunnerare
listed in registration. Existing summaries and played-seed ledger containnone.
This usage check covers available records, not deleted unledgered experiments.
No extra pilotgame; first completedpair is the throughput/identity checkpoint
inside this30. No optionalstopping, addedgames or silentexclusions.

Primaryquantity: for eachseed, mean of two candidate-minus-standard finalVP
margins. Report all15values,theirmean,sampleSE,min/max and positive/zero/negative
counts. If an interval is shown, use descriptive95percent Student-t withdf14
critical2.1447866879169273, under its sampling assumptions, not a promotiongate.
Report raw policy VP totals and pergame VPsignwin/tie/loss counts. Keepattack
and defense role descriptions inside this one existing engagement.

Secondary: summary all-cause STEP_LOST totals, candidatekills/opponentlosses,
candidatelosses/opponentkills and K-L, plus finalOOS descriptivecounts. These
headtohead counts are algebraically coupled; no separate independentKill/Loss
causal improvement claim. VP > Kill > Loss. Do not classify enemyOOS asstupidity.

Require all30FINISHED, no errors/rejections, expectedpairseeds, sameinitialhash
withinpair, final save/load replay hashchecks, exactinput/source/build identity.
Retain --trace saves for focused postmatch inspection and supplyaudits. Preserve
failures; do not silently count onlysuccessfulgames. No applicationcode changes
or UIacceptance claims. This30game exploratory comparison doesnot replace the
formal80game promotiongate and doesnot authorize a defaultweight/versionchange.
