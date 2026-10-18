#!/usr/bin/env python3
"""Exploratory paired VP metric analysis; standard library only.

Consumes extraction files (*.metrics.json), pairs candidates to frozen-standard
self-play, and keeps every variant of a map seed together during validation.
Cross-validation reuses historical development data; it is not a promotion test.
"""

import argparse
import json
import math
import random
import statistics
from collections import defaultdict
from pathlib import Path

METRICS = (
    'earlyMargin', 'gainedVp', 'lostVp', 'moveGainedVp', 'combatGainedVp',
    'objectiveAttacks', 'otherAttacks', 'barrages', 'objectiveAttackMeanColumn',
    'objectiveAttackCaptureRate', 'objectiveAttackClearRate',
    'adjacentStrengthShare', 'bestObjectiveEffectiveColumn', 'localForceRatioAt2Hex',
    'occupiedHeldVpShare', 'outOfSupplyStrengthShare',
    'foundColumn6ObjectiveVp', 'meanFoundObjectiveColumn', 'bestSearchTruncated',
    'regularAttacks', 'objectiveSupplyRequirementTokens',
    'occupiedHeldVp', 'unoccupiedHeldVp',
)
DIAGNOSTIC_METRICS = {'bestSearchTruncated'}
BASELINE_VARIANT = 'v79-baseline-wide'
VARIANTS = {'v80g-wide', 'v80j-wide', 'v80q-wide'}
BOOTSTRAPS = 1000


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def mean(values):
    return statistics.fmean(values) if values else None


def pearson(xs, ys):
    if len(xs) < 3:
        return None
    mx, my = mean(xs), mean(ys)
    xx = sum((x - mx) ** 2 for x in xs)
    yy = sum((y - my) ** 2 for y in ys)
    if xx == 0 or yy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.sqrt(xx * yy)


def ranks(values):
    order = sorted(range(len(values)), key=values.__getitem__)
    result = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start + 1
        while end < len(order) and values[order[end]] == values[order[start]]:
            end += 1
        rank = (start + end - 1) / 2 + 1
        for index in order[start:end]:
            result[index] = rank
        start = end
    return result


def association(rows, metric, outcome):
    present = [(row['metrics'][metric], row[outcome]) for row in rows
               if numeric(row['metrics'][metric])]
    xs = [pair[0] for pair in present]
    ys = [pair[1] for pair in present]
    return {
        'n': len(present), 'missing': len(rows) - len(present),
        'zero': sum(x == 0 for x in xs),
        'pearson': pearson(xs, ys), 'spearman': pearson(ranks(xs), ranks(ys)),
    }


def solve(matrix, vector):
    """Gaussian elimination with partial pivoting for the tiny ridge systems."""
    augmented = [list(row) + [value] for row, value in zip(matrix, vector)]
    size = len(vector)
    for col in range(size):
        pivot = max(range(col, size), key=lambda i: abs(augmented[i][col]))
        if abs(augmented[pivot][col]) < 1e-12:
            raise ValueError('singular regression system')
        augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
        divisor = augmented[col][col]
        augmented[col] = [value / divisor for value in augmented[col]]
        for row in range(size):
            if row == col:
                continue
            factor = augmented[row][col]
            augmented[row] = [a - factor * b for a, b in zip(augmented[row], augmented[col])]
    return [row[-1] for row in augmented]


def ridge_predict(train, test, features, penalty=1.0, *, outcome='finalMarginDelta',
                  baseline='earlyMargin', allowed_features=METRICS):
    if not train:
        raise ValueError('empty training fold')
    if not features or outcome in features or any(feature not in allowed_features for feature in features):
        raise ValueError('features must be explicitly selected cutoff metrics; outcome is forbidden')
    medians = []
    for feature in features:
        present = [row['metrics'][feature] for row in train if numeric(row['metrics'][feature])]
        medians.append(statistics.median(present) if present else 0.0)

    def impute(row):
        values = []
        for feature, median in zip(features, medians):
            value = row['metrics'][feature]
            missing = not numeric(value)
            values.extend((median if missing else value, float(missing)))
        return values

    raw_train = [impute(row) for row in train]
    means = [mean(list(column)) for column in zip(*raw_train)]
    scales = [math.sqrt(mean([(value - center) ** 2 for value in column]))
              for column, center in zip(zip(*raw_train), means)]

    def transform(raw):
        return [1.0] + [(value - center) / scale if scale > 0 else 0.0
                        for value, center, scale in zip(raw, means, scales)]

    design = [transform(raw) for raw in raw_train]
    width = len(design[0])
    unpenalized = {0}
    if features[0] == baseline and scales[0] > 0:
        unpenalized.add(1)
    matrix = [[sum(row[i] * row[j] for row in design) + (penalty if i == j and i not in unpenalized else 0)
               for j in range(width)] for i in range(width)]
    vector = [sum(row[i] * sample[outcome] for row, sample in zip(design, train))
              for i in range(width)]
    weights = solve(matrix, vector)
    return [sum(a * b for a, b in zip(transform(impute(row)), weights)) for row in test]


