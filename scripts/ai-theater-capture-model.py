#!/usr/bin/env python3
"""Plan P11.3: probability that an attacked objective is held by the attacker when the player turn ends.

Fits candidate models on development rows only (ai-theater-capture-extract.mjs, kind ATTACK), compares them by
map-seed grouped ten-fold log loss, freezes the best one refitted on all development rows, and scores it on an
optional retrospective file without refitting. Also reports how often an objective gained without a declared attack
is still held at the end of the turn.

  python3 scripts/ai-theater-capture-model.py <development.jsonl> <out.json> [--retrospective <rows.jsonl>]
  python3 scripts/ai-theater-capture-model.py --self-test
"""
import hashlib
import json
import math
import random
import sys

LINES = ('VERY_CLOSE', 'CLOSE', 'OPEN', 'VERY_OPEN', 'EXTREMELY_OPEN')
EPS = 1e-6


def digest(text):
    return hashlib.sha256(str(text).encode()).hexdigest()


def load(path):
    with open(path) as handle:
        return [json.loads(line) for line in handle if line.strip()]


def features(row, model):
    if model == 'column':
        return [float(row['column'])]
    line = row.get('line')
    return [float(row['column']), float(row['drm']), 1.0 if row['defenderCanPay'] else 0.0, float(row['hedgehogLevel'])] + [
        1.0 if line == name else 0.0 for name in LINES[1:]]


def solve(matrix, vector):
    n = len(vector)
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        if abs(a[col][col]) < 1e-12:
            raise ValueError('singular system')
        for r in range(n):
            if r != col:
                factor = a[r][col] / a[col][col]
                for c in range(col, n + 1):
                    a[r][c] -= factor * a[col][c]
    return [a[i][n] / a[i][i] for i in range(n)]


