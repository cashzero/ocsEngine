# Frozen exploratory movement metric comparison

The original research question is which earlier mechanism metric predicts a
policy change's VP effect on different map seeds. Tooling completion is not the
research outcome. This batch must reach numerical comparisons and retain failed
candidates. All old P8 final outcomes have been inspected; this is retrospective
exploration and cannot qualify a final predictor without later independent data.

## Cohort and regeneration

Use exactly80 existing P8 games,40 seat-swapped pair records. Families are
crowding, contactBad, outOfSupply, progressObjective and hqWithArmy, both half and
double directions. These cover mechanisms relevant to the observed movement
conditions and were chosen with historical P8 results already known. They are
not a random or confirmatory sample of policy changes. Use the two numerically
smallest map seeds in each of TEMPERATE_INLAND and EASTERN_EUROPE. cohort.json
freezes the complete source identities and old outcomes. No new seeds or maps.

Start each game at its exact saved initial snapshot, with fresh phase memory,
recorded policies/weights and policy RNG seeds. Every accepted action must equal
the historical accepted action at the same index and the final hash must match.
A mismatch excludes no game silently. Stop before scoring, diagnose it and record
the failed compatibility assumption. First regenerate one complete source game as
the throughput and identity checkpoint before starting the batch.

## Candidate data and features

Observe only reports whose pre-action gameTurn is less than4. Keep true player,
role, assigned target, actual objective IDs in scored MOVE_PIECE paths after the
origin, and comparative stay terms. All candidate groups and visited supply
checks contribute; do not treat absent checks as refusals or paths as fully legal.
Store a hash of every report and compact per-group objective counts/witnesses.
Full candidate payloads need not be retained for the80game panel; scripts and
source/trajectory identities make them reproducible. Raw per-group outputs stay
in artifacts. This is a compact measurement, not a claim of archived full traces.

For each player/objective/gameTurn1..3, accumulate observed route and group counts
and boolean score-crossing witnesses. Include a candidate only if that objective
was not controlled by the player in the actual pre-decision state. Every feature
uses the fixed denominator3 times total configured objective points per player.
Sum a window's objective points times its diagnostic value, then divide by that
denominator. This is observed pressure per configured VP window, not a probability
over unobserved legal opportunities. A missing report produces no observed signal,
not a claim that the opportunity is impossible. Keep groups/queries/truncation and
target-window coverage as diagnostics so null signals can be explained.

Registered candidate diagnostics are:

1. Route supply refusals, the count of actually refused candidate paths.
2. Exhausted objective groups, count of groups with at least one improving path to
   this objective, all such paths actually checked and refused. Unknown paths do
   not count as exhausted.
3. Score-blocked window, indicator that scored paths were observed but none ever
   exceeded the same unit's stay score within the window.
4. Crowding crossing window, indicator of a path not above stay becoming strictly
   above stay after deleting the crowding term from BOTH candidate and stay.
5. Exposure crossing window, the corresponding exposure-term indicator.
6. Supply correction budget count, eligible objective paths not actually checked
   for correction because of the twelve-candidate budget.

Repeated score terms are summed. Crossings use retained terms and the strict
zero-margin boundary. Diagnostic3 is absent if any observed path later beats stay.
Each window's boolean diagnostics count once regardless of repeated decisions.
Refusal/group/budget counts intentionally preserve their different populations.
The first comparison directly tests whether group exhaustion predicts better than
raw route refusals. Crossing indicators measure arithmetic pressure only.

Before any extraction, independent review accepted a secondary companion set
using the same six diagnostics and denominator. A candidate is linked when its
path enters the objective OR the actual assignedTarget is that configured
objective and the destination is strictly closer than origin by the declared
engine's hexDistanceBetween. Deduplicate the two bases per candidate/objective.
Keep path-only and approach-union diagnostics separately, all twelve models.
Assignment/report frequency depends on policy and does not establish exogenous
opportunities or causal blockage. No role/purpose search after results.

Exact score term IDs are crowding and exposure, with all other safety terms kept
separate. Supply refusal means finalSupply EVALUATED and !preserved, never a
failed correction probe. Correction budget means CORRECTION_BUDGET only.
The pre-decision state must be cached before runner.step because onDecision
publishes after dispatch. Use that cached holder for initially-unowned filtering.

Per game, take each diagnostic from the variant player's side minus the opponent's
side. Average the opposite-seat games to produce one pair value, just as P8 does.
Pair final outcomes and historical early VP/M1/M2 retain their original definitions.
No raw group or objective row is an independent policy-effect observation.

## Prediction and scoring

Four oriented splits choose one of the two seeds from each climate for development
and the other for evaluation. For each held family, fit on the other eight variants'
development-seed means. Predict each held variant's evaluation-seed mean final VP
using only its DEVELOPMENT early data. No evaluation-seed feature or final outcome
enters calibration or prediction. Both directions of the held family stay out.

Compare zero effect, direct historical M0/M1/M2 predictions, fitted VP alone and
fitted VP plus each of the six diagnostics one at a time. Use standardized ridge
penalty1 on the extra diagnostic, unpenalized intercept and VP coefficient;
standardization/zero-variance handling use training variants only. Also report
each diagnostic alone with standardized ridge1 and a training-mean baseline.
Center VP on its training mean and set its coefficient to zero when its training
variance is zero, so a constant VP predictor becomes the training mean. Freeze
these models; no hyperparameter, cutoff or role search in this batch.

The ridge objective is SUM squared training residuals plus one times the squared
standardized extra-feature coefficient. Standardization uses training-population
SD, not sample SD. Four splits yield40 dependent held-variant predictions. The
paired final margin is an oriented matchup contrast, not an absolute improvement
against a separately played standard-selfplay baseline. These clarifications come
from independent protocol review before any new feature-score calculation.
Climate-specific errors retain the same development-based prediction and replace
only the evaluation target with that climate's held seed. The historical early
models observe resolved GT4 WEATHER/FIRST_PLAYER state; these movement features
exclude all GT4 reports, a small temporal-boundary mismatch that remains disclosed.
The80 variant-labelled games contain65 distinct action trajectories; retain their
different weight-specific evaluations, and do not call them independent games.

Report MSE, MAE and bias for every model, overall and every climate/split/family.
The score unit is variant-effect VP, not individual acquisition. Rank diagnostic
additions by aggregate paired MSE difference from fitted VP. Keep every result and
zero/M1 comparisons. Repeated splits, five related families and four seed pairs
do not support a decisive population confidence interval or a reward/promote gate.
No p-value or pass label is planned. A best candidate remains a lead even if its
mean error is smaller. If no candidate beats VP and zero, explicitly reject the
current metrics and revise the mechanism using real counterexamples.

Controls require exact historical action regeneration, pre-GT4 feature cutoff,
term-deletion counterexamples, future-row changes leaving predictions unchanged,
held-family exclusion and row-order invariance. Retain actual route/group support,
feature variance and score errors so a null result cannot hide that the feature
never occurred. Next independent evidence is a separate registered batch, at most
80 games, after a candidate and mechanism warrant that cost.
