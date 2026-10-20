import hashlib
import json
import statistics
from pathlib import Path

root = Path('artifacts/ai-progress-objective-persistence')
registration = json.loads((root / 'registration.json').read_text())
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
data = json.loads((root / 'measurements.json').read_text())
prior = json.loads(Path('artifacts/ai-progress-objective-original-continuation/results.json').read_text())
assert data['coverage']['pairs'] == 15 and data['coverage']['histories'] == 30
assert data['coverage']['availableRetainedProgress'] == 15, 'Unavailable unit distance; full prediction coverage not established'
rows = data['rows']
assert [row['firstMatch'] for row in rows] == [row['firstMatch'] for row in prior['rows']]
for row, old in zip(rows, prior['rows']):
    assert row['terminalLocalEffect'] == old['localMarginEffect']
    assert row['initialScaledProgress'] == old['features']['addedScaledProgress']
    for observation in row['observations']:
        assert hashlib.sha256(Path(observation['path']).read_bytes()).hexdigest() == observation['sha256']
        assert observation['boundary']['distanceStatus'] == 'OBSERVED'
progress_identical = data['coverage']['identicalToFirstProgress']
vp_zero = all(row['boundaryVpEffect'] == 0 for row in rows)
aliases = {}
if progress_identical:
    aliases['standaloneRetainedProgress'] = 'prior.addedScaledProgress'
if vp_zero:
    aliases['directBoundaryVp'] = 'prior.zero'
    aliases['boundaryVpPlusResidualMean'] = 'prior.trainingMean'
    if progress_identical:
        aliases['boundaryVpPlusResidualProgress'] = 'prior.addedScaledProgress'
names = ['directBoundaryVp', 'boundaryVpPlusResidualMean', 'boundaryVpPlusResidualProgress', 'standaloneRetainedProgress']
predictions = {name: [] for name in names}
for index, test in enumerate(rows):
    train = rows[:index] + rows[index + 1:]
    residuals = [row['terminalLocalEffect'] - row['boundaryVpEffect'] for row in train]
    residual_mean = statistics.mean(residuals)
    xs = [row['retainedScaledProgress'] for row in train]
    center, scale = statistics.mean(xs), statistics.pstdev(xs)
    zs = [(x - center) / scale for x in xs] if scale else [0] * len(xs)
    test_z = (test['retainedScaledProgress'] - center) / scale if scale else 0
    fitted = {}
    if 'directBoundaryVp' not in aliases:
        fitted['directBoundaryVp'] = test['boundaryVpEffect']
    if 'boundaryVpPlusResidualMean' not in aliases:
        fitted['boundaryVpPlusResidualMean'] = test['boundaryVpEffect'] + residual_mean
    if 'boundaryVpPlusResidualProgress' not in aliases:
        coefficient = sum(z * (residual - residual_mean) for z, residual in zip(zs, residuals)) / (sum(z * z for z in zs) + 1)
        fitted['boundaryVpPlusResidualProgress'] = test['boundaryVpEffect'] + residual_mean + coefficient * test_z
    if 'standaloneRetainedProgress' not in aliases:
        target_mean = statistics.mean(row['terminalLocalEffect'] for row in train)
        coefficient = sum(z * (row['terminalLocalEffect'] - target_mean) for z, row in zip(zs, train)) / (sum(z * z for z in zs) + 1)
        fitted['standaloneRetainedProgress'] = target_mean + coefficient * test_z
    for name in names:
        predicted = prior['folds'][index]['predictions'][aliases[name].split('.')[1]] if name in aliases else fitted[name]
        predictions[name].append({'firstMatch': test['firstMatch'], 'observed': test['terminalLocalEffect'], 'predicted': predicted})
metrics = {name: {'mae': statistics.mean(abs(row['predicted'] - row['observed']) for row in values),
                  'mse': statistics.mean((row['predicted'] - row['observed']) ** 2 for row in values),
                  'reusedEquivalentModel': aliases.get(name)} for name, values in predictions.items()}
summary = {**data['coverage'], 'boundaryVpIdenticallyZero': vp_zero,
           'sameNextMoveDestination': sum(a['nextMove']['status'] == b['nextMove']['status'] == 'OBSERVED'
               and a['nextMove']['action']['path'][-1] == b['nextMove']['action']['path'][-1]
               for a, b in [row['observations'] for row in rows]),
           'nextMoveCensoredHistories': sum(observation['nextMove']['status'] != 'OBSERVED' for row in rows for observation in row['observations'])}
output = {'scope': 'Post-result local-effect exploration at a fixed movement boundary; features are available after movement, not at the original decision. No independent cross-family validation.',
          'summary': summary, 'aliases': aliases, 'models': metrics,
          'priorModels': prior['models'], 'predictions': predictions}
(root / 'results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'summary': summary, 'models': metrics, 'aliases': aliases}))
