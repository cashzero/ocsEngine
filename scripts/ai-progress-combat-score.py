import hashlib
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/ai-progress-combat-opportunity')
registration = json.loads((root / 'registration.json').read_text())
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
prior = json.loads(Path('artifacts/ai-progress-objective-original-continuation/results.json').read_text())
rows = [json.loads((root / f'pair-{first}.json').read_text()) for first in registration['cases']]
assert len(rows) == 15 and len({row['mapSeed'] for row in rows}) == 15
for row, old in zip(rows, prior['rows']):
    assert row['firstMatch'] == old['firstMatch']
    assert row['terminalLocalEffect'] == old['localMarginEffect']
    assert len(row['arms']) == 2
    assert row['provenance']['scriptSha256'] == registration['files']['scripts/ai-progress-combat-probe.mjs']
    assert row['provenance']['registrationSha256'] == hashlib.sha256((root / 'registration.json').read_bytes()).hexdigest()
    for name, field in [('boundaryVp', 'axisMargin'), ('attackAvailableValue', 'attackAvailableValue'), ('offeredAttackStrength', 'offeredAttackStrength')]:
        assert row['features'][name] == row['arms'][0][field] - row['arms'][1][field]
    assert all(not arm['query']['truncated'] or arm['witnesses'] for arm in row['arms'])
ys = [row['terminalLocalEffect'] for row in rows]
features = {name: [row['features'][name] for row in rows] for name in rows[0]['features']}
features['priorProgress'] = [row['features']['addedScaledProgress'] for row in prior['rows']]
predictions = {name: [fold['predictions'][old] for fold in prior['folds']] for name, old in
               [('priorZero', 'zero'), ('priorTrainingMean', 'trainingMean'), ('priorProgress', 'addedScaledProgress')]}
aliases = {}
predictions['directBoundaryVp'] = features['boundaryVp']
if all(value == 0 for value in features['boundaryVp']):
    aliases['directBoundaryVp'] = 'priorZero'
fitted_vectors = {'priorProgress': features['priorProgress']}
folds = [{'firstMatch': row['firstMatch'], 'observed': ys[index], 'training': {}} for index, row in enumerate(rows)]
for name, feature in [('fittedBoundaryVp', 'boundaryVp'), ('fittedAttackAvailableValue', 'attackAvailableValue'),
                      ('fittedOfferedAttackStrength', 'offeredAttackStrength')]:
    xs = features[feature]
    if max(xs) - min(xs) < 1e-12:
        aliases[name] = 'priorTrainingMean'
    else:
        for reference, values in fitted_vectors.items():
            distinct = next(index for index, value in enumerate(values) if abs(value - values[0]) > 1e-12)
            slope = (xs[distinct] - xs[0]) / (values[distinct] - values[0])
            if abs(slope) > 1e-12 and all(abs(x - (xs[0] + slope * (value - values[0]))) < 1e-9 for x, value in zip(xs, values)):
                aliases[name] = reference
                break
    predictions[name] = []
    for index, test in enumerate(xs):
        train = [at for at in range(len(rows)) if at != index]
        center = statistics.mean(xs[at] for at in train)
        scale = statistics.pstdev(xs[at] for at in train)
        mean_y = statistics.mean(ys[at] for at in train)
        coefficient = None
        if name in aliases:
            predicted = predictions[aliases[name]][index]
        else:
            z = [(xs[at] - center) / scale for at in train] if scale else [0] * len(train)
            coefficient = sum(value * (ys[at] - mean_y) for at, value in zip(train, z)) / (sum(value * value for value in z) + 1)
            predicted = mean_y + coefficient * ((test - center) / scale if scale else 0)
        folds[index]['training'][name] = {'count': len(train), 'nonzeroFeature': sum(xs[at] != 0 for at in train),
                                          'mean': center, 'scale': scale, 'coefficient': coefficient,
                                          'targetMean': mean_y, 'zeroTrainingScale': scale == 0,
                                          'alias': aliases.get(name)}
        predictions[name].append(predicted)
    if name not in aliases:
        fitted_vectors[name] = xs
for index, fold in enumerate(folds):
    fold['predictions'] = {name: values[index] for name, values in predictions.items()}
models = {name: {'mae': statistics.mean(abs(prediction - target) for prediction, target in zip(values, ys)),
                 'mse': statistics.mean((prediction - target) ** 2 for prediction, target in zip(values, ys)),
                 'alias': aliases.get(name)} for name, values in predictions.items()}
summary = {'pairs': len(rows), 'boundaries': sum(len(row['arms']) for row in rows),
           'replayedActions': sum(arm['replayedActions'] for row in rows for arm in row['arms']),
           'observedWitnesses': sum(len(arm['witnesses']) for row in rows for arm in row['arms']),
           'armsWithTargetWitness': sum(bool(arm['witnesses']) for row in rows for arm in row['arms']),
           'truncatedQueries': sum(arm['query']['truncated'] for row in rows for arm in row['arms']),
           'nonzeroPairs': {name: sum(value != 0 for value in values) for name, values in features.items() if name != 'priorProgress'}}
output = {'scope': 'Post-result fifteen-seed local-effect exploration in one fixed relative Combat segment; no cross-family or whole-policy qualification.',
          'summary': summary, 'models': models, 'aliases': aliases, 'features': features, 'folds': folds,
          'cases': [{'firstMatch': row['firstMatch'], 'originalTarget': row['originalTarget'], 'features': row['features'],
                     'terminalLocalEffect': row['terminalLocalEffect'], 'witnessCounts': [len(arm['witnesses']) for arm in row['arms']],
                     'arms': row['arms'], 'provenance': row['provenance']} for row in rows],
          'provenance': {'scorerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                         'registrationSha256': hashlib.sha256((root / 'registration.json').read_bytes()).hexdigest()}}
(root / 'results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'summary': summary, 'models': models, 'aliases': aliases}))
