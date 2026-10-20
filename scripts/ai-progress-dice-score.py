import hashlib
import json
import statistics
import sys
from pathlib import Path


def correlation(xs, ys):
    mx, my = statistics.mean(xs), statistics.mean(ys)
    denominator = (sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denominator if denominator else None


def ranks(values):
    ordered = sorted(range(len(values)), key=values.__getitem__)
    result = [0] * len(values)
    start = 0
    while start < len(values):
        end = start + 1
        while end < len(values) and values[ordered[end]] == values[ordered[start]]:
            end += 1
        for index in ordered[start:end]:
            result[index] = (start + 1 + end) / 2
        start = end
    return result


def sign(value):
    return (value > 0) - (value < 0)


root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/ai-progress-dice-reproducibility')
registration_bytes = (root / 'registration.json').read_bytes()
registration = json.loads(registration_bytes)
assert registration['stage'] == 'frozen'
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
rows = []
for case in registration['cases']:
    path = root / f'resample/pair-{case["firstMatch"]}/result.json'
    result = json.loads(path.read_bytes())
    assert result['registrationSha256'] == hashlib.sha256(registration_bytes).hexdigest()
    assert result['scriptSha256'] == registration['files']['scripts/ai-progress-dice-run.mjs']
    assert result['engineTreeSha256'] == registration['engineTreeSha256']
    assert result['originalEffect'] == case['originalEffect']
    assert result['effect'] == result['branches'][0]['axisMargin'] - result['branches'][1]['axisMargin']
    assert [arm['forkWeight'] for arm in result['branches']] == [30, 15]
    assert all(arm['finished'] and arm['rejected'] == 0 and not arm['errors'] for arm in result['branches'])
    rows.append({'firstMatch': case['firstMatch'], 'mapSeed': case['mapSeed'],
                 'oldEffect': case['originalEffect'], 'newEffect': result['effect'],
                 'change': result['effect'] - case['originalEffect'],
                 'predictions': case['predictions'], 'resultPath': str(path),
                 'resultSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                 'margins': [arm['axisMargin'] for arm in result['branches']],
                 'futureDraws': [arm['futureDraws'] for arm in result['branches']],
                 'continuationActions': [arm['continuationActions'] for arm in result['branches']]})
assert len(rows) == 15 and len({row['mapSeed'] for row in rows}) == 15
old, new = [row['oldEffect'] for row in rows], [row['newEffect'] for row in rows]
matrix = {str(old_sign): {str(new_sign): 0 for new_sign in [-1, 0, 1]} for old_sign in [-1, 0, 1]}
for before, after in zip(old, new):
    matrix[str(sign(before))][str(sign(after))] += 1
nonzero = [(before, after) for before, after in zip(old, new) if before and after]
absolute_changes = [abs(after - before) for before, after in zip(old, new)]
models = {}
for name in rows[0]['predictions']:
    predictions = [row['predictions'][name] for row in rows]
    models[name] = {'newMae': statistics.mean(abs(y - p) for y, p in zip(new, predictions)),
                    'newMse': statistics.mean((y - p) ** 2 for y, p in zip(new, predictions)),
                    'oldMae': statistics.mean(abs(y - p) for y, p in zip(old, predictions)),
                    'oldMse': statistics.mean((y - p) ** 2 for y, p in zip(old, predictions))}
summary = {'physicalCases': 15, 'newContinuations': 30, 'controlContinuations': 2,
           'signMatrixOldRowsNewColumns': matrix,
           'exactSignAgreement': {'numerator': sum(sign(a) == sign(b) for a, b in zip(old, new)), 'denominator': 15},
           'bothNonzeroDirectionAgreement': {'numerator': sum(sign(a) == sign(b) for a, b in nonzero), 'denominator': len(nonzero)},
           'exactEffectAgreement': sum(a == b for a, b in zip(old, new)),
           'pearson': correlation(old, new), 'spearman': correlation(ranks(old), ranks(new)),
           'oldMean': statistics.mean(old), 'newMean': statistics.mean(new),
           'pooledTwoRealizationMean': statistics.mean(old + new),
           'meanChange': statistics.mean(row['change'] for row in rows),
           'meanAbsoluteChange': statistics.mean(absolute_changes),
           'medianAbsoluteChange': statistics.median(absolute_changes),
           'absoluteChangeRange': [min(absolute_changes), max(absolute_changes)],
           'oldRange': [min(old), max(old)], 'newRange': [min(new), max(new)],
           'continuationActions': sum(sum(row['continuationActions']) for row in rows),
           'futureRulesDraws': sum(sum(row['futureDraws']) for row in rows)}
output = {'scope': 'Two future-dice realizations in fifteen fixed WESTERN progressObjective physical forks; no refit or population reliability claim.',
          'summary': summary, 'models': models, 'rows': rows,
          'provenance': {'scorerSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                         'registrationSha256': hashlib.sha256(registration_bytes).hexdigest()}}
(root / 'results.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps({'summary': summary, 'models': models}))
