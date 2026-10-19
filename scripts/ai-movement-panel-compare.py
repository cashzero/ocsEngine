#!/usr/bin/env python3
import argparse
import copy
import hashlib
import itertools
import json
import math
from collections import defaultdict
from pathlib import Path

DIAGNOSTICS = ['routeRefusals', 'exhaustedGroups', 'scoreBlocked', 'crowdingCrossing',
               'exposureCrossing', 'correctionBudget']
FEATURES = [f'{basis}:{name}' for basis in ('path', 'approach') for name in DIAGNOSTICS]


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fit(rows, feature=None, with_vp=True):
    y = [float(row['y']) for row in rows]
    vp = [float(row['early']['VP']) for row in rows]
    y_mean, vp_mean = math.fsum(y) / len(y), math.fsum(vp) / len(vp)
    centered_y = [value - y_mean for value in y]
    centered_vp = [value - vp_mean for value in vp]
    vp_square = math.fsum(value * value for value in centered_vp) if with_vp else 0.0
    coefficients, rank = {'intercept': y_mean}, 1
    vp_slope = math.fsum(a * b for a, b in zip(centered_vp, centered_y)) / vp_square if vp_square else 0.0
    if vp_square:
        coefficients['vp'] = vp_slope; rank += 1
    feature_mean, feature_sd = 0.0, 0.0
    if feature:
        x = [float(row['features'][feature]) for row in rows]
        feature_mean = math.fsum(x) / len(x)
        feature_sd = math.sqrt(math.fsum((value - feature_mean) ** 2 for value in x) / len(x))
        if feature_sd > 0:
            z = [(value - feature_mean) / feature_sd for value in x]
            overlap = math.fsum(a * b for a, b in zip(z, centered_vp)) / vp_square if vp_square else 0.0
            residual_z = [a - overlap * b for a, b in zip(z, centered_vp)]
            residual_square = math.fsum(value * value for value in residual_z)
            extra = math.fsum(a * b for a, b in zip(residual_z, centered_y)) / (residual_square + 1.0)
            coefficients['extra'] = extra
            if vp_square:
                coefficients['vp'] = vp_slope - overlap * extra
            rank += int(residual_square > 1e-12 * len(rows))
    return {'coefficients': coefficients, 'vpMean': vp_mean, 'featureMean': feature_mean,
            'featureSd': feature_sd, 'feature': feature, 'rank': rank,
            'trainingRows': len(rows), 'objective': 'sumSquaredError+standardizedExtraCoefficientSquared'}


def predict(model, row):
    coefficients = model['coefficients']
    value = coefficients['intercept'] + coefficients.get('vp', 0) * (row['early']['VP'] - model['vpMean'])
    if model['featureSd'] > 0:
        value += coefficients.get('extra', 0) * (row['features'][model['feature']] - model['featureMean']) / model['featureSd']
    return value


def mean_row(rows):
    ordered = sorted(rows, key=lambda row: (row['climate'], row['pair']))
    return {'y': math.fsum(row['finalVp'] for row in ordered) / len(ordered),
            'early': {key: math.fsum(row['early'][key] for row in ordered) / len(ordered)
                      for key in ('VP', 'M0', 'M1', 'M2')},
            'features': {key: math.fsum(row['features'][key] for row in ordered) / len(ordered) for key in FEATURES}}


def predictions(panel):
    climates = sorted({row['climate'] for row in panel})
    require(len(climates) == 2, 'Expected two climates')
    seeds = {climate: sorted({row['pair'] for row in panel if row['climate'] == climate}) for climate in climates}
    require(all(len(value) == 2 for value in seeds.values()), 'Expected two seeds per climate')
    variants = sorted({row['variant'] for row in panel})
    family_of = {row['variant']: row['family'] for row in panel}
    outputs = []
    for split, choices in enumerate(itertools.product(range(2), repeat=2)):
        development = {seeds[climate][choice] for climate, choice in zip(climates, choices)}
        evaluation = {seeds[climate][1 - choice] for climate, choice in zip(climates, choices)}
        dev = {variant: mean_row([row for row in panel if row['variant'] == variant and row['pair'] in development])
               for variant in variants}
        for variant in variants:
            family = family_of[variant]
            train_variants = [other for other in variants if family_of[other] != family]
            train = [dev[other] for other in train_variants]
            require(len(train) == 8, 'Expected eight calibration variants outside held family')
            fitted = {'vpFit': fit(train)}
            for feature in FEATURES:
                fitted[f'alone:{feature}'] = fit(train, feature, False)
                fitted[f'vp+:{feature}'] = fit(train, feature, True)
            values = {'zero': 0.0, 'trainMean': math.fsum(row['y'] for row in train) / len(train),
                      **{f'identity:{name}': dev[variant]['early'][name] for name in ('M0', 'M1', 'M2')},
                      **{name: predict(model, dev[variant]) for name, model in fitted.items()}}
            targets = [row for row in panel if row['variant'] == variant and row['pair'] in evaluation]
            outputs.append({'split': split, 'variant': variant, 'family': family,
                            'developmentSeeds': sorted(development), 'evaluationSeeds': sorted(evaluation),
                            'trainVariants': train_variants, 'trainMean': values['trainMean'],
                            'observed': math.fsum(row['finalVp'] for row in targets) / len(targets),
                            'byClimate': {row['climate']: row['finalVp'] for row in targets},
                            'predictions': values, 'fits': fitted})
    return outputs


