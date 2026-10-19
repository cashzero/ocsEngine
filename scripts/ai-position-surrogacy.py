#!/usr/bin/env python3
"""Trial-level surrogacy of position metrics across policy variants (docs/roadmap/18-position-metrics-wbs.md, P8).

    python3 scripts/ai-position-surrogacy.py --registration <registration.json> --artifact-root . --out <results.json>
    python3 scripts/ai-position-surrogacy.py --self-test

Each variant played the standard policy in seat-swapped pairs of Axis attacks on the same seeds as every other variant.
For a pair, the variant's effect on an outcome is the mean over its two games of the outcome from the variant's side
(Axis minus Allied when it is the Axis player, the negative when it is the Allied player); a variant's effect is the
mean over its pairs. Outcomes: the final VP margin (dVP) and, at the first row of a Game Turn, surrogates S: the
final-margin predictions of ai-position-final.py models M0 (VP), M1 (+ steps, out of trace) and M2 (+ objective reach and
risk), fitted on the registration's training manifest for that Game Turn of Axis attacks, and single metric differences.
Trial-level R2 is the squared correlation of dVP and dS across variants; 95% intervals resample variants (2,000 draws).
Q0 tests whether variants differ beyond noise: a one-way F test of pair effects by variant, with a permutation p-value.
"""
import argparse
import importlib.util
import json
import random
import statistics
from collections import defaultdict
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('final', Path(__file__).with_name('ai-position-final.py'))
FINAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FINAL)
VALIDATE = FINAL.VALIDATE
AXIS, ALLIED = FINAL.AXIS, FINAL.ALLIED
SURROGATE_MODELS = ('M0 VP', 'M1 + steps, out of trace', 'M2 + objective reach and risk')
# Single-metric surrogates from the variant's side: own minus opponent, except risk, where the opponent's minus own is good.
METRIC_SURROGATES = {'steps': 1, 'outOfTrace': -1, 'objectiveReachColumn': 1, 'objectiveVpAtRisk': -1,
                     'stacksExposedAllocated': -1, 'hqsInReach': -1}


def corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5 if sxx > 0 and syy > 0 else 0.0


def r2_interval(xs, ys, draws=2000, seed=20261019):
    rng = random.Random(seed)
    values = []
    for _ in range(draws):
        picks = [rng.randrange(len(xs)) for _ in xs]
        values.append(corr([xs[i] for i in picks], [ys[i] for i in picks]) ** 2)
    values.sort()
    return [values[int((draws - 1) * 0.025)], values[int((draws - 1) * 0.975)]]


def r2_difference_interval(xa, xb, ys, draws=2000, seed=20261020):
    rng = random.Random(seed)
    values = []
    for _ in range(draws):
        picks = [rng.randrange(len(ys)) for _ in ys]
        y = [ys[i] for i in picks]
        values.append(corr([xa[i] for i in picks], y) ** 2 - corr([xb[i] for i in picks], y) ** 2)
    values.sort()
    return [values[int((draws - 1) * 0.025)], values[int((draws - 1) * 0.975)]]


def f_statistic(groups):
    values = [v for g in groups for v in g]
    grand = sum(values) / len(values)
    between = sum(len(g) * (sum(g) / len(g) - grand) ** 2 for g in groups) / (len(groups) - 1)
    within = sum((v - sum(g) / len(g)) ** 2 for g in groups for v in g) / (len(values) - len(groups))
    return between / within if within > 0 else float('inf')


def heterogeneity(groups, draws=2000, seed=20261021):
    observed = f_statistic(groups)
    values = [v for g in groups for v in g]
    sizes = [len(g) for g in groups]
    rng = random.Random(seed)
    exceed = 0
    for _ in range(draws):
        shuffled = values[:]
        rng.shuffle(shuffled)
        start, permuted = 0, []
        for size in sizes:
            permuted.append(shuffled[start:start + size]); start += size
        exceed += f_statistic(permuted) >= observed
    means = [sum(g) / len(g) for g in groups]
    within_var = statistics.mean(statistics.variance(g) / len(g) for g in groups)
    return {'F': observed, 'permutationP': (exceed + 1) / (draws + 1), 'varianceOfVariantMeans': statistics.variance(means),
            'meanSquaredStandardError': within_var, 'betweenVariantVarianceEstimate': statistics.variance(means) - within_var}


