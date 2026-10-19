#!/usr/bin/env python3
"""Predict policy VP effects on disjoint seeds using frozen early surrogates."""
import argparse
import copy
import hashlib
import importlib.util
import itertools
import json
import math
import random
import statistics
from collections import Counter, defaultdict
from pathlib import Path

METRICS = ('steps', 'outOfTrace', 'objectiveReachColumn', 'objectiveVpAtRisk',
           'stacksExposedAllocated', 'hqsInReach')
EARLY = ('M0', 'M1', 'M2', 'VP', *METRICS)
METHODS = ('zero', 'trainMean', 'developmentFinal',
           *('identity:' + key for key in ('M0', 'M1', 'M2', 'VP')),
           *('mapped:' + key for key in ('M0', 'M1', 'M2', *METRICS)))
PRIMARY = ('identity:M0', 'identity:M2')
CONTROL_MODES = ('transfer', 'sharedNoiseOnly', 'negativeTransfer', 'familyDirection')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def validate_protocol(protocol):
    require(protocol['schemaVersion'] == 1 and protocol['turn'] == 4, 'unsupported protocol schema or turn')
    require(protocol['primaryContrast'] == 'MSE(identity:M0)-MSE(identity:M2);positive favors M2', 'primary protocol mismatch')
    require(protocol['uncertainty']['draws'] == 10000 and protocol['uncertainty']['seed'] == 20261019,
            'unsupported bootstrap configuration')
    controls = protocol['syntheticControls']
    require((controls['replicates'], controls['seed'], controls['families'], controls['directions'], controls['pairs']) ==
            (500, 20261020, 12, 2, 8) and tuple(controls['modes']) == CONTROL_MODES, 'unsupported control configuration')
    require(protocol['scores'] == ['MSE', 'MAE', 'bias', 'signed correlation', 'MSEskillagainstzero'], 'unsupported scores')
    require(protocol['identityTolerance']['abs'] == 1e-8 and protocol['identityTolerance']['rel'] == 1e-10,
            'unsupported identity tolerance')


def mean(values):
    return statistics.fmean(values)


def covariance(xs, ys):
    require(len(xs) == len(ys) and len(xs) > 1, 'covariance dimensions')
    mx, my = mean(xs), mean(ys)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (len(xs) - 1)


def correlation(xs, ys):
    vx, vy = covariance(xs, xs), covariance(ys, ys)
    return covariance(xs, ys) / math.sqrt(vx * vy) if vx > 0 and vy > 0 else None


def panel_index(panel):
    require(panel, 'empty pair panel')
    index = {(row['variant'], row['pair']): row for row in panel}
    require(len(index) == len(panel), 'duplicate variant/seed pair')
    variants = sorted({row['variant'] for row in panel})
    seeds = sorted({row['pair'] for row in panel})
    require(len(seeds) == 8, 'expected eight shared seed pairs')
    families, climates = {}, defaultdict(set)
    for variant in variants:
        rows = [index.get((variant, seed)) for seed in seeds]
        require(all(rows), 'incomplete variant seed panel')
        require(len({row['family'] for row in rows}) == 1, 'variant family changed')
        families[variant] = rows[0]['family']
        for row in rows:
            require(set(row['early']) == set(EARLY), 'early feature schema mismatch')
            require(all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                        for v in [row['finalVp'], *row['early'].values()]), 'invalid pair value')
            require(row['climate'] == index[(variants[0], row['pair'])]['climate'], 'seed climate changed')
            climates[row['climate']].add(row['pair'])
    require(len(climates) == 2 and all(len(v) == 4 for v in climates.values()), 'expected two climates with four pairs each')
    require(len(variants) == 24 and set(Counter(families.values()).values()) == {2}, 'expected twelve two-variant families')
    return index, variants, seeds, families, {key: sorted(value) for key, value in sorted(climates.items())}