def fold_indices(rows, scheme):
    if scheme == 'leaveMapSeedOut':
        keys = sorted({row['mapSeed'] for row in rows})
        for key in keys:
            yield ([i for i, row in enumerate(rows) if row['mapSeed'] != key],
                   [i for i, row in enumerate(rows) if row['mapSeed'] == key])
    elif scheme == 'leaveVariantOut':
        keys = sorted({row['variant'] for row in rows})
        for key in keys:
            yield ([i for i, row in enumerate(rows) if row['variant'] != key],
                   [i for i, row in enumerate(rows) if row['variant'] == key])
    elif scheme == 'leaveMapSeedAndVariantOut':
        keys = sorted({(row['mapSeed'], row['variant']) for row in rows})
        for seed, variant in keys:
            yield ([i for i, row in enumerate(rows)
                    if row['mapSeed'] != seed and row['variant'] != variant],
                   [i for i, row in enumerate(rows)
                    if row['mapSeed'] == seed and row['variant'] == variant])
    else:
        raise ValueError(f'unknown validation scheme: {scheme}')


def percentile(values, q):
    position = (len(values) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def paired_bootstrap(rows, errors, baseline_errors):
    groups = defaultdict(list)
    for row, error, baseline_error in zip(rows, errors, baseline_errors):
        groups[row['mapSeed']].append(baseline_error - error)
    per_seed = {key: mean(values) for key, values in sorted(groups.items())}
    values = list(per_seed.values())
    rng = random.Random(74319)
    draws = sorted(mean([rng.choice(values) for _ in values]) for _ in range(BOOTSTRAPS))
    return {
        'meanSeedMaeImprovement': mean(values),
        'seedMaeImprovement': per_seed,
        'conditionalFixedPredictionBootstrap95': [percentile(draws, .025), percentile(draws, .975)],
        'bootstrapReplicates': BOOTSTRAPS,
    }


def cross_validate(rows, scheme):
    models = {'zero': None, 'trainMean': None, 'earlyMarginCarryForward': None,
              'fittedEarlyMargin': ['earlyMargin']}
    models.update({f'earlyMarginPlus:{metric}': ['earlyMargin', metric]
                   for metric in METRICS if metric != 'earlyMargin' and metric not in DIAGNOSTIC_METRICS})
    models['occupiedShareMissingOnly'] = ['earlyMargin', 'occupiedHeldVpShare']
    predictions = {name: [None] * len(rows) for name in models}
    folds = list(fold_indices(rows, scheme))
    seen = [0] * len(rows)
    for train_indices, test_indices in folds:
        train = [rows[i] for i in train_indices]
        test = [rows[i] for i in test_indices]
        if not train or not test:
            raise ValueError(f'{scheme}: empty train/test fold')
        for index in test_indices:
            seen[index] += 1
        for name, features in models.items():
            if name == 'zero':
                predicted = [0.0] * len(test)
            elif name == 'trainMean':
                predicted = [mean([row['finalMarginDelta'] for row in train])] * len(test)
            elif name == 'earlyMarginCarryForward':
                predicted = [row['metrics']['earlyMargin'] for row in test]
            elif name == 'occupiedShareMissingOnly':
                def remove_share_value(row):
                    value = row['metrics']['occupiedHeldVpShare']
                    return {**row, 'metrics': {**row['metrics'], 'occupiedHeldVpShare': 0 if numeric(value) else None}}
                predicted = ridge_predict([remove_share_value(row) for row in train],
                                          [remove_share_value(row) for row in test], features)
            else:
                predicted = ridge_predict(train, test, features)
            for index, value in zip(test_indices, predicted):
                predictions[name][index] = value
    if any(count != 1 for count in seen):
        raise ValueError('each row must receive exactly one held-out prediction')
    errors = {name: [abs(row['finalMarginDelta'] - prediction)
                     for row, prediction in zip(rows, predicted)]
              for name, predicted in predictions.items()}
    results = {}
    for name, model_errors in errors.items():
        results[name] = {
            'mae': mean(model_errors),
            **paired_bootstrap(rows, model_errors, errors['fittedEarlyMargin']),
            'byVariantMae': {variant: mean([error for row, error in zip(rows, model_errors)
                                           if row['variant'] == variant])
                             for variant in sorted({row['variant'] for row in rows})},
        }
    return {'foldCount': len(folds), 'models': results}


def read_rows(directory, output):
    manifest = json.loads((directory / 'manifest.json').read_text())
    documents = []
    sources = []
    for path in sorted(directory.glob('*.metrics.json')):
        if path.resolve() == output.resolve():
            continue
        document = json.loads(path.read_text())
        if 'games' not in document:  # A prior report is not an extraction.
            continue
        if document.get('schemaVersion') != 1 or document.get('cutoffTurn') != 4:
            raise ValueError(f'{path}: expected extraction schemaVersion=1 and cutoffTurn=4')
        if document.get('variant') not in VARIANTS | {BASELINE_VARIANT}:
            raise ValueError(f'{path}: unrecognized variant')
        if not document.get('engineHash'):
            raise ValueError(f'{path}: missing engine hash')
        for game in document['games']:
            if game.get('replayOk') is not True:
                raise ValueError(f'{path}: failed/unverified replay: {game.get("match")}')
            if game.get('candidateSide') not in (None, 'axis', 'allied'):
                raise ValueError(f'{path}: candidateSide must name exactly one side or null')
            if set(game.get('sides', {})) != {'axis', 'allied'}:
                raise ValueError(f'{path}: exactly axis and allied side records required')
            if {record.get('role') for record in game['sides'].values()} != {'ATTACKER', 'DEFENDER'}:
                raise ValueError(f'{path}: attack-engagement records must contain one attacker and one defender')
            if not game.get('initialHash') or not game.get('finalHash') or 'map' not in game.get('seeds', {}):
                raise ValueError(f'{path}: missing game identity/hash/seed')
        documents.append(document)
        sources.append(str(path))
    if not documents:
        raise ValueError('no extraction files found')
    expected = {(job['variant'], job['style']): set(job['matches']) for job in manifest['jobs']}
    actual = {(doc['variant'], doc['style']): {game['match'] for game in doc['games']} for doc in documents}
    if len(actual) != len(documents) or actual != expected:
        raise ValueError('extraction coverage differs from the registered manifest')
    expected_hashes = {(job['variant'], job['style']): job['summarySha256'] for job in manifest['jobs']}
    if any(doc.get('summaryHash') != expected_hashes[(doc['variant'], doc['style'])] for doc in documents):
        raise ValueError('summary hash differs from the registered manifest')
    if sum(len(doc['games']) for doc in documents) != manifest['existingGames']:
        raise ValueError('historical game count differs from the registered manifest')
    if len({game['seeds']['map'] for doc in documents for game in doc['games']}) != manifest['seedGroups']:
        raise ValueError('map-seed group count differs from the registered manifest')
    engine_hashes = {doc['engineHash'] for doc in documents}
    if len(engine_hashes) != 1:
        raise ValueError('engineHash mismatch across extraction files')
    baseline = {}
    for doc in documents:
        if doc['variant'] != BASELINE_VARIANT:
            continue
        for game in doc['games']:
            if game['candidateSide'] is not None:
                raise ValueError('baseline must have candidateSide=null')
            key = (doc['style'], game['match'])
            if key in baseline:
                raise ValueError(f'duplicate baseline: {key}')
            baseline[key] = game
    rows = []
    seen = set()
    role_samples = set()
    for doc in documents:
        if doc['variant'] == BASELINE_VARIANT:
            continue
        for game in doc['games']:
            side = game['candidateSide']
            if side is None:
                raise ValueError('candidate extraction must identify candidateSide')
            key = (doc['style'], game['match'])
            if key not in baseline:
                raise ValueError(f'missing baseline for {key}')
            base = baseline[key]
            if base['initialHash'] != game['initialHash'] or base['seeds'] != game['seeds']:
                raise ValueError(f'initialHash/seeds mismatch for {key}')
            unique = (doc['variant'], *key)
            if unique in seen:
                raise ValueError(f'duplicate candidate: {unique}')
            seen.add(unique)
            current_side = game['sides'][side]
            base_side = base['sides'][side]
            if current_side['role'] != base_side['role']:
                raise ValueError(f'role mismatch for {unique}')
            role_key = (doc['variant'], doc['style'], json.dumps(game['seeds']['map'], sort_keys=True), current_side['role'])
            if role_key in role_samples:
                raise ValueError(f'duplicate map-seed/role candidate sample: {role_key}')
            role_samples.add(role_key)
            metrics = {}
            for metric in METRICS:
                if metric not in current_side['metrics'] or metric not in base_side['metrics']:
                    raise ValueError(f'missing metric {metric} for {unique}')
                value, reference = current_side['metrics'][metric], base_side['metrics'][metric]
                if (value is not None and not numeric(value)) or (reference is not None and not numeric(reference)):
                    raise ValueError(f'invalid numeric metric {metric} for {unique}')
                metrics[metric] = value - reference if numeric(value) and numeric(reference) else None
            if metrics['earlyMargin'] is None:
                raise ValueError('earlyMargin is required for conditional prediction')
            if not numeric(current_side['finalMargin']) or not numeric(base_side['finalMargin']):
                raise ValueError('finalMargin must be finite')
            outcome = current_side['finalMargin'] - base_side['finalMargin']
            rows.append({
                'variant': doc['variant'], 'style': doc['style'], 'match': game['match'],
                'mapSeed': json.dumps(game['seeds']['map'], sort_keys=True),
                'seeds': game['seeds'], 'initialHash': game['initialHash'],
                'candidateSide': side, 'role': current_side['role'],
                'sameFinalHashAsBaseline': game['finalHash'] == base['finalHash'],
                'metrics': metrics, 'finalMarginDelta': outcome,
                'subsequentMarginGainDelta': outcome - metrics['earlyMargin'],
            })
    if not rows:
        raise ValueError('no candidate rows')
    return rows, sources, next(iter(engine_hashes))


def role_report(rows, predictive):
    variants = sorted({row['variant'] for row in rows})
    result = {
        'rowCount': len(rows), 'mapSeedCount': len({row['mapSeed'] for row in rows}),
        'variantCount': len(variants),
        'byVariant': {variant: {
            'n': sum(row['variant'] == variant for row in rows),
            'meanFinalMarginDelta': mean([row['finalMarginDelta'] for row in rows if row['variant'] == variant]),
            'meanSubsequentMarginGainDelta': mean([row['subsequentMarginGainDelta'] for row in rows if row['variant'] == variant]),
            'meanMetricDeltas': {metric: mean([row['metrics'][metric] for row in rows
                                             if row['variant'] == variant and numeric(row['metrics'][metric])])
                                 for metric in METRICS},
        } for variant in variants},
        'metrics': {metric: {
            'diagnosticOnly': metric in DIAGNOSTIC_METRICS,
            'vsFinalMarginDelta': association(rows, metric, 'finalMarginDelta'),
            'vsSubsequentMarginGainDelta': association(rows, metric, 'subsequentMarginGainDelta'),
        } for metric in METRICS},
    }
    if predictive:
        result['validation'] = {scheme: cross_validate(rows, scheme) for scheme in (
            'leaveMapSeedOut', 'leaveVariantOut', 'leaveMapSeedAndVariantOut')}
    return result


def self_test():
    assert ranks([2, 1, 2, 4]) == [2.5, 1.0, 2.5, 4.0]
    assert abs(pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-12
    assert pearson([1, 1, 1], [1, 2, 3]) is None
    train = [{'metrics': {'earlyMargin': x}, 'finalMarginDelta': 1 + 2 * x} for x in (-1, 0, 1)]
    prediction = ridge_predict(train, [{'metrics': {'earlyMargin': 2}}], ['earlyMargin'])
    assert abs(prediction[0] - 5) < 1e-10  # Current VP is an unpenalized baseline.
    duplicate_train = [{'metrics': {'earlyMargin': x, 'gainedVp': x / 2}, 'finalMarginDelta': 1 + 2 * x}
                       for x in (-1, 0, 1)]
    duplicate = ridge_predict(duplicate_train, [{'metrics': {'earlyMargin': 2, 'gainedVp': 1}}],
                              ['earlyMargin', 'gainedVp'])
    assert abs(duplicate[0] - prediction[0]) < 1e-10, 'duplicate VP information must not improve prediction'
    prediction = ridge_predict(train, [{'metrics': {'earlyMargin': None}}], ['earlyMargin'])
    assert abs(prediction[0] - 1) < 1e-10  # Training median only.
    missing = [{'metrics': {'earlyMargin': None}, 'finalMarginDelta': value} for value in (1, 3)]
    assert ridge_predict(missing, [{'metrics': {'earlyMargin': 999}}], ['earlyMargin']) == [2.0]
    try:
        ridge_predict(train, train, ['finalMarginDelta'])
    except ValueError:
        pass
    else:
        raise AssertionError('outcome allowed as feature')
    rows = [{'mapSeed': str(seed), 'variant': variant} for seed in range(3) for variant in ('a', 'b', 'c')]
    for scheme in ('leaveMapSeedOut', 'leaveVariantOut', 'leaveMapSeedAndVariantOut'):
        seen = []
        for train_indices, test_indices in fold_indices(rows, scheme):
            seen.extend(test_indices)
            for i in train_indices:
                for j in test_indices:
                    if scheme != 'leaveVariantOut':
                        assert rows[i]['mapSeed'] != rows[j]['mapSeed']
                    if scheme != 'leaveMapSeedOut':
                        assert rows[i]['variant'] != rows[j]['variant']
        assert sorted(seen) == list(range(len(rows)))
    print('self-test: PASS (baseline slope, duplicate information, missing values, ties, outcome exclusion, grouped holdouts)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('outputDir', nargs='?', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        if args.outputDir is None:
            return
    if args.outputDir is None or args.out is None:
        parser.error('outputDir and --out are required for analysis')
    rows, sources, engine_hash = read_rows(args.outputDir, args.out)
    roles = sorted({row['role'] for row in rows})
    if 'ATTACKER' not in roles:
        raise ValueError('no ATTACKER rows for primary analysis')
    report = {
        'schemaVersion': 1, 'analysis': 'exploratory-historical-paired-vp-metrics',
        'cutoffTurn': 4, 'engineHash': engine_hash, 'sources': sources,
        'primaryRole': 'ATTACKER', 'rowCount': len(rows),
        'method': {
            'outcome': 'candidate final VP margin minus same-side baseline final VP margin',
            'features': 'candidate cutoff metric minus same-side baseline cutoff metric',
            'subsequentOutcome': 'finalMarginDelta minus earlyMarginDelta; contains arithmetic coupling with earlyMargin',
            'ridge': 'lambda=1 for added features; train-only median imputation plus missing indicators and standardization; unpenalized intercept and nonconstant earlyMargin slope',
            'bootstrap': '1000 map-seed cluster resamples of fixed cross-validation prediction errors, RNG seed 74319; equal seed weights',
            'diagnosticMetricsExcludedFromPrediction': sorted(DIAGNOSTIC_METRICS),
            'refinement': 'occupiedHeldVp and unoccupiedHeldVp plus occupiedShareMissingOnly were added after inspecting pilot missingness; they reuse exploratory data',
            'positiveImprovement': 'fitted early-margin baseline MAE minus model MAE',
        },
        'limitations': [
            'Historical development variants and seeds were already used during strategy research; cross-validation is not unused independent evidence.',
            'Three related variants and ten expected map seeds give little independent variation; rows are not independent trials.',
            'Associations and conditional prediction do not establish that changing a metric causes VP improvement.',
            'Many exploratory metric comparisons are made without multiplicity correction or nested metric selection; choosing the best requires new validation.',
            'Bootstrap intervals condition on fitted cross-validation predictions and omit model-refitting and metric-selection uncertainty.',
            'Role analyses are separate; defender results are descriptive, not pooled into attacker prediction.',
            'A null correlation means insufficient pairs or zero variance, not evidence of no relationship.',
            'Missing metric deltas require either side missing; zero remains a real observed value.',
            'Search-limited opportunity metrics may underestimate available actions; inspect bestSearchTruncated.',
            'The action generator itself is heuristic: even an untruncated candidate list does not enumerate every legal unit combination.',
            'Historical games include off-map air support despite NONE options; findings do not establish no-air behavior.',
            'objectiveSupplyRequirementTokens sums forecast requirements for objective attacks, not total actual SP expenditure.',
        ],
        'byRole': {role: role_report([row for row in rows if row['role'] == role], role == 'ATTACKER')
                   for role in roles},
        'rows': rows,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'output': str(args.out), 'bytes': args.out.stat().st_size,
                      'roles': {role: report['byRole'][role]['rowCount'] for role in roles}}))


if __name__ == '__main__':
    main()
