#!/usr/bin/env python3
"""Compare cutoff indicators against paired VP, loss-event and supply outcomes."""

import argparse
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('vp_metrics', Path(__file__).with_name('ai-vp-metrics-compare.py'))
vp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vp)

SUPPLY_FEATURES = (
    'supplyTraceGap', 'supplyIndividualGap', 'supplyJointGap',
    'supplySingleSourceDependence', 'remainingReShare',
)
FEATURES = (
    'earlyMargin', 'objectiveAttacks', 'objectiveAttackMeanColumn',
    'objectiveAttackCaptureRate', 'adjacentStrengthShare', 'outOfSupplyStrengthShare',
    *SUPPLY_FEATURES,
)
OUTCOMES = {
    'vp': {'key': 'finalMargin', 'direction': 'higher', 'primary': True, 'rateFactor': 1},
    'kill': {'key': 'enemyLossEvents', 'direction': 'higher', 'primary': True, 'rateFactor': 2},
    'loss': {'key': 'lossEvents', 'direction': 'lower', 'primary': True, 'rateFactor': 2},
    'supply': {'key': 'supplyBurden', 'direction': 'lower', 'primary': True, 'rateFactor': 1},
    'combatKill': {'key': 'enemyCombatLossEvents', 'direction': 'higher', 'primary': False, 'rateFactor': 2},
    'combatLoss': {'key': 'combatLossEvents', 'direction': 'lower', 'primary': False, 'rateFactor': 2},
    'attritionLoss': {'key': 'attritionLossEvents', 'direction': 'lower', 'primary': False, 'rateFactor': 2},
}
SCHEMES = ('leaveMapSeedOut', 'leaveVariantOut', 'leaveMapSeedAndVariantOut')


def read_rows(directory, output):
    rows, sources, engine_hash = vp.read_rows(directory, output)
    games = {}
    for source in sources:
        doc = json.loads(Path(source).read_text())
        for game in doc['games']:
            games[(doc['variant'], doc['style'], game['match'])] = game
    for row in rows:
        game = games[(row['variant'], row['style'], row['match'])]
        base = games[(vp.BASELINE_VARIANT, row['style'], row['match'])]
        side = row['candidateSide']
        current, reference = game['sides'][side], base['sides'][side]
        if 'advanced' not in current or 'advanced' not in reference:
            raise ValueError('replay with --advanced before multi-outcome analysis')
        a, b = current['advanced'], reference['advanced']
        for observation in (a, b):
            if (observation.get('schemaVersion') != 1 or observation.get('turnLimit') != 8
                    or observation.get('cutoffTurn') != 4):
                raise ValueError('advanced observations must use schema 1 and T4 of eight turns')
            coverage = observation.get('supplyCoverage', {})
            if (coverage.get('earlyTurns') != [1, 2, 3, 4]
                    or coverage.get('futureTurns') != [5, 6, 7, 8]
                    or coverage.get('missingTurns') != []):
                raise ValueError('supply outcome requires all eight owner-phase observations')
        for feature in SUPPLY_FEATURES:
            values = (a['metrics'][feature], b['metrics'][feature])
            if any(value is not None and not vp.numeric(value) for value in values):
                raise ValueError(f'invalid advanced feature {feature}')
            row['metrics'][feature] = values[0] - values[1] if all(vp.numeric(x) for x in values) else None
        row['earlyOutcomes'] = {'vp': row['metrics']['earlyMargin']}
        row['outcomes'] = {'vp': row['finalMarginDelta']}
        for name, definition in OUTCOMES.items():
            if name == 'vp':
                continue
            key = definition['key']
            for target, field in (('earlyOutcomes', 'early'), ('outcomes', 'outcomes')):
                values = (a[field][key], b[field][key])
                if not all(vp.numeric(value) for value in values):
                    raise ValueError(f'undefined {field}.{key} for {row["variant"]}/{row["match"]}')
                row[target][name] = values[0] - values[1]
    return rows, sources, engine_hash


def predict(train, test, features):
    return vp.ridge_predict(train, test, features, outcome='target', baseline='currentOutcome',
                            allowed_features=('currentOutcome', *FEATURES))


def cross_validate(rows, scheme, rate_factor):
    models = {'zero': None, 'trainMean': None, 'carryForward': None,
              'earlyRateProjection': None, 'fittedEarlyOutcome': ['currentOutcome']}
    for feature in FEATURES:
        models[f'plus:{feature}'] = ['currentOutcome', feature]
        if any(row['metrics'][feature] is None for row in rows):
            models[f'missingOnly:{feature}'] = ['currentOutcome', feature]
    predictions = {name: [None] * len(rows) for name in models}
    folds = list(vp.fold_indices(rows, scheme))
    seen = [0] * len(rows)
    for train_indices, test_indices in folds:
        train = [rows[i] for i in train_indices]
        test = [rows[i] for i in test_indices]
        if not train or not test:
            raise ValueError('empty training/test fold')
        for i in test_indices:
            seen[i] += 1
        for name, features in models.items():
            if name == 'zero':
                values = [0.0] * len(test)
            elif name == 'trainMean':
                values = [vp.mean([row['target'] for row in train])] * len(test)
            elif name in ('carryForward', 'earlyRateProjection'):
                factor = rate_factor if name == 'earlyRateProjection' else 1
                values = [factor * row['metrics']['currentOutcome'] for row in test]
            elif name.startswith('missingOnly:'):
                feature = name.split(':', 1)[1]
                def mask(row):
                    value = row['metrics'][feature]
                    return {**row, 'metrics': {**row['metrics'], feature: 0 if vp.numeric(value) else None}}
                values = predict([mask(row) for row in train], [mask(row) for row in test], features)
            else:
                values = predict(train, test, features)
            for i, value in zip(test_indices, values):
                predictions[name][i] = value
    if seen != [1] * len(rows):
        raise ValueError('each sample must receive exactly one held-out prediction')
    errors = {name: [abs(row['target'] - value) for row, value in zip(rows, values)]
              for name, values in predictions.items()}
    results = {}
    for name, values in errors.items():
        results[name] = {
            'mae': vp.mean(values),
            'vsFitted': vp.paired_bootstrap(rows, values, errors['fittedEarlyOutcome']),
            'vsCarry': vp.paired_bootstrap(rows, values, errors['carryForward']),
            'vsEarlyRate': vp.paired_bootstrap(rows, values, errors['earlyRateProjection']),
            'byVariantMae': {variant: vp.mean([error for row, error in zip(rows, values)
                                             if row['variant'] == variant])
                             for variant in sorted({row['variant'] for row in rows})},
            'predictions': predictions[name],
        }
    return {'foldCount': len(folds), 'models': results}