def enumerate_splits(climates):
    all_seeds = set().union(*map(set, climates.values()))
    choices = [list(itertools.combinations(seeds, 2)) for seeds in climates.values()]
    return [{'id': number, 'development': sorted(set().union(*map(set, selected))),
             'evaluation': sorted(all_seeds - set().union(*map(set, selected)))}
            for number, selected in enumerate(itertools.product(*choices))]


def ols(xs, ys):
    mx, my = mean(xs), mean(ys)
    denominator = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denominator if denominator > 0 else 0.0
    return {'intercept': my - slope * mx, 'slope': slope, 'constantInput': denominator == 0}


def development_means(index, variants, split):
    development = split['development']
    x = {v: {key: mean(index[(v, seed)]['early'][key] for seed in development) for key in EARLY} for v in variants}
    y = {v: mean(index[(v, seed)]['finalVp'] for seed in development) for v in variants}
    return x, y


def predict_fold(index, variants, families, split, held_family, methods=METHODS, prepared=None):
    development, evaluation = split['development'], split['evaluation']
    require(not set(development) & set(evaluation), 'development/evaluation seeds overlap')
    train = [v for v in variants if families[v] != held_family]
    test = [v for v in variants if families[v] == held_family]
    require(len(train) == 22 and len(test) == 2, 'family exclusion incomplete')
    x, y = prepared if prepared is not None else development_means(index, variants, split)
    training_mean = mean(y[v] for v in train)
    fitted = {method: ols([x[v][method.split(':', 1)[1]] for v in train], [y[v] for v in train])
              for method in methods if method.startswith('mapped:')}
    predictions = []
    for variant in test:
        values = {}
        for method in methods:
            if method == 'zero':
                value = 0.0
            elif method == 'trainMean':
                value = training_mean
            elif method == 'developmentFinal':
                value = y[variant]
            elif method.startswith('identity:'):
                value = x[variant][method.split(':', 1)[1]]
            else:
                fit = fitted[method]
                value = fit['intercept'] + fit['slope'] * x[variant][method.split(':', 1)[1]]
            require(math.isfinite(value), 'nonfinite prediction')
            values[method] = value
        predictions.append({'split': split['id'], 'family': held_family, 'variant': variant,
                            'observedVp': mean(index[(variant, seed)]['finalVp'] for seed in evaluation),
                            'predictedVp': values})
    return predictions, {'split': split['id'], 'family': held_family, 'trainingVariants': train, 'fits': fitted}


def moments(index, variants, climates, key):
    xs = {seed: [index[(v, seed)]['early'][key] for v in variants] for seeds in climates.values() for seed in seeds}
    ys = {seed: [index[(v, seed)]['finalVp'] for v in variants] for seed in xs}
    climate_x = {c: [mean(xs[s][i] for s in seeds) for i in range(len(variants))] for c, seeds in climates.items()}
    climate_y = {c: [mean(ys[s][i] for s in seeds) for i in range(len(variants))] for c, seeds in climates.items()}
    mean_x = [mean(climate_x[c][i] for c in climates) for i in range(len(variants))]
    mean_y = [mean(climate_y[c][i] for c in climates) for i in range(len(variants))]
    observed = {'xy': covariance(mean_x, mean_y), 'xx': covariance(mean_x, mean_x), 'yy': covariance(mean_y, mean_y)}
    noise = dict.fromkeys(observed, 0.0)
    for climate, seeds in climates.items():
        require(len(seeds) >= 2, 'covariance needs two seeds per climate')
        for seed in seeds:
            rx = [x - m for x, m in zip(xs[seed], climate_x[climate])]
            ry = [y - m for y, m in zip(ys[seed], climate_y[climate])]
            for name, left, right in (('xy', rx, ry), ('xx', rx, rx), ('yy', ry, ry)):
                noise[name] += .25 * covariance(left, right) / (len(seeds) * (len(seeds) - 1))
    corrected = {name: observed[name] - noise[name] for name in observed}
    off_diagonal = 0.0
    for ca, sa in climates.items():
        for cb, sb in climates.items():
            pairs = [(a, b) for a in sa for b in sb if ca != cb or a != b]
            off_diagonal += .25 * mean(covariance(xs[a], ys[b]) for a, b in pairs)
    require(math.isclose(corrected['xy'], off_diagonal, abs_tol=1e-9, rel_tol=1e-10), 'cross-seed covariance algebra mismatch')
    return {'observed': observed, 'estimatedSameSeedContribution': noise, 'crossSeed': corrected,
            'offDiagonalXY': off_diagonal, 'nonpositiveCrossSeedVariance': corrected['xx'] <= 0 or corrected['yy'] <= 0,
            'scope': 'signed finite-panel diagnostic;no latent correlation or corrected prediction slope'}


