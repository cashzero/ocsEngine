import hashlib
import json
import statistics
from pathlib import Path

root = Path('artifacts/ai-progress-objective-original-continuation')
registration = json.loads((root / 'registration.json').read_text())
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
mechanism = json.loads(Path('artifacts/ai-progress-objective-mechanism/results.json').read_text())
source = Path('artifacts/ai-progress-objective-30games/matches')
original = json.loads((source / 'summary.json').read_text())
records = {row['match']: row for row in original['records']}
rows = []
manifest = []
for pair in mechanism['pairs']:
    first = pair['firstMatch']
    path = root / f'pair-{first}/branch-results.json'
    result = json.loads(path.read_text())
    assert result['firstMatch'] == first
    assert result['preMemoriesEqual'] and result['originalRulesRng']
    assert result['laterPolicies'] == {'axis': 30, 'allied': 15}
    assert result['commonPrefixActions'] == pair['commonActions']
    assert result['scriptSha256'] == registration['files'][str(root / 'run-case.mjs')]
    assert result['protocolSha256'] == registration['files'][str(root / 'protocol.md')]
    assert result['sourceSaveSha256'] == hashlib.sha256((source / f'match-{first + 1}.save.json').read_bytes()).hexdigest()
    branches = {branch['forkWeight']: branch for branch in result['branches']}
    assert set(branches) == {15, 30}
    memories = []
    for branch in branches.values():
        assert not branch['errors'] and branch['rejected'] == 0
        assert branch['preStateHash'] == pair['preStateHash']
        for file in branch['files'].values():
            assert hashlib.sha256(Path(file['path']).read_bytes()).hexdigest() == file['sha256']
        saved = json.loads(Path(branch['files']['save.json']['path']).read_text())
        traces = [json.loads(line) for line in Path(branch['files']['trace.jsonl']['path']).read_text().splitlines()]
        assert [trace['action'] for trace in traces] == saved['acceptedActions']
        assert len(traces) == branch['acceptedActions']
        assert all(trace['status'] == 'ACCEPTED' and trace['attempts'] == 1 and not trace['rejections'] for trace in traces)
        assert traces[pair['commonActions']]['action'] == branch['forkAction']
        current = json.loads(saved['currentSnapshot'])
        assert current['victory'] == branch['victory']
        assert saved['finalStateHash'] == branch['finalStateHash']
        memories.append(json.loads(Path(branch['files']['memory.json']['path']).read_text())['before'])
    assert memories[0] == memories[1]
    factual = records[first + 1]
    counter = branches[15]
    assert counter['finished']
    if first == 1800012:
        assert result['controlFull'] and branches[30]['finished']
        assert branches[30]['finalStateHash'] == factual['finalStateHash']
        assert branches[30]['stepsLost'] == {f'player:{side}': factual['sides'][side]['stepsLost'] for side in ['axis', 'allied']}
    else:
        assert not result['controlFull'] and not branches[30]['finished']
        assert branches[30]['acceptedActions'] == pair['commonActions'] + 1
    score = {entry['playerId']: entry['points'] for entry in counter['victory']['scores']}
    factual_margin = factual['sides']['axis']['vp'] - factual['sides']['allied']['vp']
    counter_margin = score['player:axis'] - score['player:allied']
    difference = pair['difference']
    assert difference['slope'] > 0
    features = {
        'addedScaledProgress': difference['slope'],
        'otherCostPerScaledProgress': -difference['otherScore'] / difference['slope'],
        'exposureCostPerScaledProgress': -difference['exposureScore'] / difference['slope'],
    }
    rows.append({'firstMatch': first, 'mapSeed': pair['mapSeed'], 'features': features,
                 'factualAxisVp': factual['sides']['axis']['vp'], 'counterfactualAxisVp': score['player:axis'],
                 'factualMargin': factual_margin, 'counterfactualMargin': counter_margin,
                 'localMarginEffect': factual_margin - counter_margin,
                 'axisVpEffect': factual['sides']['axis']['vp'] - score['player:axis'],
                 'factualAxisKill': factual['sides']['axis']['stepsKilled'],
                 'counterfactualAxisKill': counter['stepsLost']['player:allied'],
                 'factualAxisLoss': factual['sides']['axis']['stepsLost'],
                 'counterfactualAxisLoss': counter['stepsLost']['player:axis'],
                 'previousWholePolicyPairMargin': pair['pairedVpMargin'],
                 'factualTargetHolder': pair['outcomes'][1]['finalHolder'],
                 'counterfactualTargetHolder': counter['targetFinalHolder'],
                 'counterfactualActions': counter['acceptedActions'], 'factualActions': factual['accepted']})
    manifest.append({'firstMatch': first, 'resultSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'result': result})

assert len(rows) == 15
models = {name: [] for name in ['zero', 'trainingMean', *rows[0]['features']]}
folds = []
for index, test in enumerate(rows):
    train = rows[:index] + rows[index + 1:]
    ybar = statistics.mean(row['localMarginEffect'] for row in train)
    predictions = {'zero': 0, 'trainingMean': ybar}
    for feature in test['features']:
        xs = [row['features'][feature] for row in train]
        center = statistics.mean(xs)
        scale = statistics.pstdev(xs)
        standardized = [(x - center) / scale for x in xs] if scale else [0] * len(xs)
        coefficient = sum(x * (row['localMarginEffect'] - ybar) for x, row in zip(standardized, train)) / (sum(x * x for x in standardized) + 1)
        predictions[feature] = ybar + coefficient * ((test['features'][feature] - center) / scale if scale else 0)
    folds.append({'firstMatch': test['firstMatch'], 'observed': test['localMarginEffect'], 'predictions': predictions})
    for name, predicted in predictions.items():
        models[name].append(predicted - test['localMarginEffect'])
metrics = {name: {'mae': statistics.mean(abs(error) for error in errors),
                  'mse': statistics.mean(error * error for error in errors)} for name, errors in models.items()}
effects = [row['localMarginEffect'] for row in rows]
summary = {'seeds': len(rows), 'meanLocalMarginEffect': statistics.mean(effects),
           'minLocalMarginEffect': min(effects), 'maxLocalMarginEffect': max(effects),
           'positive': sum(effect > 0 for effect in effects), 'zero': effects.count(0), 'negative': sum(effect < 0 for effect in effects),
           'counterfactualAcceptedActions': sum(row['counterfactualActions'] for row in rows),
           'factualReproductionActions': next(entry['result']['branches'][0]['acceptedActions'] for entry in manifest if entry['result']['controlFull']),
           'shortPrefixControlActions': sum(entry['result']['branches'][0]['acceptedActions'] for entry in manifest if not entry['result']['controlFull'])}
output = {'scope': 'Exploratory local one-decision effects under lateraxis30/allied15; fifteen existing seeds and one original dice realization each. Not whole-policy or cross-family predictor qualification.',
          'summary': summary, 'models': metrics, 'rows': rows, 'folds': folds}
(root / 'results.json').write_text(json.dumps(output, indent=2) + '\n')
(root / 'manifest.json').write_text(json.dumps({'registration': registration, 'cases': manifest}, indent=2) + '\n')
print(json.dumps({'summary': summary, 'models': metrics}))