def score(rows, climate=None):
    models = sorted(rows[0]['predictions'])
    result = {}
    for model in models:
        errors = [row['predictions'][model] - (row['observed'] if climate is None else row['byClimate'][climate]) for row in rows]
        result[model] = {'mse': math.fsum(value * value for value in errors) / len(errors),
                         'mae': math.fsum(abs(value) for value in errors) / len(errors),
                         'bias': math.fsum(errors) / len(errors), 'predictionRows': len(rows)}
    return result


def load_panel(cohort_path, game_directory, registration):
    cohort_raw = cohort_path.read_bytes(); cohort = json.loads(cohort_raw)
    require(digest(cohort_raw) == registration['cohortSha256'], 'Cohort hash mismatch')
    panel, audits, game_support = [], [], []
    game_index = 0
    for pair in cohort['pairs']:
        features = []
        for game in pair['games']:
            path = game_directory / f'game-{game_index}.json'; raw = path.read_bytes(); data = json.loads(raw)
            require(data['gameIndex'] == game_index and data['game']['saveSha256'] == game['saveSha256'], 'Game identity mismatch')
            require(data['provenance']['cohortSha256'] == registration['cohortSha256'], 'Game cohort binding mismatch')
            require(data['provenance']['scriptSha256'] == registration['recorderSha256'], 'Mixed recorder source hashes')
            require(data['provenance']['engineTreeSha256'] == registration['engineTreeSha256'], 'Mixed runtime hashes')
            require(data['verification']['historicalTrajectoryMatched'] and
                    data['verification']['acceptedActionsMatched'] == game['acceptedActions'] and
                    data['verification']['finalStateHash'] == game['finalStateHash'], 'Historical trajectory did not match')
            require(all(row['gameTurn'] < 4 for row in data['groupRows']), 'Post-cutoff group in feature data')
            player = game['variantPlayer']; opponent = next(other for other in data['features'] if other != player)
            feature = {f'{basis}:{name}': data['features'][player][basis][name] - data['features'][opponent][basis][name]
                       for basis in ('path', 'approach') for name in DIAGNOSTICS}
            require(all(math.isfinite(value) for value in feature.values()), 'Nonfinite feature')
            features.append(feature)
            audits.append({'gameIndex': game_index, 'path': str(path), 'sha256': digest(raw), 'trajectory': game['id']})
            game_support.append({'gameIndex': game_index, 'variant': pair['variant'], 'climate': pair['climate'],
                                 'diagnostics': data['diagnostics'], 'features': feature,
                                 'featuresByPlayer': data['features'],
                                 'windowSupportByBasis': {basis: sum(window['basis'] == basis for window in data['windows'])
                                                          for basis in ('path', 'approach')},
                                 'controlChanges': len(data['controlEvents']), 'verification': data['verification']})
            game_index += 1
        require(len(features) == 2, 'Missing seat mate')
        panel.append({key: pair[key] for key in ('variant', 'family', 'direction', 'climate', 'pair', 'early', 'finalVp')}
                     | {'features': {key: math.fsum(row[key] for row in features) / 2 for key in FEATURES}})
    require(game_index == 80 and len(panel) == 40, 'Expected complete 80-game cohort')
    return panel, audits, game_support


