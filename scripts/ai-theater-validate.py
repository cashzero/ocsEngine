#!/usr/bin/env python3
"""Plan P11.6: do theater allocation metrics add to the position metrics? (docs/ai/theater-supply-plan.md)

    python3 scripts/ai-theater-validate.py --development <manifest.json> --retrospective <manifest.json> --artifact-root . --out <results.json>
    python3 scripts/ai-theater-validate.py --self-test

Rows come from ai-position-record.mjs --theater; trajectories and map seeds are loaded as in ai-position-validate.py, and
development and retrospective map seeds must not overlap. Axis attacks only.

Q1 final margin: for each trajectory and Game Turn 3-5, the row of the Game Turn's first player turn predicts the final
Axis minus Allied VP margin. M2 is ai-position-final.py's M2; M2T adds each side's theater potential; M2F adds each
side's potential and stranded steps. Fitted on development rows, scored on retrospective rows; the MAE and R2 gains of
M2T and M2F over M2 get 95% intervals from 1,000 map-seed cluster resamples of the fixed errors. Development ten-fold
results are reported as well.

Q2 near term: rows where the attacker moves; the objective VP the phasing player gains in the player turn, predicted
by one feature at a time: the mover's theater potential, objectiveReachColumn, payableObjectiveVpInReach. Linear fits on
development rows scored on retrospective rows; gains of the potential over each baseline get the same intervals.

Descriptive: realized over potential at Combat entry, stranded steps, by Game Turn.
"""
import argparse
import importlib.util
import json
import random
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
def module(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded

VALIDATE = module('validate', 'ai-position-validate.py')
FINAL = module('final', 'ai-position-final.py')
AXIS, ALLIED = FINAL.AXIS, FINAL.ALLIED

M2 = FINAL.MODELS['M2 + objective reach and risk']
FINAL_MODELS = {
    'M2': lambda s: M2(s['metrics']),
    'M2T': lambda s: M2(s['metrics']) + [s['theater'][AXIS]['potential'], s['theater'][ALLIED]['potential']],
    'M2F': lambda s: M2(s['metrics']) + [s['theater'][AXIS]['potential'], s['theater'][ALLIED]['potential'],
                                         s['theater'][AXIS]['strandedSteps'], s['theater'][ALLIED]['strandedSteps']],
}
NEAR_MODELS = {
    'potential': lambda s: [s['theater'][s['phasing']]['potential']],
    'objectiveReachColumn': lambda s: [s['metrics'][s['phasing']]['objectiveReachColumn']],
    'payableObjectiveVpInReach': lambda s: [s['metrics'][s['phasing']]['payableObjectiveVpInReach']],
}


def final_samples(games):
    samples = []
    for game in games:
        final = game['rows'][0]['finalVp']
        for row in game['rows']:
            if row['engagement'] == 'AXIS_ATTACKS' and row['playerTurnIndex'] == 0 and 3 <= row['gameTurn'] <= 5:
                samples.append({'mapSeed': game['mapSeed'], 'gameTurn': row['gameTurn'], 'metrics': row['metrics'],
                                'theater': row['theater'], 'y': final[AXIS] - final[ALLIED]})
    return samples


def near_samples(games):
    samples = []
    for game in games:
        for row in game['rows']:
            if row['engagement'] == 'AXIS_ATTACKS' and row['phasingPlayerId'] == row['attackerId']:
                phasing = row['phasingPlayerId']
                samples.append({'mapSeed': game['mapSeed'], 'gameTurn': row['gameTurn'], 'phasing': phasing, 'metrics': row['metrics'],
                                'theater': row['theater'], 'y': row['turn'][phasing]['objectiveVpGained']})
    return samples


def predictions(models, train, test):
    return {name: FINAL.fit_predict([f(s) for s in train], [s['y'] for s in train], [f(s) for s in test]) for name, f in models.items()}


def out_of_fold(models, samples):
    folds = VALIDATE.seed_folds(samples)
    predicted = {name: [None] * len(samples) for name in models}
    for fold in range(10):
        train = [s for s in samples if folds[s['mapSeed']] != fold]
        index = [i for i, s in enumerate(samples) if folds[s['mapSeed']] == fold]
        for name, values in predictions(models, train, [samples[i] for i in index]).items():
            for i, value in zip(index, values):
                predicted[name][i] = value
    return predicted


def scored(samples, predicted, pairs, seed=20261021):
    cells = defaultdict(lambda: {'n': 0, 'sumY': 0.0, 'sumY2': 0.0, 'abs': defaultdict(float), 'sq': defaultdict(float)})
    for i, s in enumerate(samples):
        cell = cells[s['mapSeed']]
        cell['n'] += 1; cell['sumY'] += s['y']; cell['sumY2'] += s['y'] ** 2
        for name, values in predicted.items():
            cell['abs'][name] += abs(s['y'] - values[i]); cell['sq'][name] += (s['y'] - values[i]) ** 2

    def scores(chosen):
        n = sum(c['n'] for c in chosen)
        total = sum(c['sumY2'] for c in chosen) - sum(c['sumY'] for c in chosen) ** 2 / n
        return {name: {'r2': 1 - sum(c['sq'][name] for c in chosen) / total if total > 1e-12 else None,
                       'mae': sum(c['abs'][name] for c in chosen) / n} for name in predicted}
    seeds = list(cells.values())
    result = {'n': len(samples), 'seeds': len(seeds), 'scores': scores(seeds), 'gains': {}}
    rng = random.Random(seed)
    draws = [scores([rng.choice(seeds) for _ in seeds]) for _ in range(1000)]
    for better, base in pairs:
        r2 = sorted(d[better]['r2'] - d[base]['r2'] for d in draws if d[base]['r2'] is not None and d[better]['r2'] is not None)
        mae = sorted(d[base]['mae'] - d[better]['mae'] for d in draws)
        result['gains'][f'{better} over {base}'] = {
            'maeGain': result['scores'][base]['mae'] - result['scores'][better]['mae'],
            'maeGain95': [mae[int((len(mae) - 1) * 0.025)], mae[int((len(mae) - 1) * 0.975)]],
            'r2Gain': None if result['scores'][better]['r2'] is None else result['scores'][better]['r2'] - result['scores'][base]['r2'],
            'r2Gain95': [r2[int((len(r2) - 1) * 0.025)], r2[int((len(r2) - 1) * 0.975)]] if r2 else None}
    return result


FINAL_PAIRS = [('M2T', 'M2'), ('M2F', 'M2')]
NEAR_PAIRS = [('potential', 'objectiveReachColumn'), ('potential', 'payableObjectiveVpInReach')]


def analyze(development, retrospective):
    if {g['mapSeed'] for g in development} & {g['mapSeed'] for g in retrospective}:
        raise ValueError('development and retrospective map seeds overlap')
    report = {'developmentTrajectories': len(development), 'retrospectiveTrajectories': len(retrospective), 'final': {}, 'near': {}}
    dev_final, retro_final = final_samples(development), final_samples(retrospective)
    for turn in (3, 4, 5):
        train = [s for s in dev_final if s['gameTurn'] == turn]
        test = [s for s in retro_final if s['gameTurn'] == turn]
        report['final'][f'Game Turn {turn}'] = {
            'retrospective': scored(test, predictions(FINAL_MODELS, train, test), FINAL_PAIRS),
            'developmentTenFold': scored(train, out_of_fold(FINAL_MODELS, train), FINAL_PAIRS)}
    dev_near, retro_near = near_samples(development), near_samples(retrospective)
    report['near'] = {'retrospective': scored(retro_near, predictions(NEAR_MODELS, dev_near, retro_near), NEAR_PAIRS),
                      'developmentTenFold': scored(dev_near, out_of_fold(NEAR_MODELS, dev_near), NEAR_PAIRS)}
    describe = {}
    for label, games in (('development', development), ('retrospective', retrospective)):
        by_turn = defaultdict(lambda: {'rows': 0, 'potential': 0.0, 'realized': 0.0, 'gained': 0.0, 'stranded': 0.0, 'allocatable': 0.0})
        for game in games:
            for row in game['rows']:
                if row['engagement'] != 'AXIS_ATTACKS' or row['theaterRealized'] is None:
                    continue
                phasing = row['phasingPlayerId']
                cell = by_turn[f"{'attacker' if phasing == row['attackerId'] else 'defender'} GT{row['gameTurn']}"]
                cell['rows'] += 1; cell['potential'] += row['theater'][phasing]['potential']; cell['realized'] += row['theaterRealized']
                cell['gained'] += row['turn'][phasing]['objectiveVpGained']
                cell['stranded'] += row['theater'][phasing]['strandedSteps']; cell['allocatable'] += row['theater'][phasing]['allocatableSteps']
        describe[label] = {key: {'rows': c['rows'], 'meanPotential': c['potential'] / c['rows'], 'meanRealized': c['realized'] / c['rows'],
                                 'meanGained': c['gained'] / c['rows'], 'strandedShare': c['stranded'] / c['allocatable'] if c['allocatable'] else None}
                           for key, c in sorted(by_turn.items())}
    report['descriptive'] = describe
    return report


def self_test():
    rng = random.Random(3)
    def game(seed, copy):
        signal = rng.gauss(0, 3)
        rows = []
        for turn in range(1, 9):
            for index, phasing in enumerate((AXIS, ALLIED)):
                metrics = {p: {'vp': 0, 'steps': 50, 'outOfTrace': 0, 'objectiveReachColumn': rng.randrange(13), 'objectiveVpAtRisk': 0,
                               'payableObjectiveVpInReach': rng.randrange(5)} for p in (AXIS, ALLIED)}
                theater = {AXIS: {'potential': max(0.0, signal + 3), 'strandedSteps': 0, 'allocatableSteps': 10}, ALLIED: {'potential': 0.0, 'strandedSteps': 0, 'allocatableSteps': 10}}
                gained = theater[phasing]['potential'] if phasing == AXIS else 0
                rows.append({'engagement': 'AXIS_ATTACKS', 'attackerId': AXIS, 'gameTurn': turn, 'playerTurnIndex': index, 'phasingPlayerId': phasing,
                             'metrics': metrics, 'theater': theater, 'theaterRealized': 0.0, 'turn': {phasing: {'objectiveVpGained': gained}},
                             'finalVp': {AXIS: signal + 3, ALLIED: 0}})
        return {'id': f'{seed}-{copy}', 'mapSeed': seed, 'rows': rows}
    development = [game(seed, 0) for seed in range(30)]
    retrospective = [game(seed, 0) for seed in range(100, 120)]
    report = analyze(development, retrospective)
    gain = report['final']['Game Turn 4']['retrospective']['gains']['M2T over M2']
    assert gain['maeGain95'][0] > 0, gain
    near = report['near']['retrospective']['gains']['potential over objectiveReachColumn']
    assert near['maeGain95'][0] > 0, near
    try:
        analyze(development, development[:5])
        raise AssertionError('overlapping seeds accepted')
    except ValueError:
        pass
    print('self-test passed: a potential signal gains over M2 and the near-term baselines; overlapping seeds rejected')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--development', type=Path)
    parser.add_argument('--retrospective', type=Path)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    development, _ = VALIDATE.load_games(args.development, args.artifact_root)
    retrospective, _ = VALIDATE.load_games(args.retrospective, args.artifact_root)
    report = analyze(development, retrospective)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=1) + '\n')
    for turn, result in report['final'].items():
        for label in ('retrospective', 'developmentTenFold'):
            r = result[label]
            gains = '  '.join(f"{k}: MAE {g['maeGain']:+.3f} [{g['maeGain95'][0]:+.3f},{g['maeGain95'][1]:+.3f}] R2 {g['r2Gain']:+.3f}" for k, g in r['gains'].items())
            print(f"final {turn} {label} (n {r['n']}, seeds {r['seeds']}): M2 MAE {r['scores']['M2']['mae']:.3f}  {gains}")
    for label in ('retrospective', 'developmentTenFold'):
        r = report['near'][label]
        scores = '  '.join(f"{k} MAE {s['mae']:.3f} R2 {s['r2']:.3f}" for k, s in r['scores'].items())
        gains = '  '.join(f"{k}: MAE {g['maeGain']:+.3f} [{g['maeGain95'][0]:+.3f},{g['maeGain95'][1]:+.3f}] R2 {g['r2Gain']:+.3f} [{g['r2Gain95'][0]:+.3f},{g['r2Gain95'][1]:+.3f}]" for k, g in r['gains'].items())
        print(f"near {label} (n {r['n']}): {scores}\n    {gains}")


if __name__ == '__main__':
    main()
