#!/usr/bin/env python3
"""Do position metrics predict the final VP margin beyond VP, steps and supply? (docs/roadmap/18-position-metrics-wbs.md, P6)

    python3 scripts/ai-position-final.py --manifest <manifest.json> --artifact-root . --out <results.json>
    python3 scripts/ai-position-final.py --self-test

Trajectories are identified and map seeds grouped as in ai-position-validate.py. For each trajectory and Game Turn 2-7,
the row of the Game Turn's first player turn predicts the final Axis minus Allied VP margin, Axis attacks and meetings
apart. Models (least squares on training-standardized features): M0 the VP margin; M1 adds the step and out-of-trace
differences; M2 adds each side's objectiveReachColumn and objectiveVpAtRisk; M3 adds each side's stacksExposedAllocated;
M4 adds each side's hqsInReach. Ten map-seed folds give out-of-sample R2 and MAE; the gain of M1 over M0 and of M2-M4
over M1 gets a 95% interval from 1,000 map-seed cluster resamples of the fixed out-of-fold errors.
"""
import argparse
import importlib.util
import json
import random
from collections import defaultdict
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('validate', Path(__file__).with_name('ai-position-validate.py'))
VALIDATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE)

AXIS, ALLIED = 'player:axis', 'player:allied'


def diff(metrics, key):
    return metrics[AXIS][key] - metrics[ALLIED][key]


def both(metrics, key):
    return [metrics[AXIS][key], metrics[ALLIED][key]]


MODELS = {
    'M0 VP': lambda m: [diff(m, 'vp')],
    'M1 + steps, out of trace': lambda m: [diff(m, 'vp'), diff(m, 'steps'), diff(m, 'outOfTrace')],
    'M2 + objective reach and risk': lambda m: [diff(m, 'vp'), diff(m, 'steps'), diff(m, 'outOfTrace'),
                                                *both(m, 'objectiveReachColumn'), *both(m, 'objectiveVpAtRisk')],
    'M3 + allocated exposure': lambda m: [diff(m, 'vp'), diff(m, 'steps'), diff(m, 'outOfTrace'), *both(m, 'stacksExposedAllocated')],
    'M4 + HQs in reach': lambda m: [diff(m, 'vp'), diff(m, 'steps'), diff(m, 'outOfTrace'), *both(m, 'hqsInReach')],
}
GAINS = [('M1 + steps, out of trace', 'M0 VP'), ('M2 + objective reach and risk', 'M1 + steps, out of trace'),
         ('M3 + allocated exposure', 'M1 + steps, out of trace'), ('M4 + HQs in reach', 'M1 + steps, out of trace')]


def solve(matrix, vector):
    n = len(vector)
    a = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        a[col], a[pivot] = a[pivot], a[col]
        if abs(a[col][col]) < 1e-12:
            a[col][col] = 1e-12
        for r in range(n):
            if r != col:
                f = a[r][col] / a[col][col]
                for c in range(col, n + 1):
                    a[r][c] -= f * a[col][c]
    return [a[i][n] / a[i][i] for i in range(n)]


def fit_predict(train_x, train_y, test_x):
    k = len(train_x[0])
    means = [sum(row[j] for row in train_x) / len(train_x) for j in range(k)]
    scales = [max(1e-9, (sum((row[j] - means[j]) ** 2 for row in train_x) / len(train_x)) ** 0.5) for j in range(k)]
    design = lambda row: [1.0] + [(row[j] - means[j]) / scales[j] for j in range(k)]
    rows = [design(row) for row in train_x]
    width = k + 1
    xtx = [[sum(r[i] * r[j] for r in rows) + (1e-6 if i == j and i > 0 else 0.0) for j in range(width)] for i in range(width)]
    xty = [sum(r[i] * y for r, y in zip(rows, train_y)) for i in range(width)]
    beta = solve(xtx, xty)
    return [sum(b * v for b, v in zip(beta, design(row))) for row in test_x]


def samples_of(games):
    samples = []
    for game in games:
        final = game['rows'][0]['finalVp']
        for row in game['rows']:
            if row['playerTurnIndex'] == 0 and 2 <= row['gameTurn'] <= 7:
                samples.append({'game': game['id'], 'mapSeed': game['mapSeed'], 'engagement': row['engagement'],
                                'gameTurn': row['gameTurn'], 'metrics': row['metrics'], 'y': final[AXIS] - final[ALLIED]})
    return samples


