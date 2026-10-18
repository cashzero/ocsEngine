"""One-run negative control for the original position analysis fitting method."""
import ast
import hashlib
import json
import random
from pathlib import Path

source = Path('scripts/ai-position-analysis.py')
raw = source.read_bytes()
tree = ast.parse(raw)
names = {'solve', 'fit', 'predict', 'r2'}
selected = ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[])
namespace = {}
exec(compile(selected, str(source), 'exec'), namespace)
fit, predict, r2 = [namespace[name] for name in ('fit', 'predict', 'r2')]
rng = random.Random(936)
rows = [(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1)) for _ in range(200)]


def gain(sample):
    base = fit([[z] for z, x, y in sample], [y for z, x, y in sample])
    extra = fit([[z, x] for z, x, y in sample], [y for z, x, y in sample])
    ys = [y for z, x, y in sample]
    return r2(ys, [predict(extra, [z, x]) for z, x, y in sample]) - r2(ys, [predict(base, [z]) for z, x, y in sample])


point = gain(rows)
draws = sorted(gain([rng.choice(rows) for _ in rows]) for _ in range(400))
base_predictions, extra_predictions = [0.] * len(rows), [0.] * len(rows)
for fold in range(10):
    train = [row for index, row in enumerate(rows) if index % 10 != fold]
    base = fit([[z] for z, x, y in train], [y for z, x, y in train])
    extra = fit([[z, x] for z, x, y in train], [y for z, x, y in train])
    for index, (z, x, y) in enumerate(rows):
        if index % 10 == fold:
            base_predictions[index] = predict(base, [z])
            extra_predictions[index] = predict(extra, [z, x])
ys = [row[2] for row in rows]
print(json.dumps({'scope': 'Independent Gaussian feature and target; original fitting helpers',
                  'source': str(source), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                  'rngSeed': 936, 'rows': 200, 'bootstrapReplicates': 400,
                  'inSampleR2Gain': point, 'inSampleBootstrap95': [draws[10], draws[390]],
                  'heldOutR2Gain': r2(ys, extra_predictions) - r2(ys, base_predictions)}, indent=2))