def analyze(rows):
    output = {}
    for name, definition in OUTCOMES.items():
        selected = [{**row, 'target': row['outcomes'][name],
                     'metrics': {**row['metrics'], 'currentOutcome': row['earlyOutcomes'][name]}}
                    for row in rows]
        output[name] = {
            **definition,
            'rowCount': len(rows),
            'variantMeans': {variant: vp.mean([row['target'] for row in selected if row['variant'] == variant])
                             for variant in sorted({row['variant'] for row in rows})},
            'associations': {feature: vp.association(selected, feature, 'target') for feature in FEATURES},
            'validation': {scheme: cross_validate(selected, scheme, definition['rateFactor']) for scheme in SCHEMES},
        }
    return output


def self_test():
    vp.self_test()
    train = [{'metrics': {'currentOutcome': x, 'supplyJointGap': x / 3}, 'target': 2 + 4 * x}
             for x in (-2, 0, 2)]
    test = [{'metrics': {'currentOutcome': 1, 'supplyJointGap': 1 / 3}}]
    baseline = predict(train, test, ['currentOutcome'])[0]
    duplicate = predict(train, test, ['currentOutcome', 'supplyJointGap'])[0]
    assert abs(baseline - 6) < 1e-10 and abs(duplicate - baseline) < 1e-10
    try:
        predict(train, test, ['currentOutcome', 'target'])
    except ValueError:
        pass
    else:
        raise AssertionError('future outcome accepted as an input feature')
    rows = []
    for seed in range(10):
        for index, variant in enumerate(('a', 'b', 'c')):
            current, signal = seed % 3 - 1, (seed - 4.5) * (index + 1)
            features = {name: 0.0 for name in FEATURES}
            features.update(currentOutcome=current, supplyJointGap=signal)
            rows.append({'mapSeed': str(seed), 'variant': variant, 'metrics': features,
                         'target': current + 4 * signal})
    result = cross_validate(rows, 'leaveMapSeedAndVariantOut', 1)['models']
    assert result['plus:supplyJointGap']['mae'] < result['fittedEarlyOutcome']['mae'] * .2
    print('multi-outcome self-test: PASS (baseline slope, duplicate signal, future exclusion, known-signal sensitivity)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        if args.directory is None:
            return
    if args.directory is None or args.out is None:
        parser.error('directory and --out required')
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    if manifest['cutoffTurn'] != 4:
        raise ValueError('this registered analysis uses T4 of eight turns')
    rows, sources, engine_hash = read_rows(args.directory, args.out)
    primary = [row for row in rows if row['role'] == 'ATTACKER']
    report = {
        'schemaVersion': 1, 'analysis': 'exploratory-historical-multi-outcome',
        'engineHash': engine_hash, 'sources': sources, 'rows': rows,
        'primaryRole': 'ATTACKER', 'primary': analyze(primary),
        'defenderDescriptive': {
            name: {variant: vp.mean([row['outcomes'][name] for row in rows
                                     if row['role'] == 'DEFENDER' and row['variant'] == variant])
                   for variant in sorted({row['variant'] for row in rows})}
            for name in OUTCOMES
        },
        'method': {
            'sample': 'Same frozen-engine historical cohort and exact initial-hash/full-seed pairing as VP pilot.',
            'features': list(FEATURES),
            'currentOutcome': 'T1-4 same outcome; VP uses T4 control margin; supply uses early mean burden.',
            'targets': 'Final cumulative events, final VP margin, and T5-end mean supply burden. Candidate minus same-side self-play.',
            'countProjection': 'Early cumulative count difference multiplied by 8/4; no multiplier for VP or mean supply burden.',
            'ridge': 'Unpenalized intercept and current-outcome slope, added coefficients lambda=1; train-only preprocessing.',
            'bootstrap': '1000 seed-cluster resamples of fixed CV errors; conditional intervals omit fitting and selection uncertainty.',
        },
        'limitations': [
            'All data are previously inspected development games, not prospective validation.',
            'Three related assault variants and ten seeds; all three attacker mean VP changes are negative.',
            'Defender j/q variants share behavior; defender results remain descriptive.',
            'Multiple outcomes and features are explored without multiplicity correction or nested selection.',
            'Enemy loss events include attrition; they do not establish kills caused by our policy.',
            'Fixed initial RE denominators do not prevent destruction from reducing later supply demand.',
            'Joint gap is the existing priority allocator unallocated demand, not an optimal allocation or causal effect.',
            'Each condition is added separately to the early-outcome baseline; this does not test joint allocation conditional on individual access.',
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'output': str(args.out), 'rows': len(rows), 'primaryRows': len(primary),
                      'outcomes': len(OUTCOMES), 'bytes': args.out.stat().st_size}))


if __name__ == '__main__':
    main()