def transfer_predictions(panel, methods=METHODS, diagnostics=True):
    index, variants, _, families, climates = panel_index(panel)
    splits = enumerate_splits(climates)
    rows, folds = [], []
    for split in splits:
        prepared = development_means(index, variants, split)
        local_climates = {c: [s for s in seeds if s in split['development']] for c, seeds in climates.items()}
        for family in sorted(set(families.values())):
            predicted, fold = predict_fold(index, variants, families, split, family, methods, prepared)
            rows.extend(predicted)
            if diagnostics:
                train = fold['trainingVariants']
                fold['moments'] = {key: moments(index, train, local_climates, key) for key in EARLY if key != 'VP'}
            folds.append(fold)
    return rows, folds, splits


def score(rows, method):
    errors = [row['predictedVp'][method] - row['observedVp'] for row in rows]
    mse = mean(e * e for e in errors)
    zero_mse = mean(row['observedVp'] ** 2 for row in rows)
    return {'count': len(rows), 'mse': mse, 'mae': mean(abs(e) for e in errors), 'bias': mean(errors),
            'signedCorrelation': correlation([row['predictedVp'][method] for row in rows], [row['observedVp'] for row in rows]),
            'mseSkillAgainstZero': 1 - mse / zero_mse if zero_mse > 0 else None}


def paired_difference(rows, baseline, candidate):
    return mean((row['predictedVp'][baseline] - row['observedVp']) ** 2 -
                (row['predictedVp'][candidate] - row['observedVp']) ** 2 for row in rows)


def family_interval(rows, baseline, candidate):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row['family']].append(row)
    family_values = {key: paired_difference(values, baseline, candidate) for key, values in sorted(grouped.items())}
    rng = random.Random(20261019)
    values = sorted(mean(rng.choices(list(family_values.values()), k=len(family_values))) for _ in range(10000))
    return {'estimate': mean(family_values.values()), 'lower': values[249], 'upper': values[9749],
            'familyDifferences': family_values, 'families': len(family_values), 'draws': 10000,
            'scope': 'descriptive family resampling conditional on fixed predictions and these maps;no refit or map-population coverage'}