def side_value(row, variant_player, value_axis_minus_allied):
    return value_axis_minus_allied if variant_player == AXIS else -value_axis_minus_allied


def analyse(variant_games, training_samples, turns):
    """variant_games: {variant: [(pairId, variantPlayer, rows, finalVp)]}; training_samples: ai-position-final samples."""
    fitted = {}
    for turn in turns:
        train = [s for s in training_samples if s['engagement'] == 'AXIS_ATTACKS' and s['gameTurn'] == turn]
        fitted[turn] = {name: (FINAL.MODELS[name], train) for name in SURROGATE_MODELS}
    effects = {}
    pair_dvp = {}
    for variant, games in sorted(variant_games.items()):
        by_pair = defaultdict(list)
        for pair, player, rows, final in games:
            by_pair[pair].append((player, rows, final))
        pair_values = defaultdict(list)
        for pair, members in by_pair.items():
            if len(members) != 2 or {player for player, _, _ in members} != {AXIS, ALLIED}:
                raise ValueError(f'{variant} pair {pair} is not one game per seat')
            outcome = defaultdict(list)
            for player, rows, final in members:
                outcome['dVP'].append(side_value(None, player, final[AXIS] - final[ALLIED]))
                for turn in turns:
                    row = next(r for r in rows if r['gameTurn'] == turn and r['playerTurnIndex'] == 0)
                    for name in SURROGATE_MODELS:
                        features, train = fitted[turn][name]
                        prediction = FINAL.fit_predict([features(s['metrics']) for s in train], [s['y'] for s in train],
                                                       [features(row['metrics'])])[0]
                        outcome[f'GT{turn} {name}'].append(side_value(row, player, prediction))
                    for metric, sign in METRIC_SURROGATES.items():
                        difference = row['metrics'][AXIS][metric] - row['metrics'][ALLIED][metric]
                        outcome[f'GT{turn} {metric}'].append(sign * side_value(row, player, difference))
            for key, values in outcome.items():
                pair_values[key].append(sum(values) / 2)
        effects[variant] = {key: sum(values) / len(values) for key, values in pair_values.items()}
        pair_dvp[variant] = pair_values['dVP']
    variants = sorted(effects)
    dvp = [effects[v]['dVP'] for v in variants]
    surrogacy = {}
    for key in sorted(next(iter(effects.values()))):
        if key == 'dVP':
            continue
        xs = [effects[v][key] for v in variants]
        surrogacy[key] = {'r2': corr(xs, dvp) ** 2, 'r': corr(xs, dvp), 'r2_95': r2_interval(xs, dvp)}
    comparisons = {}
    for turn in turns:
        a = [effects[v][f'GT{turn} M2 + objective reach and risk'] for v in variants]
        b = [effects[v][f'GT{turn} M0 VP'] for v in variants]
        comparisons[f'GT{turn} M2 over M0'] = {'r2Difference': corr(a, dvp) ** 2 - corr(b, dvp) ** 2,
                                               'r2Difference95': r2_difference_interval(a, b, dvp)}
    return {'variants': len(variants), 'effects': effects, 'heterogeneity': heterogeneity([pair_dvp[v] for v in variants]),
            'surrogacy': surrogacy, 'comparisons': comparisons}