def evaluate(samples):
    folds = VALIDATE.seed_folds(samples)
    predictions = {name: [None] * len(samples) for name in MODELS}
    for fold in range(10):
        train = [s for s in samples if folds[s['mapSeed']] != fold]
        test_index = [i for i, s in enumerate(samples) if folds[s['mapSeed']] == fold]
        if not train or not test_index:
            continue
        for name, features in MODELS.items():
            predicted = fit_predict([features(s['metrics']) for s in train], [s['y'] for s in train],
                                    [features(samples[i]['metrics']) for i in test_index])
            for i, value in zip(test_index, predicted):
                predictions[name][i] = value
    cells = defaultdict(lambda: {'n': 0, 'sumY': 0.0, 'sumY2': 0.0, 'abs': defaultdict(float), 'sq': defaultdict(float)})
    for i, s in enumerate(samples):
        cell = cells[s['mapSeed']]
        cell['n'] += 1; cell['sumY'] += s['y']; cell['sumY2'] += s['y'] ** 2
        for name in MODELS:
            residual = s['y'] - predictions[name][i]
            cell['abs'][name] += abs(residual); cell['sq'][name] += residual ** 2

    def scores(chosen):
        n = sum(c['n'] for c in chosen)
        total = sum(c['sumY2'] for c in chosen) - sum(c['sumY'] for c in chosen) ** 2 / n
        return {name: {'r2': 1 - sum(c['sq'][name] for c in chosen) / total if total > 1e-12 else None,
                       'mae': sum(c['abs'][name] for c in chosen) / n} for name in MODELS}
    seeds = list(cells.values())
    result = {'n': len(samples), 'seeds': len(seeds), 'scores': scores(seeds), 'gains': {}}
    rng = random.Random(20261019)
    draws = [scores([rng.choice(seeds) for _ in seeds]) for _ in range(1000)]
    for better, base in GAINS:
        r2 = sorted(d[better]['r2'] - d[base]['r2'] for d in draws if d[base]['r2'] is not None and d[better]['r2'] is not None)
        mae = sorted(d[base]['mae'] - d[better]['mae'] for d in draws)
        result['gains'][f'{better} over {base}'] = {
            'r2Gain': result['scores'][better]['r2'] - result['scores'][base]['r2'],
            'r2Gain95': [r2[int((len(r2) - 1) * 0.025)], r2[int((len(r2) - 1) * 0.975)]],
            'maeGain': result['scores'][base]['mae'] - result['scores'][better]['mae'],
            'maeGain95': [mae[int((len(mae) - 1) * 0.025)], mae[int((len(mae) - 1) * 0.975)]]}
    return result


def self_test():
    rng = random.Random(5)
    games = []
    for seed in range(30):
        for copy in range(2):
            signal = rng.gauss(0, 3)
            metrics = {AXIS: {'vp': rng.randrange(10), 'steps': 50 + signal * 2, 'outOfTrace': 0, 'objectiveReachColumn': 0,
                              'objectiveVpAtRisk': 0, 'stacksExposedAllocated': 0, 'hqsInReach': 0},
                       ALLIED: {'vp': rng.randrange(10), 'steps': 50, 'outOfTrace': 0, 'objectiveReachColumn': 0,
                                'objectiveVpAtRisk': 0, 'stacksExposedAllocated': 0, 'hqsInReach': 0}}
            final = {AXIS: metrics[AXIS]['vp'] + signal, ALLIED: metrics[ALLIED]['vp']}
            games.append({'id': f'{seed}-{copy}', 'mapSeed': seed,
                          'rows': [{'playerTurnIndex': 0, 'gameTurn': turn, 'engagement': 'MEETING', 'metrics': metrics, 'finalVp': final}
                                   for turn in (2, 3)]})
    result = evaluate(samples_of(games))
    gain = result['gains']['M1 + steps, out of trace over M0 VP']
    assert gain['r2Gain95'][0] > 0, gain
    assert all(s['mapSeed'] is not None for s in samples_of(games))
    print('self-test passed: a step signal gains over VP out of sample')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    games, audit = VALIDATE.load_games(args.manifest, args.artifact_root)
    samples = samples_of(games)
    report = {'scope': __doc__.split('\n\n', 2)[2].strip(), 'inputs': audit['files'], 'uniqueTrajectories': len(games), 'results': {}}
    for engagement in ('AXIS_ATTACKS', 'MEETING'):
        for turn in range(2, 8):
            chosen = [s for s in samples if s['engagement'] == engagement and s['gameTurn'] == turn]
            report['results'][f'{engagement} Game Turn {turn}'] = evaluate(chosen)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + '\n')
    for key, result in report['results'].items():
        line = '  '.join(f"{name.split()[0]} R2 {score['r2']:.3f}" for name, score in result['scores'].items())
        gains = '  '.join(f"{name.split()[0]}>{name.split(' over ')[1].split()[0]} {g['r2Gain']:+.3f} [{g['r2Gain95'][0]:+.3f},{g['r2Gain95'][1]:+.3f}]"
                          for name, g in result['gains'].items())
        print(f'{key} (n {result["n"]}, seeds {result["seeds"]}): {line}\n    {gains}')


if __name__ == '__main__':
    main()
