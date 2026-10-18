#!/usr/bin/env python3
"""Pick the player turns whose near-term outcome the position metrics missed most (docs/roadmap/18-position-metrics-wbs.md, P3).

    python3 scripts/ai-position-residuals.py --manifest <manifest.json> --artifact-root . --validation <results.json> --out <cases.json>

For each outcome below, the metric is the one, among the metrics P2 adopted, whose baseline-plus-metric linear model had
the lowest out-of-fold MAE over all roles in the validation report; its ten-fold map-seed out-of-fold predictions are
recomputed here with the validator's own functions. In each role subset the 20 player turns with the largest actual
minus predicted value are kept (losses or gains the metrics did not foresee), ties broken by trajectory id, Game Turn
and player turn. The rule was fixed before the cases were looked at. Its first version took any metric and the mover's
objective VP gained; that picked mover.unitsWithReach, whose gain P2 traced to pooled roles, and duplicated the objective
VP lost (the same events seen from the other side), so it was changed before any case content was read.
"""
import argparse
import importlib.util
import json
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('validate', Path(__file__).with_name('ai-position-validate.py'))
VALIDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE)

OUTCOMES = ('combatStepsLost', 'objectiveVpLost', 'attritionNextTurn', 'moverObjectivesGained')
ADOPTED = {'objectiveVpAtRisk', 'objectivesAtRisk', 'payableObjectiveVpAtRisk', 'stacksExposedAllocated', 'supplyCuttable',
           'supplyBestCut', 'hqsInReach', 'mover.objectiveVpInReach', 'mover.payableObjectiveVpInReach',
           'mover.bestObjectiveEffectiveColumn', 'mover.localForceRatioAt2Hex'}
ROLES = ('attacker-moving', 'defender-moving', 'meeting')
PER_ROLE = 20


def best_test(report, outcome):
    candidates = [test for test in report['mapSeed10Fold']['all']
                  if test['target'] == outcome and test.get('scores') and test['metric'] in ADOPTED]
    if not candidates:
        raise ValueError(f'no evaluated test for {outcome}')
    best = min(candidates, key=lambda test: (test['scores']['baselinePlusMetric']['mae'], test['metric']))
    return best['metric'], best['baseline']


def out_of_fold(samples, outcome, metric, baseline):
    eligible = [i for i, row in enumerate(samples) if VALIDATE.numeric(row['metrics'][metric])
                and VALIDATE.numeric(row['metrics'][baseline]) and VALIDATE.numeric(row['outcomes'].get(outcome))]
    rows = [{**samples[i], 'y': samples[i]['outcomes'][outcome], 'index': i} for i in eligible]
    folds = VALIDATE.seed_folds(rows)
    predicted = {}
    for _, train_indices, test_indices in VALIDATE.grouped_splits(rows, folds):
        train = [rows[i] for i in train_indices]
        test = [rows[i] for i in test_indices]
        if not train or not test:
            continue
        for row, value in zip(test, VALIDATE.model_predictions(train, test, baseline, metric)['baselinePlusMetric']):
            predicted[row['index']] = value
    return predicted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--artifact-root', type=Path, required=True)
    parser.add_argument('--validation', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    games, _ = VALIDATE.load_games(args.manifest, args.artifact_root)
    by_id = {game['id']: game for game in games}
    samples = VALIDATE.samples_from_games(games)
    report = json.loads(args.validation.read_text())
    cases = []
    for outcome in OUTCOMES:
        metric, baseline = best_test(report, outcome)
        predicted = out_of_fold(samples, outcome, metric, baseline)
        for role in ROLES:
            ranked = sorted((i for i in predicted if samples[i]['role'] == role),
                            key=lambda i: (-(samples[i]['outcomes'][outcome] - predicted[i]), samples[i]['game'],
                                           samples[i]['gameTurn'], samples[i]['playerTurnIndex']))
            for rank, i in enumerate(ranked[:PER_ROLE], 1):
                row = samples[i]
                alias = by_id[row['game']]['aliases'][0]
                cases.append({'outcome': outcome, 'metric': metric, 'baseline': baseline, 'role': role, 'rank': rank,
                              'actual': row['outcomes'][outcome], 'predicted': round(predicted[i], 3),
                              'source': alias['source'], 'match': alias['match'], 'gameTurn': row['gameTurn'],
                              'playerTurnIndex': row['playerTurnIndex'], 'trajectory': row['game']})
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({'rule': __doc__.split('\n\n', 2)[2].strip(), 'cases': cases}, indent=1) + '\n')
    print(f'{len(cases)} cases written to {args.out}')


if __name__ == '__main__':
    main()