def fit_logistic(rows, model, ridge=1.0):
    """Newton-Raphson on standardized features with an L2 penalty on the slopes (not the intercept)."""
    xs = [features(row, model) for row in rows]
    k = len(xs[0])
    mean = [sum(x[j] for x in xs) / len(xs) for j in range(k)]
    scale = [math.sqrt(sum((x[j] - mean[j]) ** 2 for x in xs) / len(xs)) or 1.0 for j in range(k)]
    zs = [[1.0] + [(x[j] - mean[j]) / scale[j] for j in range(k)] for x in xs]
    ys = [1.0 if row['captured'] else 0.0 for row in rows]
    beta = [0.0] * (k + 1)
    for _ in range(100):
        gradient = [0.0] * (k + 1)
        hessian = [[0.0] * (k + 1) for _ in range(k + 1)]
        for z, y in zip(zs, ys):
            p = 1 / (1 + math.exp(-max(-35, min(35, sum(b * v for b, v in zip(beta, z))))))
            w = p * (1 - p)
            for i in range(k + 1):
                gradient[i] += (y - p) * z[i]
                for j in range(k + 1):
                    hessian[i][j] += w * z[i] * z[j]
        for i in range(1, k + 1):
            gradient[i] -= ridge * beta[i]
            hessian[i][i] += ridge
        step = solve(hessian, gradient)
        beta = [b + s for b, s in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-9:
            break
    return {'kind': 'logistic', 'model': model, 'mean': mean, 'scale': scale, 'beta': beta, 'ridge': ridge}


def fit_binned(rows, strength=2.0):
    """Capture rate per column, shrunk toward the overall rate with `strength` pseudo-rows."""
    overall = sum(row['captured'] for row in rows) / len(rows)
    cells = {}
    for row in rows:
        cell = cells.setdefault(int(row['column']), [0, 0])
        cell[0] += int(row['captured'])
        cell[1] += 1
    return {'kind': 'binned', 'overall': overall, 'strength': strength,
            'rates': {str(c): (hit + strength * overall) / (n + strength) for c, (hit, n) in sorted(cells.items())}}


def fit_constant(rows):
    return {'kind': 'constant', 'rate': sum(row['captured'] for row in rows) / len(rows)}


def predict(fitted, row):
    if fitted['kind'] == 'constant':
        p = fitted['rate']
    elif fitted['kind'] == 'binned':
        p = fitted['rates'].get(str(int(row['column'])), fitted['overall'])
    else:
        x = features(row, fitted['model'])
        z = [1.0] + [(v - m) / s for v, m, s in zip(x, fitted['mean'], fitted['scale'])]
        p = 1 / (1 + math.exp(-max(-35, min(35, sum(b * v for b, v in zip(fitted['beta'], z))))))
    return min(1 - EPS, max(EPS, p))


FITTERS = {
    'constant': fit_constant,
    'binnedColumn': fit_binned,
    'logisticColumn': lambda rows: fit_logistic(rows, 'column'),
    'logisticConditions': lambda rows: fit_logistic(rows, 'conditions'),
}


def scores(rows, predictions):
    n = len(rows)
    ys = [1.0 if row['captured'] else 0.0 for row in rows]
    return {'n': n,
            'logLoss': -sum(y * math.log(p) + (1 - y) * math.log(1 - p) for y, p in zip(ys, predictions)) / n,
            'brier': sum((p - y) ** 2 for y, p in zip(ys, predictions)) / n}


def calibration(rows, predictions, bins=5):
    order = sorted(range(len(rows)), key=lambda i: predictions[i])
    table = []
    for b in range(bins):
        chunk = order[b * len(order) // bins:(b + 1) * len(order) // bins]
        if chunk:
            table.append({'n': len(chunk), 'meanPredicted': sum(predictions[i] for i in chunk) / len(chunk),
                          'observed': sum(rows[i]['captured'] for i in chunk) / len(chunk)})
    return table


def folds(rows):
    seeds = sorted({row['mapSeed'] for row in rows}, key=digest)
    if len(seeds) < 10:
        raise ValueError('ten-fold validation needs at least ten distinct map seeds')
    return {seed: index % 10 for index, seed in enumerate(seeds)}


def out_of_fold(rows):
    assignment = folds(rows)
    predictions = {name: [None] * len(rows) for name in FITTERS}
    for fold in range(10):
        train = [row for row in rows if assignment[row['mapSeed']] != fold]
        test = [i for i, row in enumerate(rows) if assignment[row['mapSeed']] == fold]
        for name, fitter in FITTERS.items():
            fitted = fitter(train)
            for i in test:
                predictions[name][i] = predict(fitted, rows[i])
    return predictions


def seed_interval(rows, left, right, draws=2000, seed=20261021):
    """Brier of `left` minus `right` on fixed out-of-fold predictions, map seeds resampled."""
    by_seed = {}
    for i, row in enumerate(rows):
        y = 1.0 if row['captured'] else 0.0
        cell = by_seed.setdefault(row['mapSeed'], [0.0, 0])
        cell[0] += (left[i] - y) ** 2 - (right[i] - y) ** 2
        cell[1] += 1
    cells = list(by_seed.values())
    rng = random.Random(seed)
    values = []
    for _ in range(draws):
        sample = [rng.choice(cells) for _ in cells]
        values.append(sum(c[0] for c in sample) / sum(c[1] for c in sample))
    values.sort()
    return {'point': sum(c[0] for c in cells) / sum(c[1] for c in cells), 'low': values[int(0.025 * draws)], 'high': values[int(0.975 * draws) - 1]}


def run(development, out, retrospective=None):
    rows = [row for row in development if row['kind'] == 'ATTACK']
    oof = out_of_fold(rows)
    cv = {name: {**scores(rows, oof[name]), 'calibration': calibration(rows, oof[name])} for name in FITTERS}
    chosen = min(FITTERS, key=lambda name: cv[name]['logLoss'])
    frozen = FITTERS[chosen](rows)
    gained = [row for row in development if row['kind'] == 'GAINED_WITHOUT_ATTACK']
    result = {
        'developmentRows': len(rows), 'mapSeeds': len({row['mapSeed'] for row in rows}), 'captureRate': sum(row['captured'] for row in rows) / len(rows),
        'crossValidation': cv, 'chosen': chosen, 'frozen': frozen,
        'brierChosenMinusConstant': seed_interval(rows, oof[chosen], oof['constant']),
        'brierChosenMinusColumnOnly': {name: seed_interval(rows, oof[chosen], oof[name]) for name in ('binnedColumn', 'logisticColumn') if name != chosen},
        'gainedWithoutAttack': {'n': len(gained), 'heldAtTurnEnd': sum(row['captured'] for row in gained) / len(gained) if gained else None},
    }
    if retrospective is not None:
        retro = [row for row in retrospective if row['kind'] == 'ATTACK']
        fitted = {name: FITTERS[name](rows) for name in FITTERS}
        result['retrospective'] = {name: {**scores(retro, [predict(fitted[name], row) for row in retro]),
                                          'calibration': calibration(retro, [predict(fitted[name], row) for row in retro])} for name in FITTERS}
        retro_gained = [row for row in retrospective if row['kind'] == 'GAINED_WITHOUT_ATTACK']
        result['retrospectiveGainedWithoutAttack'] = {'n': len(retro_gained), 'heldAtTurnEnd': sum(row['captured'] for row in retro_gained) / len(retro_gained) if retro_gained else None}
    with open(out, 'w') as handle:
        json.dump(result, handle, indent=1)
    return result


def self_test():
    rng = random.Random(7)
    rows = []
    for i in range(600):
        column = rng.randint(0, 12)
        drm = rng.randint(-2, 5)
        p = 1 / (1 + math.exp(-(-3 + 0.4 * column + 0.3 * drm)))
        rows.append({'kind': 'ATTACK', 'mapSeed': i % 30, 'column': column, 'drm': drm, 'defenderCanPay': rng.random() < 0.8,
                     'hedgehogLevel': 0, 'line': 'OPEN', 'captured': rng.random() < p})
    oof = out_of_fold(rows)
    cv = {name: scores(rows, oof[name])['logLoss'] for name in FITTERS}
    assert cv['logisticConditions'] < cv['logisticColumn'] < cv['constant'], cv
    assert cv['binnedColumn'] < cv['constant'], cv
    assigned = folds(rows)
    for fold in range(10):
        train = {row['mapSeed'] for row in rows if assigned[row['mapSeed']] != fold}
        test = {row['mapSeed'] for row in rows if assigned[row['mapSeed']] == fold}
        assert not train & test
    fitted = fit_logistic(rows, 'conditions')
    assert fitted['beta'][1] > 0 and fitted['beta'][2] > 0, fitted['beta']
    print('self-test passed', {name: round(value, 4) for name, value in cv.items()})


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        args = sys.argv[1:]
        retro = None
        if '--retrospective' in args:
            at = args.index('--retrospective')
            retro = load(args[at + 1])
            args = args[:at] + args[at + 2:]
        result = run(load(args[0]), args[1], retro)
        print(json.dumps({key: result[key] for key in ('developmentRows', 'mapSeeds', 'captureRate', 'chosen', 'brierChosenMinusConstant', 'brierChosenMinusColumnOnly', 'gainedWithoutAttack')}, indent=1))
        print(json.dumps({name: {k: round(v, 4) for k, v in s.items() if k in ('logLoss', 'brier')} for name, s in result['crossValidation'].items()}))
        if retro is not None:
            print('retrospective', json.dumps({name: {k: round(v, 4) for k, v in s.items() if k in ('logLoss', 'brier')} for name, s in result['retrospective'].items()}))
