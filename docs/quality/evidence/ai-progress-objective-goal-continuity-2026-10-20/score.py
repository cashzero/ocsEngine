import hashlib
import json
import statistics
from pathlib import Path

root = Path('artifacts/ai-progress-objective-goal-continuity')
registration = json.loads((root / 'registration.json').read_text())
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
data = json.loads((root / 'measurements.json').read_text())
prior = json.loads(Path('artifacts/ai-progress-objective-original-continuation/results.json').read_text())
assert data['summary']['pairs'] == 15 and data['summary']['primaryBoundaries'] == 30
rows = data['rows']
assert [row['firstMatch'] for row in rows] == [row['firstMatch'] for row in prior['rows']]
for row, old in zip(rows, prior['rows']):
    assert row['terminalLocalEffect'] == old['localMarginEffect']
    assert row['allVpEffect'] == row['arms'][0]['primary']['axisMargin'] - row['arms'][1]['primary']['axisMargin']
    assert row['targetVpEffect'] == row['arms'][0]['primary']['targetMarginContribution'] - row['arms'][1]['primary']['targetMarginContribution']
aliases = {}
if all(row['allVpEffect'] == 0 for row in rows):
    aliases.update({'directAllVp': 'prior.zero', 'fittedAllVp': 'prior.trainingMean'})
if all(row['targetVpEffect'] == 0 for row in rows):
    aliases.update({'directTargetVp': 'prior.zero', 'fittedTargetVp': 'prior.trainingMean'})
elif all(row['targetVpEffect'] == row['allVpEffect'] for row in rows):
    aliases.update({'directTargetVp': 'directAllVp', 'fittedTargetVp': 'fittedAllVp'})
names = ['directAllVp', 'fittedAllVp', 'directTargetVp', 'fittedTargetVp']
predictions = {name: [] for name in names}
for index, test in enumerate(rows):
    train = rows[:index] + rows[index + 1:]
    target_mean = statistics.mean(row['terminalLocalEffect'] for row in train)
    fold = {}
    for name in names:
        if name in aliases:
            alias = aliases[name]
            fold[name] = prior['folds'][index]['predictions'][alias.split('.')[1]] if alias.startswith('prior.') else fold[alias]
            continue
        feature = 'allVpEffect' if name.endswith('AllVp') else 'targetVpEffect'
        if name.startswith('direct'):
            fold[name] = test[feature]
        else:
            xs = [row[feature] for row in train]
            center, scale = statistics.mean(xs), statistics.pstdev(xs)
            zs = [(x - center) / scale for x in xs] if scale else [0] * len(xs)
            coefficient = sum(z * (row['terminalLocalEffect'] - target_mean) for z, row in zip(zs, train)) / (sum(z * z for z in zs) + 1)
            fold[name] = target_mean + coefficient * ((test[feature] - center) / scale if scale else 0)
    for name in names:
        predictions[name].append({'firstMatch': test['firstMatch'], 'observed': test['terminalLocalEffect'], 'predicted': fold[name]})
models = {name: {'mae': statistics.mean(abs(row['predicted'] - row['observed']) for row in values),
                 'mse': statistics.mean((row['predicted'] - row['observed']) ** 2 for row in values),
                 'alias': aliases.get(name)} for name, values in predictions.items()}
summary = {**data['summary'], 'nonzeroAllVpEffects': sum(row['allVpEffect'] != 0 for row in rows),
           'nonzeroTargetVpEffects': sum(row['targetVpEffect'] != 0 for row in rows),
           'identicalAllAndTarget': all(row['allVpEffect'] == row['targetVpEffect'] for row in rows)}
output = {'scope': 'Post-result local-effect forecasts after the intervention player turn; not pre-action or independent cross-family validation.',
          'summary': summary, 'aliases': aliases, 'models': models,
          'baselineModels': {name: prior['models'][name] for name in ['zero', 'trainingMean']}, 'predictions': predictions}
(root / 'results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'summary': summary, 'models': models, 'aliases': aliases}))