def self_test():
    constant = [{'y': float(i), 'early': {'VP': 7.0}, 'features': {key: 2.0 for key in FEATURES}} for i in range(8)]
    model = fit(constant, FEATURES[0]); require(model['featureSd'] == 0 and 'vp' not in model['coefficients'], 'Constant-column handling failed')
    require(abs(predict(model, constant[0]) - 3.5) < 1e-12, 'Constant model must predict training mean')
    panel = []
    for family in range(5):
        for direction in (-1, 1):
            for climate, seeds in [('A', [1, 2]), ('B', [3, 4])]:
                for seed in seeds:
                    signal = direction * (family + 1)
                    panel.append({'variant': f'f{family}:{direction}', 'family': f'f{family}', 'direction': direction,
                                  'climate': climate, 'pair': seed, 'finalVp': signal,
                                  'early': dict.fromkeys(('VP', 'M0', 'M1', 'M2'), 0.0),
                                  'features': {key: float(signal) for key in FEATURES}})
    original = predictions(panel)
    permuted = predictions(list(reversed(panel)))
    require(canonical(original) == canonical(permuted), 'Row-order invariance failed')
    altered = copy.deepcopy(panel)
    evaluation = set(original[0]['evaluationSeeds'])
    for row in altered:
        if row['pair'] in evaluation:
            row['finalVp'] += 1000
            row['features'] = dict.fromkeys(FEATURES, 9999.0)
            row['early'] = dict.fromkeys(('VP', 'M0', 'M1', 'M2'), 9999.0)
    changed = predictions(altered)
    before = [row for row in original if row['split'] == 0]
    after = [row for row in changed if row['split'] == 0]
    require(all(a['predictions'] == b['predictions'] and a['fits'] == b['fits'] for a, b in zip(before, after)), 'Evaluation data leaked into predictions')
    require(score(before) != score(after), 'Changed evaluation outcomes did not change score')
    altered = copy.deepcopy(panel)
    held = original[0]['family']
    for row in altered:
        if row['family'] == held:
            row['finalVp'] += 10000
    changed = predictions(altered)
    require(all(a['fits'] == b['fits'] for a, b in zip(original, changed) if a['family'] == held), 'Held-family outcomes leaked into fits')
    scores = score(original)
    require(scores[f'vp+:{FEATURES[0]}']['mse'] < scores['zero']['mse'], 'True transferable signal was not detected')
    return {'constantColumns': True, 'rowOrder': True, 'evaluationExclusion': True,
            'changedOutcomeChangesError': True, 'heldFamilyExclusion': True, 'trueSignal': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cohort', type=Path); parser.add_argument('--games', type=Path)
    parser.add_argument('--registration', type=Path); parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        print(json.dumps(self_test())); return
    require(all((args.cohort, args.games, args.registration, args.out)), 'Use --cohort --games --registration --out')
    registration_bytes = args.registration.read_bytes(); registration = json.loads(registration_bytes)
    require(registration['analysisSha256'] == digest(Path(__file__).read_bytes()), 'Analysis source changed after registration')
    require(registration['protocolSha256'] == digest(Path(registration['protocol']).read_bytes()), 'Protocol changed after registration')
    panel, audits, support = load_panel(args.cohort, args.games, registration)
    rows = predictions(panel); overall = score(rows)
    rankings = sorted([{'feature': key, 'mse': overall[f'vp+:{key}']['mse'],
                        'mseGainVsVpFit': overall['vpFit']['mse'] - overall[f'vp+:{key}']['mse'],
                        'mseGainVsZero': overall['zero']['mse'] - overall[f'vp+:{key}']['mse'],
                        'nonzeroPairValues': sum(row['features'][key] != 0 for row in panel),
                        'nonzeroGameDifferences': sum(row['features'][key] != 0 for row in support),
                        'nonzeroPlayerMeasurements': sum(values[key.split(':')[0]][key.split(':')[1]] != 0
                                                        for row in support for values in row['featuresByPlayer'].values()),
                        'pairValueRange': [min(row['features'][key] for row in panel), max(row['features'][key] for row in panel)]}
                       for key in FEATURES], key=lambda row: (row['mse'], row['feature']))
    result = {'schemaVersion': 1, 'provenance': {'registrationSha256': digest(registration_bytes),
              'cohortSha256': registration['cohortSha256'], 'analysisSha256': digest(Path(__file__).read_bytes()),
              'recorderSha256': registration['recorderSha256'], 'engineTreeSha256': registration['engineTreeSha256'], 'games': audits},
              'population': {'savedGames': 80, 'distinctTrajectories': len({row['trajectory'] for row in audits}),
                             'families': 5, 'variants': 10, 'seedPairs': 4, 'predictionRowsDependent': len(rows)},
              'overall': overall, 'rankingsExploratory': rankings,
              'bySplit': {str(split): score([row for row in rows if row['split'] == split]) for split in range(4)},
              'byFamily': {family: score([row for row in rows if row['family'] == family]) for family in sorted({row['family'] for row in rows})},
              'byClimate': {climate: score(rows, climate) for climate in sorted(rows[0]['byClimate'])},
              'predictionQualification': 'NOT_ESTABLISHED', 'panel': panel, 'predictions': rows, 'gameSupport': support}
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'analysis.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'out': str(args.out), 'population': result['population'],
                      'baselineMSE': {key: overall[key]['mse'] for key in ('zero', 'trainMean', 'vpFit', 'identity:M0', 'identity:M1', 'identity:M2')},
                      'rankings': rankings}, allow_nan=False))


if __name__ == '__main__':
    main()