def self_test():
    rng = random.Random(3)
    training = []
    for seed in range(40):
        signal = rng.gauss(0, 3)
        metrics = {AXIS: {'vp': 5, 'steps': 50 + signal, 'outOfTrace': 0, 'objectiveReachColumn': 0, 'objectiveVpAtRisk': 0,
                          'stacksExposedAllocated': 0, 'hqsInReach': 0},
                   ALLIED: {'vp': 5, 'steps': 50, 'outOfTrace': 0, 'objectiveReachColumn': 0, 'objectiveVpAtRisk': 0,
                            'stacksExposedAllocated': 0, 'hqsInReach': 0}}
        training.append({'game': str(seed), 'mapSeed': seed, 'engagement': 'AXIS_ATTACKS', 'gameTurn': 4, 'metrics': metrics, 'y': 2 * signal})
    games = defaultdict(list)
    for variant in range(12):
        effect = variant - 6
        for pair in range(4):
            for player in (AXIS, ALLIED):
                own = effect + rng.gauss(0, 0.5)
                steps = {AXIS: 50 + (own if player == AXIS else -own), ALLIED: 50}
                metrics = {p: {'vp': 5, 'steps': steps[p], 'outOfTrace': 0, 'objectiveReachColumn': 0, 'objectiveVpAtRisk': 0,
                               'stacksExposedAllocated': 0, 'hqsInReach': 0} for p in (AXIS, ALLIED)}
                margin = 2 * own if player == AXIS else -2 * own
                games[f'v{variant}'].append((pair, player, [{'gameTurn': 4, 'playerTurnIndex': 0, 'metrics': metrics}],
                                             {AXIS: margin, ALLIED: 0}))
    result = analyse(games, training, [4])
    assert result['surrogacy']['GT4 M1 + steps, out of trace']['r2'] > 0.9, result['surrogacy']['GT4 M1 + steps, out of trace']
    assert result['heterogeneity']['permutationP'] < 0.01
    print('self-test passed: a planted variant effect carried by steps gives trial-level R2 near 1 and significant heterogeneity')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--registration', type=Path)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    registration = json.loads(args.registration.read_text())
    train_games, _ = VALIDATE.load_games(args.artifact_root / registration['training']['manifest'], args.artifact_root)
    training = FINAL.samples_of(train_games)
    variant_games = defaultdict(list)
    for variant in registration['variants']:
        for group in registration['groups']:
            directory = args.artifact_root / group['out'].format(variant=variant['name'])
            rows_by_match = defaultdict(list)
            for line in (args.artifact_root / group['rows'].format(variant=variant['name'])).read_text().splitlines():
                row = json.loads(line)
                rows_by_match[row['match']].append(row)
            summary = json.loads((directory / 'summary.json').read_text())
            for record in summary['records']:
                if record['stopReason'] != 'FINISHED' or record['errors']:
                    raise ValueError(f"{variant['name']} match {record['match']} did not finish")
                player = AXIS if record['sides']['axis']['policy'].startswith('heuristic:') else ALLIED
                if record['sides'][player.split(':')[1]]['policy'] == record['sides']['allied' if player == AXIS else 'axis']['policy']:
                    raise ValueError(f"{variant['name']} match {record['match']}: both sides play the same policy")
                pair = (group['name'], (record['match'] - group['start']) // 2)
                final = {AXIS: record['sides']['axis']['vp'], ALLIED: record['sides']['allied']['vp']}
                variant_games[variant['name']].append((pair, player, rows_by_match[record['match']], final))
    result = analyse(variant_games, training, registration['analysis']['gameTurns'])
    result['registration'] = str(args.registration)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=1) + '\n')
    h = result['heterogeneity']
    print(f"Q0 heterogeneity: F {h['F']:.2f}, permutation p {h['permutationP']:.4f}, between-variant variance {h['betweenVariantVarianceEstimate']:.2f}")
    for key, value in sorted(result['surrogacy'].items()):
        print(f"  {key:44} r {value['r']:+.3f} R2 {value['r2']:.3f} [{value['r2_95'][0]:.3f}, {value['r2_95'][1]:.3f}]")
    for key, value in result['comparisons'].items():
        print(f"  {key}: R2 difference {value['r2Difference']:+.3f} [{value['r2Difference95'][0]:+.3f}, {value['r2Difference95'][1]:+.3f}]")


if __name__ == '__main__':
    main()