def summarize(panel, rows, folds, splits):
    methods = tuple(rows[0]['predictedVp'])
    scores = {method: score(rows, method) for method in methods}
    family_scores = {family: {method: score([r for r in rows if r['family'] == family], method) for method in methods}
                     for family in sorted({r['family'] for r in rows})}
    split_scores = []
    selection = []
    for split in splits:
        subset = [row for row in rows if row['split'] == split['id']]
        split_scores.append({**split, 'primaryGain': paired_difference(subset, *PRIMARY),
                             'scores': {method: score(subset, method) for method in methods}})
        for method in methods:
            chosen = min(subset, key=lambda row: (-row['predictedVp'][method], row['variant']))
            positive = [r for r in subset if r['predictedVp'][method] > 0]
            selection.append({'split': split['id'], 'method': method, 'selectedVariant': chosen['variant'],
                              'predictedVp': chosen['predictedVp'][method], 'observedVp': chosen['observedVp'],
                              'gainOverAllPolicyMean': chosen['observedVp'] - mean(r['observedVp'] for r in subset),
                              'positivePredictionCount': len(positive),
                              'positivePredictionObservedMean': mean(r['observedVp'] for r in positive) if positive else None})
    index, variants, _, _, climates = panel_index(panel)
    by_split = {split['id']: split for split in splits}
    complements = {tuple(split['development']): split['id'] for split in splits}
    partitions = []
    for split in splits:
        other = complements[tuple(split['evaluation'])]
        if split['id'] < other:
            partitions.append({'splits': [split['id'], other],
                               'primaryGain': paired_difference([r for r in rows if r['split'] in (split['id'], other)], *PRIMARY)})
    climate_scores = {}
    for climate, seeds in climates.items():
        local_rows = [{**row, 'observedVp': mean(index[(row['variant'], seed)]['finalVp']
                                                for seed in by_split[row['split']]['evaluation'] if seed in seeds)} for row in rows]
        climate_scores[climate] = {'scope': 'same climate-balanced prediction scored on this climate evaluation mean',
                                   'scores': {method: score(local_rows, method) for method in methods},
                                   'primaryGain': paired_difference(local_rows, *PRIMARY)}
    return {'scores': scores, 'familyScores': family_scores, 'splitScores': split_scores, 'selection': selection,
            'complementaryPartitions': partitions, 'climateScores': climate_scores,
            'leaveOneFamilyOutPrimary': {family: paired_difference([r for r in rows if r['family'] != family], *PRIMARY)
                                        for family in family_scores},
            'primaryContrast': {'baseline': PRIMARY[0], 'candidate': PRIMARY[1], 'positiveFavorsCandidate': True,
                                **family_interval(rows, *PRIMARY)},
            'candidateVersusZero': {method: family_interval(rows, 'zero', method) for method in methods if method != 'zero'},
            'samePanelContextMoments': {key: moments(index, variants, climates, key) for key in EARLY if key != 'VP'},
            'constantCalibrations': sum(fit['constantInput'] for fold in folds for fit in fold['fits'].values())}


def synthetic_panel(mode, rng):
    panel = []
    for family in range(12):
        shared = rng.gauss(0, 1)
        polarity = rng.choice((-1, 1))
        for direction in range(2):
            theta = (2 * direction - 1) * (1 + abs(shared)) if mode == 'familyDirection' else shared + rng.gauss(0, 1)
            for seed in range(8):
                noise = rng.gauss(0, 1)
                if mode == 'sharedNoiseOnly':
                    x, y = noise, noise
                elif mode == 'familyDirection':
                    x, y = theta + .1 * noise, polarity * 2 * theta + .1 * rng.gauss(0, 1)
                else:
                    x = (1 if mode == 'transfer' else -1) * theta + .1 * noise
                    y = 2 * theta + .1 * rng.gauss(0, 1)
                early = dict.fromkeys(EARLY, x)
                early.update(M0=0.0, VP=0.0)
                panel.append({'variant': f'v{family:02}-{direction}', 'family': f'f{family:02}', 'direction': str(direction),
                              'pair': seed, 'climate': 'a' if seed < 4 else 'b', 'finalVp': y, 'early': early, 'games': []})
    return panel


