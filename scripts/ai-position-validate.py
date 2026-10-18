#!/usr/bin/env python3
"""Validate recorded near-term indicators on held-out map seeds and batches.

Historical data were already used to select these indicators. This is grouped,
retrospective prediction validation, not prospective confirmation or a policy eval.
Run with --manifest, --artifact-root, --out, or run --self-test without artifacts.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path


SPEC = importlib.util.spec_from_file_location('vpcompare', Path(__file__).with_name('ai-vp-metrics-compare.py'))
VPCOMPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VPCOMPARE)
# Metrics of the non-phasing player O (what P can do to O in this turn) and, prefixed "mover.", of the phasing player P.
DEFENDER_FEATURES = ('objectivesThreatened', 'contact', 'outOfTrace', 'objectivesAtRisk', 'objectiveVpAtRisk',
                     'payableObjectiveVpAtRisk', 'stacksExposed', 'stacksExposedAllocated', 'maxSingleStackExpectedLoss',
                     'supplyCuttable', 'supplyBestCut', 'hqsInReach', 'dumpSpInReach')
MOVER_FEATURES = ('contact', 'objectiveVpInReach', 'payableObjectiveVpInReach', 'bestObjectiveEffectiveColumn',
                  'localForceRatioAt2Hex', 'surplusCombatSp', 'unitsWithReach')
FEATURES = frozenset(DEFENDER_FEATURES) | frozenset(f'mover.{feature}' for feature in MOVER_FEATURES)
TESTS = (
    ('objectiveVpLost', 'objectiveVpAtRisk', 'objectivesThreatened'),
    ('objectivesLost', 'objectivesAtRisk', 'objectivesThreatened'),
    ('stepsLost', 'stacksExposedAllocated', 'contact'),
    ('stepsLost', 'stacksExposedAllocated', 'stacksExposed'),
    ('outOfTraceRise', 'supplyCuttable', 'contact'),
    ('outOfTraceRise', 'supplyBestCut', 'contact'),
    ('hqsLost', 'hqsInReach', 'contact'),
    ('objectiveVpLost', 'payableObjectiveVpAtRisk', 'objectivesThreatened'),
    ('objectiveVpLost', 'payableObjectiveVpAtRisk', 'objectiveVpAtRisk'),
    ('combatStepsLost', 'stacksExposedAllocated', 'contact'),
    ('combatStepsLost', 'maxSingleStackExpectedLoss', 'contact'),
    ('combatStepsLost', 'maxSingleStackExpectedLoss', 'stacksExposedAllocated'),
    ('spCapturedOrDestroyed', 'dumpSpInReach', 'contact'),
    ('attritionNextTurn', 'supplyCuttable', 'outOfTrace'),
    ('moverObjectiveVpGained', 'mover.objectiveVpInReach', 'mover.contact'),
    ('moverObjectiveVpGained', 'mover.payableObjectiveVpInReach', 'mover.objectiveVpInReach'),
    ('moverObjectivesGained', 'mover.bestObjectiveEffectiveColumn', 'mover.contact'),
    ('moverObjectivesGained', 'mover.localForceRatioAt2Hex', 'mover.contact'),
    ('combatStepsLost', 'mover.surplusCombatSp', 'mover.contact'),
    ('combatStepsLost', 'mover.unitsWithReach', 'mover.contact'),
)
SUBSETS = ('all', 'attacker-moving', 'defender-moving', 'meeting')
MODEL_NAMES = ('zero', 'trainMedian', 'trainMean', 'baseline', 'baselinePlusMetric',
               'baselineBucketMedian', 'metricBucketMedian', 'baselineQuantileMedian', 'metricQuantileMedian')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def payload(rows):
    return [{key: row[key] for key in ('gameTurn', 'playerTurnIndex', 'phasingPlayerId',
                                      'attackerId', 'engagement', 'metrics', 'turn', 'finalVp')}
            for row in rows]


def add_game(games, identity, rows, alias):
    if identity in games:
        previous = games[identity]
        if canonical(payload(previous['rows'])) != canonical(payload(rows)):
            raise ValueError(f'duplicate trajectory has conflicting metric, turn, or final VP rows: {alias}')
        if previous['mapSeed'] != alias['seeds']['map']:
            raise ValueError('duplicate trajectory has conflicting map seeds')
        previous['aliases'].append(alias)
    else:
        games[identity] = {'id': identity, 'mapSeed': alias['seeds']['map'], 'rows': rows, 'aliases': [alias]}


def load_games(manifest_path, root):
    raw_manifest = manifest_path.read_bytes()
    manifest = json.loads(raw_manifest)
    games, inputs = {}, []
    for entry in manifest['files']:
        if 'file' not in entry:
            continue
        path = root / entry['file']
        raw = path.read_bytes()
        if digest(raw) != entry['sha256']:
            raise ValueError(f'SHA256 mismatch: {path}')
        input_record = {'file': entry['file'], 'sha256': digest(raw), 'kind': 'analysis' if 'source' not in entry else 'rows'}
        inputs.append(input_record)
        if 'source' not in entry:
            continue
        source = root / entry['source']
        summary_raw = (source / 'summary.json').read_bytes()
        summary = json.loads(summary_raw)
        input_record['summarySha256'] = digest(summary_raw)
        records = {record['match']: record for record in summary['records']}
        if len(records) != len(summary['records']):
            raise ValueError(f'duplicate summary match: {source}')
        by_match = defaultdict(list)
        for line in raw.splitlines():
            if line.strip():
                row = json.loads(line)
                by_match[row['match']].append(row)
        if len(by_match) != entry['games'] or sum(map(len, by_match.values())) != entry['rows']:
            raise ValueError(f'manifest count mismatch: {path}')
        if set(by_match) != set(records):
            raise ValueError(f'rows and summary matches differ: {source}')
        for match, rows in sorted(by_match.items()):
            rows.sort(key=lambda row: (row['gameTurn'], row['playerTurnIndex']))
            if [(row['gameTurn'], row['playerTurnIndex']) for row in rows] != [(t, p) for t in range(1, 9) for p in (0, 1)]:
                raise ValueError(f'expected exactly two player turns for Game Turns 1-8: {source}, {match}')
            record = records[match]
            if record['stopReason'] != 'FINISHED' or record['errors']:
                raise ValueError(f'incomplete or errored game: {source}, {match}')
            save_raw = (source / f'match-{match}.save.json').read_bytes()
            save = json.loads(save_raw)
            if save['finalStateHash'] != record['finalStateHash']:
                raise ValueError(f'save/summary final hash mismatch: {source}, {match}')
            if len(save['acceptedActions']) != record['accepted']:
                raise ValueError(f'save/summary action count mismatch: {source}, {match}')
            action_hash = digest(canonical(save['acceptedActions']))
            identity = digest(canonical([save['initialStateHash'], save['finalStateHash'], action_hash]))
            for row in rows:
                if row['dir'] != entry['source'] or row['policies'] != rows[0]['policies']:
                    raise ValueError(f'row provenance mismatch: {source}, {match}')
                if len(row['metrics']) != 2 or row['phasingPlayerId'] not in row['metrics']:
                    raise ValueError(f'invalid player metrics: {source}, {match}')
            alias = {'source': entry['source'], 'file': entry['file'], 'match': match,
                     'batch': Path(entry['source']).parent.as_posix(),
                     'variant': Path(entry['source']).name.rsplit('-', 1)[0],
                     'mapStyle': summary['options']['style'], 'engagement': rows[0]['engagement'],
                     'policies': rows[0]['policies'], 'seeds': record['seeds'],
                     'saveSha256': digest(save_raw), 'acceptedActionsSha256': action_hash,
                     'initialStateHash': save['initialStateHash'], 'finalStateHash': save['finalStateHash']}
            add_game(games, identity, rows, alias)
    if not games:
        raise ValueError('manifest contains no position games')
    metric_groups = defaultdict(list)
    for game in games.values():
        metric_groups[digest(canonical([row['metrics'] for row in game['rows']]))].append(game['id'])
    return list(games.values()), {'manifest': str(manifest_path), 'manifestSha256': digest(raw_manifest),
                                  'files': inputs, 'metricOnlyDistinct': len(metric_groups),
                                  'metricOnlyIdentityCollisions': [ids for ids in metric_groups.values() if len(ids) > 1]}


def samples_from_games(games):
    samples = []
    for game in games:
        for before, after in zip(game['rows'], game['rows'][1:]):
            if before['gameTurn'] < 2:
                continue
            phasing = before['phasingPlayerId']
            other = next(player for player in before['metrics'] if player != phasing)
            current, following = before['metrics'][other], after['metrics'][other]
            role = ('meeting' if before['attackerId'] is None else
                    'attacker-moving' if before['attackerId'] == phasing else 'defender-moving')
            mover = before['metrics'][phasing]
            outcomes = dict(before['turn'][other])
            outcomes['outOfTraceRise'] = max(0, following['outOfTrace'] - current['outOfTrace'])
            outcomes['hqsLost'] = max(0, current['hqs'] - following['hqs'])
            outcomes['moverObjectivesGained'] = before['turn'][phasing]['objectivesGained']
            outcomes['moverObjectiveVpGained'] = before['turn'][phasing]['objectiveVpGained']
            # O's own following player turn, where its attrition falls; missing when P moves twice in a row.
            outcomes['attritionNextTurn'] = after['turn'][other].get('attritionStepsLost') if after['phasingPlayerId'] == other else None
            metrics = {feature: current.get(feature) for feature in DEFENDER_FEATURES}
            metrics.update({f'mover.{feature}': mover.get(feature) for feature in MOVER_FEATURES})
            samples.append({'game': game['id'], 'mapSeed': game['mapSeed'],
                            'batches': sorted({alias['batch'] for alias in game['aliases']}),
                            'role': role, 'gameTurn': before['gameTurn'], 'playerTurnIndex': before['playerTurnIndex'],
                            'metrics': metrics, 'outcomes': outcomes})
    return samples


def seed_folds(samples):
    seeds = sorted({row['mapSeed'] for row in samples}, key=lambda seed: digest(str(seed).encode()))
    if len(seeds) < 10:
        raise ValueError('ten-fold validation needs at least ten distinct map seeds')
    return {seed: index % 10 for index, seed in enumerate(seeds)}


def grouped_splits(samples, folds):
    for fold in range(10):
        yield str(fold), [i for i, row in enumerate(samples) if folds[row['mapSeed']] != fold], [i for i, row in enumerate(samples) if folds[row['mapSeed']] == fold]


def batch_split(samples, batch):
    test = [i for i, row in enumerate(samples) if batch in row['batches']]
    seeds = {samples[i]['mapSeed'] for i in test}
    train = [i for i, row in enumerate(samples) if batch not in row['batches'] and row['mapSeed'] not in seeds]
    return batch, train, test


def model_predictions(train, test, baseline, metric):
    mean = sum(row['y'] for row in train) / len(train)
    median = statistics.median(row['y'] for row in train)
    predictions = {'zero': [0.0] * len(test), 'trainMedian': [median] * len(test),
                   'trainMean': [mean] * len(test)}
    for name, features in [('baseline', [baseline]), ('baselinePlusMetric', [baseline, metric])]:
        predictions[name] = VPCOMPARE.ridge_predict(train, test, features, penalty=1.0,
                                                   outcome='y', baseline=baseline, allowed_features=FEATURES)
    def bucket(value):
        return 0 if value == 0 else 1 if value == 1 else 2 if value <= 3 else 3 if value <= 7 else 4
    for name, feature in [('baselineBucketMedian', baseline), ('metricBucketMedian', metric)]:
        groups = defaultdict(list)
        for row in train:
            groups[bucket(row['metrics'][feature])].append(row['y'])
        medians = {key: statistics.median(values) for key, values in groups.items()}
        predictions[name] = [medians.get(bucket(row['metrics'][feature]), median) for row in test]
    # Training quintile bins, for metrics that are not small counts (ratios, columns, expected losses).
    for name, feature in [('baselineQuantileMedian', baseline), ('metricQuantileMedian', metric)]:
        values = sorted(row['metrics'][feature] for row in train)
        cuts = sorted({values[min(len(values) - 1, (len(values) * q) // 5)] for q in range(1, 5)})
        def quantile_bin(value, cuts=cuts):
            return sum(value > cut for cut in cuts)
        groups = defaultdict(list)
        for row in train:
            groups[quantile_bin(row['metrics'][feature])].append(row['y'])
        medians = {key: statistics.median(values) for key, values in groups.items()}
        predictions[name] = [medians.get(quantile_bin(row['metrics'][feature]), median) for row in test]
    return predictions


def errors_by_seed(rows, predictions):
    errors = {}
    for index, row in enumerate(rows):
        seed = str(row['mapSeed'])
        cell = errors.setdefault(seed, {'nRows': 0, 'sumY': 0.0, 'sumY2': 0.0,
                                      'sumAbsoluteError': dict.fromkeys(MODEL_NAMES, 0.0),
                                      'sumSquaredError': dict.fromkeys(MODEL_NAMES, 0.0)})
        cell['nRows'] += 1
        cell['sumY'] += row['y']
        cell['sumY2'] += row['y'] ** 2
        for name in MODEL_NAMES:
            residual = row['y'] - predictions[name][index]
            cell['sumAbsoluteError'][name] += abs(residual)
            cell['sumSquaredError'][name] += residual ** 2
    return errors


def scores(cells):
    n = sum(cell['nRows'] for cell in cells)
    total = sum(cell['sumY2'] for cell in cells) - sum(cell['sumY'] for cell in cells) ** 2 / n
    return {name: {'mae': sum(cell['sumAbsoluteError'][name] for cell in cells) / n,
                   'r2': 1 - sum(cell['sumSquaredError'][name] for cell in cells) / total if total > 1e-12 else None}
            for name in MODEL_NAMES}


def conditional_intervals(cells, draws=1000):
    rng = random.Random(20261018)
    mae, r2 = [], []
    bucket_gains = {name: [] for name in ('zero', 'trainMedian', 'baselineBucketMedian')}
    quantile_gains = {name: [] for name in ('zero', 'trainMedian', 'baselineQuantileMedian')}
    for _ in range(draws):
        result = scores([rng.choice(cells) for _ in cells])
        mae.append(result['baseline']['mae'] - result['baselinePlusMetric']['mae'])
        for name, values in bucket_gains.items():
            values.append(result[name]['mae'] - result['metricBucketMedian']['mae'])
        for name, values in quantile_gains.items():
            values.append(result[name]['mae'] - result['metricQuantileMedian']['mae'])
        if result['baseline']['r2'] is not None:
            r2.append(result['baselinePlusMetric']['r2'] - result['baseline']['r2'])
    def interval(values):
        values.sort()
        return [values[int((len(values) - 1) * 0.025)], values[int((len(values) - 1) * 0.975)]] if values else None
    return {'draws': draws, 'maeGain95': interval(mae), 'r2Gain95': interval(r2),
            'metricBucketMedianMaeGain95': {name: interval(values) for name, values in bucket_gains.items()},
            'metricQuantileMedianMaeGain95': {name: interval(values) for name, values in quantile_gains.items()},
            'scope': 'Paired map-seed cluster resampling of fixed held-out errors. Conditional on fitted folds; no refitting or model-selection uncertainty.'}


def describe(samples):
    return {'nRows': len(samples), 'nGames': len({row['game'] for row in samples}),
            'nSeeds': len({row['mapSeed'] for row in samples}),
            'batchRowsIncludingAliases': dict(sorted(Counter(batch for row in samples for batch in row['batches']).items()))}


def evaluate(samples, splits, target, metric, baseline):
    eligible = [numeric(row['metrics'][metric]) and numeric(row['metrics'][baseline]) and numeric(row['outcomes'].get(target)) for row in samples]
    prepared = [{**row, 'y': row['outcomes'].get(target)} for row in samples]
    audit, tests = [], []
    predicted = {name: [] for name in MODEL_NAMES}
    for name, train_indices, test_indices in splits:
        train = [prepared[i] for i in train_indices if eligible[i]]
        test = [prepared[i] for i in test_indices if eligible[i]]
        train_seeds = {row['mapSeed'] for row in train}
        test_seeds = {row['mapSeed'] for row in test}
        if train_seeds & test_seeds:
            raise AssertionError('map seed leaks across training and test')
        audit.append({'fold': name, 'training': describe(train), 'test': describe(test),
                      'trainSeeds': sorted(train_seeds), 'testSeeds': sorted(test_seeds),
                      'empty': not train or not test})
        if not train or not test:
            continue
        prediction = model_predictions(train, test, baseline, metric)
        tests.extend(test)
        for model in MODEL_NAMES:
            predicted[model].extend(prediction[model])
    result = {'target': target, 'metric': metric, 'baseline': baseline,
              'candidate': describe(samples), 'missingAnyRequired': eligible.count(False),
              'metricMissing': sum(not numeric(row['metrics'][metric]) for row in samples),
              'baselineMissing': sum(not numeric(row['metrics'][baseline]) for row in samples),
              'metricZero': sum(row['metrics'][metric] == 0 for row in samples),
              'outcomeMissing': sum(not numeric(row['outcomes'].get(target)) for row in samples),
              'outcomeZero': sum(row['outcomes'].get(target) == 0 for row in samples),
              'folds': audit, 'emptyFoldCount': sum(fold['empty'] for fold in audit),
              'evaluated': describe(tests)}
    if not tests:
        return {**result, 'status': 'UNAVAILABLE', 'reason': 'No nonempty training/test split after seed and alias exclusion.'}
    cells = errors_by_seed(tests, predicted)
    metrics = scores(list(cells.values()))
    result.update({'status': 'EVALUATED' if not result['emptyFoldCount'] else 'PARTIAL',
                   'scores': metrics, 'perSeedErrors': cells,
                   'maeGain': metrics['baseline']['mae'] - metrics['baselinePlusMetric']['mae'],
                   'r2Gain': (metrics['baselinePlusMetric']['r2'] - metrics['baseline']['r2']) if metrics['baseline']['r2'] is not None else None,
                   'intervals': conditional_intervals(list(cells.values()))})
    return result


def run(games, input_audit):
    samples = samples_from_games(games)
    folds = seed_folds(samples)
    batches = sorted({batch for row in samples for batch in row['batches']})
    report = {'schemaVersion': 1,
              'scriptSha256': digest(Path(__file__).read_bytes()),
              'modelHelperSha256': digest(Path(VPCOMPARE.__file__).read_bytes()),
              'scope': 'Retrospective near-term predictive validation of previously selected indicators. Reuses historical data; no prospective, final-VP, or policy-strength claim.',
              'design': {'window': 'Non-phasing O at start of P player turn, Game Turns 2-8, with a following recorded row. The final player turn is excluded.',
                         'outcomes': 'Recorded O objective/step losses during P turn (stepsLost all step-loss events, split into attritionStepsLost and combatStepsLost); positive rise in O outOfTrace or decline in HQ count to the following row; P objectives and objective VP gained in its turn; attritionNextTurn is O attrition in the following row when that row is O turn, else missing.',
                         'models': 'Zero event; training median; training mean; intercept plus distance baseline; intercept plus baseline plus metric; training conditional medians in baseline or metric buckets, fixed at 0, 1, 2-3, 4-7, 8+ from the historical descriptive analysis, and in training quintile bins (for ratios, columns and expected losses). Baseline and intercept unpenalized; standardized added metric fixed ridge penalty 1. Unseen bucket falls back to training median. No hyperparameter search. Complete cases shared across models; train-only preprocessing.',
                         'mover': 'Features prefixed mover. are the phasing player P metrics at the same row; the others are O metrics.',
                         'features': sorted(FEATURES), 'primarySplit': 'Ten folds of map seed, sorted by SHA256 and assigned round-robin. All styles, roles, policy variants and aliases of a seed stay together.',
                         'sensitivitySplit': 'Each source parent directory is one held-out batch. Training excludes every trajectory with any alias in that batch and every map seed appearing in its test data. Batches are reported separately because test trajectories can have multiple aliases.',
                         'batchMeaning': 'Provenance source parent directory, not independently verified policy version. Policy strings and variants are aliases retained verbatim.',
                         'intervals': '1000 paired seed-cluster draws on fixed out-of-fold errors. Conditional, exploratory intervals without multiplicity correction.'},
              'inputs': input_audit, 'data': describe(samples),
              'recordedAliases': sum(len(game['aliases']) for game in games),
              'uniqueTrajectories': len(games),
              'seedFold': {str(seed): fold for seed, fold in sorted(folds.items())},
              'trajectories': [{key: value for key, value in game.items() if key != 'rows'} for game in games],
              'mapSeed10Fold': {}, 'leaveBatchAndSeedOut': {}}
    for subset in SUBSETS:
        chosen = [row for row in samples if subset == 'all' or row['role'] == subset]
        report['mapSeed10Fold'][subset] = [evaluate(chosen, list(grouped_splits(chosen, folds)), *test) for test in TESTS]
    for batch in batches:
        report['leaveBatchAndSeedOut'][batch] = {}
        for subset in SUBSETS:
            chosen = [row for row in samples if subset == 'all' or row['role'] == subset]
            report['leaveBatchAndSeedOut'][batch][subset] = [evaluate(chosen, [batch_split(chosen, batch)], *test) for test in TESTS]
    return report


def self_test():
    rng = random.Random(37)
    rows = []
    for seed in range(40):
        for index in range(8):
            signal = rng.randrange(8)
            rows.append({'game': f'g{seed}', 'mapSeed': seed, 'batches': [f'b{seed % 4}'],
                         'role': 'meeting', 'metrics': {'contact': rng.randrange(5), 'objectivesAtRisk': signal},
                         'outcomes': {'objectivesLost': 3 * signal + rng.random() * 0.1}})
    folds = seed_folds(rows)
    splits = list(grouped_splits(rows, folds))
    assert sorted(i for _, _, test in splits for i in test) == list(range(len(rows)))
    result = evaluate(rows, splits, 'objectivesLost', 'objectivesAtRisk', 'contact')
    assert result['emptyFoldCount'] == 0 and result['scores']['baselinePlusMetric']['r2'] > 0.99
    assert result['intervals']['maeGain95'][0] > 4
    null_rows = copy.deepcopy(rows)
    for row in null_rows:
        row['metrics']['objectivesAtRisk'] = rng.randrange(8)
    null = evaluate(null_rows, splits, 'objectivesLost', 'objectivesAtRisk', 'contact')
    assert null['r2Gain'] < 0.02, null['r2Gain']
    train = [{**row, 'y': row['outcomes']['objectivesLost']} for row in rows[:200]]
    test = [{**row, 'y': row['outcomes']['objectivesLost']} for row in rows[200:]]
    first = model_predictions(train, test, 'contact', 'objectivesAtRisk')
    for row in test:
        row['y'] = 999999
        row['outcomes'] = {'objectivesLost': -999999}
        row['metrics']['futureOutcome'] = -999999
    assert first == model_predictions(train, test, 'contact', 'objectivesAtRisk')
    bucket_train = [
        {'metrics': {'contact': 0, 'objectivesAtRisk': value}, 'y': target}
        for value, target in [(0, 0), (0, 0), (1, 4), (1, 6)]
    ]
    bucket_test = [{'metrics': {'contact': 0, 'objectivesAtRisk': value}} for value in (0, 1, 9)]
    assert model_predictions(bucket_train, bucket_test, 'contact', 'objectivesAtRisk')['metricBucketMedian'] == [0, 5, 2]
    try:
        model_predictions(train, test, 'contact', 'futureOutcome')
        raise AssertionError('future feature accepted')
    except ValueError:
        pass
    aliased = copy.deepcopy(rows)
    aliased[0]['batches'].append('b1')
    _, train_indices, test_indices = batch_split(aliased, 'b1')
    assert 0 not in train_indices and 0 in test_indices
    assert not ({aliased[i]['mapSeed'] for i in train_indices} & {aliased[i]['mapSeed'] for i in test_indices})
    sample_row = {'gameTurn': 1, 'playerTurnIndex': 0, 'phasingPlayerId': 'p', 'attackerId': None,
                  'engagement': 'MEETING', 'metrics': {'p': {}}, 'turn': {'p': {}}, 'finalVp': {'p': 1}, 'dir': 'a'}
    games = {}
    add_game(games, 'identity', [sample_row], {'seeds': {'map': 1}, 'source': 'a'})
    duplicate = {**sample_row, 'dir': 'b', 'policies': {'p': 'alias'}}
    add_game(games, 'identity', [duplicate], {'seeds': {'map': 1}, 'source': 'b'})
    assert len(games) == 1 and len(games['identity']['aliases']) == 2
    try:
        add_game(games, 'identity', [{**duplicate, 'finalVp': {'p': 2}}], {'seeds': {'map': 1}})
        raise AssertionError('conflicting duplicate accepted')
    except ValueError:
        pass
    assert digest(canonical({'b': 1, 'a': 2})) == digest(canonical({'a': 2, 'b': 1}))
    def turn_row(turn, index, phasing, value, attrition):
        return {'gameTurn': turn, 'playerTurnIndex': index, 'phasingPlayerId': phasing, 'attackerId': 'a',
                'metrics': {player: {**dict.fromkeys(DEFENDER_FEATURES + MOVER_FEATURES, value), 'outOfTrace': value, 'hqs': value}
                            for player in ('a', 'd')},
                'turn': {player: {'stepsLost': 0, 'objectivesGained': 0, 'objectiveVpGained': 0, 'attritionStepsLost': attrition}
                         for player in ('a', 'd')}}
    game = {'id': 'g', 'mapSeed': 1, 'aliases': [{'batch': 'b'}],
            'rows': [turn_row(2, 0, 'a', 1, 0), turn_row(2, 1, 'd', 5, 3), turn_row(3, 0, 'd', 9, 7)]}
    first, second = samples_from_games([game])
    assert first['metrics']['contact'] == 1 and first['metrics']['mover.contact'] == 1, 'features come from the row itself'
    assert first['outcomes']['attritionNextTurn'] == 3, "O's attrition in its following turn"
    assert second['outcomes']['attritionNextTurn'] is None, 'missing when P moves twice in a row'
    quantile_train = [{'metrics': {'contact': 0, 'objectivesAtRisk': value / 10}, 'y': value} for value in range(10)]
    quantile = model_predictions(quantile_train, [{'metrics': {'contact': 0, 'objectivesAtRisk': value}} for value in (0.05, 0.85)],
                                 'contact', 'objectivesAtRisk')['metricQuantileMedian']
    assert quantile[0] < 2 and quantile[1] > 7, quantile
    print('self-test passed: held-out signal, null sensitivity, exact duplicate conflict, alias exclusion, fold coverage, no future leakage, row-only features, next-turn outcome, quantile bins')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not all((args.manifest, args.artifact_root, args.out)):
        parser.error('--manifest, --artifact-root and --out are required unless --self-test is selected')
    games, audit = load_games(args.manifest, args.artifact_root)
    report = run(games, audit)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'out': str(args.out), 'uniqueTrajectories': len(games), **report['data']}))


if __name__ == '__main__':
    main()
