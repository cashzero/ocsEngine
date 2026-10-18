#!/usr/bin/env python3
"""Compare extended position proxies on identical held-out map-seed windows.

Requires a hashed recorder manifest accepted by ai-position-validate.py. This is
retrospective measurement research, not a policy evaluation or causal test.
"""
import argparse
import importlib.util
import json
from pathlib import Path


SPEC = importlib.util.spec_from_file_location('position_validate', Path(__file__).with_name('ai-position-validate.py'))
VALIDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE)
EXTRA_FEATURES = frozenset({
    'payableObjectivesAtRisk', 'payableObjectiveVpAtRisk', 'maxSingleStackExpectedLoss',
    'outOfTrace', 'dumpSpInReach', 'movingBestObjectiveEffectiveColumn', 'movingLocalForceRatioAt2Hex',
})
TESTS = (
    ('objectivesLost', 'payableObjectivesAtRisk', 'objectivesAtRisk'),
    ('objectiveVpLost', 'payableObjectiveVpAtRisk', 'objectiveVpAtRisk'),
    ('combatStepsLost', 'maxSingleStackExpectedLoss', 'stacksExposedAllocated'),
    ('combatStepsLost', 'stacksExposedAllocated', 'contact'),
    ('attritionStepsLost', 'outOfTrace', 'contact'),
    ('outOfTraceRise', 'supplyCuttable', 'contact'),
    ('spCapturedOrDestroyed', 'dumpSpInReach', 'contact'),
    ('objectiveVpLost', 'movingBestObjectiveEffectiveColumn', 'objectiveVpAtRisk'),
    ('objectiveVpLost', 'movingLocalForceRatioAt2Hex', 'objectiveVpAtRisk'),
)


def bucket(value):
    if value < 0:
        return 'no-opportunity'
    return 0 if value == 0 else 1 if value <= 1 else 2 if value <= 3 else 3 if value <= 7 else 4


def extended_predictions(train, test, baseline, metric):
    mean = sum(row['y'] for row in train) / len(train)
    median = VALIDATE.statistics.median(row['y'] for row in train)
    predictions = {'zero': [0.0] * len(test), 'trainMedian': [median] * len(test),
                   'trainMean': [mean] * len(test)}
    for name, features in [('baseline', [baseline]), ('baselinePlusMetric', [baseline, metric])]:
        predictions[name] = VALIDATE.VPCOMPARE.ridge_predict(
            train, test, features, penalty=1.0, outcome='y', baseline=baseline,
            allowed_features=VALIDATE.FEATURES)
    for name, feature in [('baselineBucketMedian', baseline), ('metricBucketMedian', metric)]:
        groups = VALIDATE.defaultdict(list)
        for row in train:
            groups[bucket(row['metrics'][feature])].append(row['y'])
        medians = {key: VALIDATE.statistics.median(values) for key, values in groups.items()}
        predictions[name] = [medians.get(bucket(row['metrics'][feature]), median) for row in test]
    return predictions


def run(manifest, root):
    VALIDATE.FEATURES |= EXTRA_FEATURES
    VALIDATE.model_predictions = extended_predictions
    games, audit = VALIDATE.load_games(manifest, root)
    samples = VALIDATE.samples_from_games(games)
    moving = {}
    for game in games:
        for row in game['rows']:
            metrics = row['metrics'][row['phasingPlayerId']]
            moving[game['id'], row['gameTurn'], row['playerTurnIndex']] = {
                'movingBestObjectiveEffectiveColumn': metrics['bestObjectiveEffectiveColumn'],
                'movingLocalForceRatioAt2Hex': metrics['localForceRatioAt2Hex'],
            }
    for row in samples:
        row['metrics'].update(moving[row['game'], row['gameTurn'], row['playerTurnIndex']])
    if len({row['mapSeed'] for row in samples}) < 2:
        raise ValueError('leave-one-map-seed-out validation needs at least two map seeds')
    report = {
        'scope': 'Exploratory retrospective comparison of unchanged metric implementations. No final-VP, policy improvement, physical-step accounting or causal attribution claim.',
        'sourceSha256': {str(path.relative_to(Path(__file__).resolve().parent.parent)): VALIDATE.digest(path.read_bytes())
                         for path in (Path(__file__).resolve(), Path(VALIDATE.__file__).resolve(), Path(VALIDATE.VPCOMPARE.__file__).resolve())},
        'design': {
            'window': 'Non-phasing O at start of P player turn, Game Turns 2-8 with a following row. Outcomes are those recorded during P turn. Moving features refer to P at the same start point.',
            'identity': 'Initial hash, final hash and canonical accepted-action sequence. All aliases and both policy seats of a map seed stay in one fold.',
            'split': 'Leave one map seed out within each role subset. No tuning, no feature selection from results.',
            'models': 'Zero, training median/mean, baseline ridge regression, baseline plus metric ridge regression, and train-only baseline/metric bucket medians. Added feature penalty 1; baseline and intercept unpenalized.',
            'buckets': 'Separate negative sentinel; 0; (0,1]; (1,3]; (3,7]; >7. Fixed before this comparison, adapting the earlier integer buckets to fractional metrics. Unseen bucket uses training median.',
            'intervals': '1000 paired seed-cluster bootstrap draws on fixed held-out errors, without refitting or multiplicity correction. Exploratory with few seeds.',
            'outcomes': 'combatStepsLost and attritionStepsLost retain the current recorder classification. They count STEP_LOST events, not guaranteed physical steps or pure combat causes. outOfTraceRise is positive net change, not proven enemy-caused disruption.',
        },
        'inputs': audit, 'data': VALIDATE.describe(samples),
        'recordedAliases': sum(len(game['aliases']) for game in games),
        'uniqueTrajectories': len(games),
        'trajectories': [{key: value for key, value in game.items() if key != 'rows'} for game in games],
        'leaveOneSeedOut': {},
    }
    for subset in VALIDATE.SUBSETS:
        chosen = [row for row in samples if subset == 'all' or row['role'] == subset]
        seeds = sorted({row['mapSeed'] for row in chosen})
        splits = [(str(seed), [i for i, row in enumerate(chosen) if row['mapSeed'] != seed],
                   [i for i, row in enumerate(chosen) if row['mapSeed'] == seed]) for seed in seeds]
        report['leaveOneSeedOut'][subset] = [VALIDATE.evaluate(chosen, splits, *test) for test in TESTS]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--artifact-root', type=Path, default=Path('.'))
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    report = run(args.manifest, args.artifact_root)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps(report['data'], ensure_ascii=False))


if __name__ == '__main__':
    main()