def self_test(out=None):
    rng = random.Random(20261020)
    results = {}
    methods = ('zero', 'trainMean', 'identity:M0', 'identity:M2', 'mapped:M2')
    for mode in CONTROL_MODES:
        samples = []
        for _ in range(500):
            panel = synthetic_panel(mode, rng)
            rows, folds, splits = transfer_predictions(panel, methods, diagnostics=False)
            index, variants, seeds, families, climates = panel_index(panel)
            xs = [mean(index[(v, s)]['early']['M2'] for s in seeds) for v in variants]
            ys = [mean(index[(v, s)]['finalVp'] for s in seeds) for v in variants]
            sample = {'identityGainOverZero': paired_difference(rows, 'zero', 'identity:M2'),
                      'mappedGainOverZero': paired_difference(rows, 'zero', 'mapped:M2'),
                      'identityGainOverTrainMean': paired_difference(rows, 'trainMean', 'identity:M2'),
                      'mappedGainOverTrainMean': paired_difference(rows, 'trainMean', 'mapped:M2'),
                      'meanMappedSlope': mean(fold['fits']['mapped:M2']['slope'] for fold in folds),
                      'samePanelSignedCorrelation': correlation(xs, ys),
                      'crossSeedCovariance': moments(index, variants, climates, 'M2')['crossSeed']['xy']}
            if mode == 'familyDirection':
                leaky = []
                for split in splits:
                    x, y = development_means(index, variants, split)
                    for family in sorted(set(families.values())):
                        held = [v for v in variants if families[v] == family]
                        fit = ols([x[v]['M2'] for v in held], [y[v] for v in held])
                        for variant in held:
                            observed = mean(index[(variant, seed)]['finalVp'] for seed in split['evaluation'])
                            prediction = fit['intercept'] + fit['slope'] * x[variant]['M2']
                            leaky.append(observed ** 2 - (prediction - observed) ** 2)
                sample['deliberatelyLeakyGainOverZero'] = mean(leaky)
            samples.append(sample)
        summary = {key: {'mean': mean(s[key] for s in samples),
                         'monteCarloSE': statistics.stdev(s[key] for s in samples) / math.sqrt(len(samples))}
                   for key in samples[0]}
        summary['replicates'] = 500
        summary['replicateStatistics'] = samples
        if mode == 'transfer':
            for key in ('identityGainOverZero', 'mappedGainOverZero', 'identityGainOverTrainMean', 'mappedGainOverTrainMean'):
                assert summary[key]['mean'] > 3 * summary[key]['monteCarloSE']
            assert summary['meanMappedSlope']['mean'] > 0
        elif mode == 'sharedNoiseOnly':
            assert all(math.isclose(s['samePanelSignedCorrelation'], 1, abs_tol=1e-12) for s in samples)
            assert summary['identityGainOverZero']['mean'] < 0 and summary['mappedGainOverZero']['mean'] < 0
            assert abs(summary['crossSeedCovariance']['mean']) < 4 * summary['crossSeedCovariance']['monteCarloSE']
        elif mode == 'negativeTransfer':
            assert summary['identityGainOverZero']['mean'] < 0 and summary['mappedGainOverZero']['mean'] > 0
            assert summary['crossSeedCovariance']['mean'] < 0 and summary['meanMappedSlope']['mean'] < 0
        else:
            assert summary['mappedGainOverZero']['mean'] < 0 < summary['deliberatelyLeakyGainOverZero']['mean']
        results[mode] = summary
    panel = synthetic_panel('transfer', random.Random(2))
    index, variants, seeds, families, climates = panel_index(panel)
    splits = enumerate_splits(climates)
    assert len(splits) == 36 and len({tuple(s['development']) for s in splits}) == 36
    split, family = splits[0], families[variants[0]]
    original, fit = predict_fold(index, variants, families, split, family)
    cached, cached_fit = predict_fold(index, variants, families, split, family,
                                     prepared=development_means(index, variants, split))
    assert (original, fit) == (cached, cached_fit)
    assert len(fit['trainingVariants']) == 22 and all(families[v] != family for v in fit['trainingVariants'])
    for change in ('evaluationEarly', 'evaluationFinal', 'heldFamilyDevelopmentFinal'):
        altered = copy.deepcopy(index)
        for (variant, seed), row in altered.items():
            if seed in split['evaluation']:
                if change == 'evaluationEarly':
                    row['early'] = dict.fromkeys(EARLY, 1e8)
                if change == 'evaluationFinal':
                    row['finalVp'] += 50
            elif families[variant] == family and change == 'heldFamilyDevelopmentFinal':
                row['finalVp'] += 100
        changed, _ = predict_fold(altered, variants, families, split, family)
        for a, b in zip(original, changed):
            for method in METHODS:
                if method != 'developmentFinal':
                    assert a['predictedVp'][method] == b['predictedVp'][method]
        if change == 'evaluationFinal':
            assert score(original, PRIMARY[1])['mse'] != score(changed, PRIMARY[1])['mse']
    rows, _, _ = transfer_predictions(panel, methods, False)
    reordered, _, _ = transfer_predictions(list(reversed(panel)), methods, False)
    assert rows == reordered
    reversed_panel = copy.deepcopy(panel)
    for row in reversed_panel:
        row['finalVp'] *= -1
        row['early'] = {key: -value for key, value in row['early'].items()}
    reversed_rows, _, _ = transfer_predictions(reversed_panel, methods, False)
    for a, b in zip(rows, reversed_rows):
        for method in methods:
            assert math.isclose(a['predictedVp'][method], -b['predictedVp'][method], abs_tol=1e-10)
    assert math.isclose(score(rows, PRIMARY[1])['mse'], score(reversed_rows, PRIMARY[1])['mse'], abs_tol=1e-10)
    exact = [{'family': 'f', 'predictedVp': {'zero': 0, 'model': 1}, 'observedVp': 3},
             {'family': 'g', 'predictedVp': {'zero': 0, 'model': 2}, 'observedVp': 0}]
    assert score(exact, 'model')['mse'] == 4 and score(exact, 'model')['mae'] == 2
    assert paired_difference(exact, 'zero', 'model') == .5
    for broken in (panel + [panel[0]], panel[1:]):
        try:
            panel_index(broken)
        except ValueError:
            pass
        else:
            raise AssertionError('invalid panel accepted')
    report = {'status': 'VERIFIED_CONTROLS', 'simulations': results,
              'checks': ['exact VP errors', 'complete panel and family exclusion', '36 balanced splits',
                         'shared-noise null versus genuine and negative transfer', 'off-diagonal covariance algebra',
                         'fold-local outcome and feature perturbation', 'row reorder and sign invariance']}
    if out:
        write_json(out, report)
    print(json.dumps({**report, 'simulations': {mode: {k: v for k, v in values.items() if k != 'replicateStatistics'}
                                             for mode, values in results.items()}}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--protocol', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test(args.out)
        return
    require(args.artifact_root and args.out and args.protocol, '--artifact-root, --out and --protocol required')
    root = Path(__file__).resolve().parent.parent
    protocol_raw = args.protocol.read_bytes()
    protocol = json.loads(protocol_raw)
    validate_protocol(protocol)
    spec = importlib.util.spec_from_file_location('transfer_inputs', Path(__file__).with_name('ai-surrogate-transfer-inputs.py'))
    inputs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(inputs)
    evidence = root / 'docs/quality/evidence/ai-position-surrogacy-2026-10-19'
    panel, input_audit = inputs.load_panel(root, args.artifact_root.resolve(), evidence / 'registration.json',
                                          evidence / 'manifest.json', evidence / 'results.json')
    args.out.mkdir(parents=True, exist_ok=True)
    write_json(args.out / 'panel.json', panel)
    rows, folds, splits = transfer_predictions(panel)
    write_json(args.out / 'predictions.json', rows)
    write_json(args.out / 'folds.json', folds)
    summary = summarize(panel, rows, folds, splits)
    summary.update({'status': 'REPORTED_EXPLORATORY', 'protocol': protocol, 'protocolSha256': sha(protocol_raw),
                    'executionContract': {'methods': list(METHODS), 'splitCount': len(splits),
                                          'predictionsPerMethod': len(rows), 'calibrationFolds': len(folds),
                                          'selectionTieBreak': 'lexical variant ID', 'protocolIsMethodSelector': False},
                    'inputs': input_audit, 'panelSha256': sha((args.out / 'panel.json').read_bytes()),
                    'predictionSha256': sha((args.out / 'predictions.json').read_bytes()),
                    'foldsSha256': sha((args.out / 'folds.json').read_bytes()),
                    'sourceSha256': {p.name: sha(p.read_bytes()) for p in
                                     (Path(__file__), Path(inputs.__file__))},
                    'interpretation': 'Historical policy/seed transfer;fixed identity primary. Repeated splits are dependent;no prospective, latent-effect or reward qualification.'})
    write_json(args.out / 'analysis.json', summary)
    print(json.dumps({'status': summary['status'], 'primary': summary['primaryContrast'], 'scores': summary['scores']}, sort_keys=True))


if __name__ == '__main__':
    main()
