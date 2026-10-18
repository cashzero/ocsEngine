#!/usr/bin/env python3
"""Do the recorded position metrics measure something? (docs/ai/policy-errors.md, 局勢指標)

    python3 scripts/ai-position-analysis.py <file.jsonl> [...] [--out <file.json>]

Reads rows of scripts/ai-position-record.mjs. Games recorded twice (same seed and policies in two folders) are kept once.

A. Same player turn (the last player turn of a game has no following row and is left out). At the start of player P's turn, the other player O's next-turn metrics describe what P can do in this
   turn, so they should predict what O loses in it: objectivesAtRisk against objectives O lost, stepsExposed against steps
   O lost, dumpSpInReach against on-map SP O lost (fall of spOnMap to the next row, which also holds what O spent in P's
   turn), hqsInReach against HQs O lost. Each is compared with a plain distance baseline (objectivesThreatened, contact) by correlation and by the R2 the
   new metric adds to the baseline. Confidence intervals resample games.
B. Final result. At the start of each Game Turn, the final VP margin (Axis minus Allied) is predicted from the current
   VP margin, then with material and supply (steps, outOfTrace), then with the position metrics. R2 is cross-validated by
   game (10 folds), so a model with more terms gains only what holds on unseen games. The gains of material and supply
   over VP, and of objective reach over those, get 95% intervals from 100 resamples of games.
"""
import glob
import hashlib
import json
import random
import sys
from collections import defaultdict

args = sys.argv[1:]
out = args[args.index('--out') + 1] if '--out' in args else None
files = [path for index, path in enumerate(args) if path != '--out' and (index == 0 or args[index - 1] != '--out')]
files = [match for pattern in files for match in sorted(glob.glob(pattern))]

games = {}
for path in files:
    by_match = defaultdict(list)
    for line in open(path):
        row = json.loads(line)
        by_match[row['match']].append(row)
    for rows in by_match.values():
        key = hashlib.md5(json.dumps([row['metrics'] for row in rows]).encode()).hexdigest()
        games.setdefault(key, sorted(rows, key=lambda row: (row['gameTurn'], row['playerTurnIndex'])))
games = list(games.values())
print(f'{len(games)} distinct games from {len(files)} files')
report = {'files': files, 'games': len(games)}


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


def fit(xs, ys):
    rows = [[1.0] + x for x in xs]
    k = len(rows[0])
    xtx = [[sum(r[i] * r[j] for r in rows) + (1e-6 if i == j else 0) for j in range(k)] for i in range(k)]
    xty = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(k)]
    return solve(xtx, xty)


def predict(beta, x):
    return beta[0] + sum(b * v for b, v in zip(beta[1:], x))


def r2(ys, preds):
    mean = sum(ys) / len(ys)
    total = sum((y - mean) ** 2 for y in ys)
    return 1 - sum((y - p) ** 2 for y, p in zip(ys, preds)) / total if total else 0.0


def corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / (sxx * syy) ** 0.5 if sxx and syy else 0.0


def bootstrap(groups, statistic, draws=400):
    """95% interval of statistic over resampled games; groups is a list of per-game row lists."""
    rng = random.Random(7)
    values = sorted(statistic([row for _ in groups for row in rng.choice(groups)]) for _ in range(draws))
    return values[int(draws * 0.025)], values[int(draws * 0.975)]


def role(row, player):
    attacker = row['attackerId']
    return 'meeting' if attacker is None else 'attacker' if player == attacker else 'defender'


# A. Same player turn.
pairs = []  # one entry per player turn: metrics of the non-phasing player O before, and what O lost in the turn
for index, rows in enumerate(games):
    for row, after in zip(rows, rows[1:]):
        phasing = row['phasingPlayerId']
        other = next(player for player in row['metrics'] if player != phasing)
        before, then = row['metrics'][other], after['metrics'][other]
        lost = {**row['turn'][other], 'spLost': max(0, before['spOnMap'] - then['spOnMap']), 'hqsLost': max(0, before['hqs'] - then['hqs'])}
        pairs.append({'game': index, 'turn': row['gameTurn'], 'phasingRole': role(row, phasing),
                      'o': before, 'p': row['metrics'][phasing], 'lost': lost})

TESTS = [
    ('objectives O lost', lambda e: e['lost']['objectivesLost'], 'objectivesAtRisk', 'objectivesThreatened'),
    ('objective VP O lost', lambda e: e['lost']['objectiveVpLost'], 'objectiveVpAtRisk', 'objectivesThreatened'),
    ('steps O lost', lambda e: e['lost']['stepsLost'], 'stepsExposed', 'contact'),
    ('steps O lost', lambda e: e['lost']['stepsLost'], 'stacksExposed', 'contact'),
    ('on-map SP O lost', lambda e: e['lost']['spLost'], 'dumpSpInReach', 'contact'),
    ('HQs O lost', lambda e: e['lost']['hqsLost'], 'hqsInReach', 'contact'),
]


def bucket(value):
    return '0' if value == 0 else '1' if value == 1 else '2-3' if value <= 3 else '4-7' if value <= 7 else '8+'


report['sameTurn'] = {}
print('\nA. Same player turn: O\'s metrics before P moves against what O lost in P\'s turn (O = the non-phasing player)')
for subset_name, keep in [('all', lambda e: True), ('attacker phasing', lambda e: e['phasingRole'] == 'attacker'),
                          ('defender phasing', lambda e: e['phasingRole'] == 'defender'), ('meeting', lambda e: e['phasingRole'] == 'meeting')]:
    subset = [e for e in pairs if keep(e) and e['turn'] >= 2]
    groups = list(defaultdict(list, {}).values())
    by_game = defaultdict(list)
    for e in subset:
        by_game[e['game']].append(e)
    groups = list(by_game.values())
    print(f'\n  {subset_name}: {len(subset)} player turns from Game Turn 2, {len(groups)} games')
    for label, outcome, metric, baseline in TESTS:
        ys = [outcome(e) for e in subset]
        r_new = corr([e['o'][metric] for e in subset], ys)
        r_base = corr([e['o'][baseline] for e in subset], ys)
        base_fit = fit([[e['o'][baseline]] for e in subset], ys)
        both_fit = fit([[e['o'][baseline], e['o'][metric]] for e in subset], ys)
        r2_base = r2(ys, [predict(base_fit, [e['o'][baseline]]) for e in subset])
        r2_both = r2(ys, [predict(both_fit, [e['o'][baseline], e['o'][metric]]) for e in subset])

        def added(rows):
            y = [outcome(e) for e in rows]
            b1 = fit([[e['o'][baseline]] for e in rows], y)
            b2 = fit([[e['o'][baseline], e['o'][metric]] for e in rows], y)
            return r2(y, [predict(b2, [e['o'][baseline], e['o'][metric]]) for e in rows]) - r2(y, [predict(b1, [e['o'][baseline]]) for e in rows])
        low, high = bootstrap(groups, added)
        table = defaultdict(lambda: [0, 0, 0])
        for e, y in zip(subset, ys):
            cell = table[bucket(e['o'][metric])]
            cell[0] += 1; cell[1] += y; cell[2] += y > 0
        cells = '  '.join(f'{key}: n{n} mean {total / n:.2f} any {hit / n:.0%}' for key, (n, total, hit) in
                          sorted(table.items(), key=lambda item: ['0', '1', '2-3', '4-7', '8+'].index(item[0])))
        print(f'    {label} ~ {metric}: r {r_new:.2f} (baseline {baseline} r {r_base:.2f}); R2 baseline {r2_base:.3f}, '
              f'with {metric} {r2_both:.3f}, added {r2_both - r2_base:.3f} [{low:.3f}, {high:.3f}]')
        print(f'      by {metric}: {cells}')
        lost_total = sum(ys)
        lost_flagged = sum(y for e, y in zip(subset, ys) if e['o'][metric] > 0)
        print(f'      share of the loss in turns where {metric} > 0: {lost_flagged / lost_total:.0%}' if lost_total else '')
        report['sameTurn'].setdefault(subset_name, []).append({
            'outcome': label, 'metric': metric, 'baseline': baseline, 'r': r_new, 'rBaseline': r_base,
            'r2Baseline': r2_base, 'r2With': r2_both, 'r2Added': r2_both - r2_base, 'r2AddedInterval': [low, high],
            'buckets': {key: {'n': n, 'mean': total / n, 'any': hit / n} for key, (n, total, hit) in table.items()},
            'lossShareFlagged': lost_flagged / lost_total if lost_total else None})


# B. Final result.
AXIS, ALLIED = 'player:axis', 'player:allied'


def diff(row, key):
    return row['metrics'][AXIS][key] - row['metrics'][ALLIED][key]


def net(row, player):
    metrics = row['metrics'][player]
    return metrics['objectiveVpInReach'] - metrics['objectiveVpAtRisk']


MODELS = [
    ('VP', lambda r: [diff(r, 'vp')]),
    ('VP + steps + outOfTrace', lambda r: [diff(r, 'vp'), diff(r, 'steps'), diff(r, 'outOfTrace')]),
    ('+ objective VP reach (in reach - at risk, each side)', lambda r: [diff(r, 'vp'), diff(r, 'steps'), diff(r, 'outOfTrace'), net(r, AXIS), net(r, ALLIED)]),
    ('+ stepsExposed', lambda r: [diff(r, 'vp'), diff(r, 'steps'), diff(r, 'outOfTrace'), diff(r, 'stepsExposed')]),
    ('+ objective VP reach + stepsExposed + rear', lambda r: [diff(r, 'vp'), diff(r, 'steps'), diff(r, 'outOfTrace'), net(r, AXIS), net(r, ALLIED),
                                                            diff(r, 'stepsExposed'), diff(r, 'hqsInReach'), diff(r, 'dumpSpInReach'), diff(r, 'unitsWithReach')]),
    ('distance baseline instead (contact, within2, objectivesThreatened)', lambda r: [diff(r, 'vp'), diff(r, 'steps'), diff(r, 'outOfTrace'), diff(r, 'contact'),
                                                                                   diff(r, 'within2'), diff(r, 'objectivesThreatened')]),
]


def cv_r2(samples, features, folds=10):
    preds = [0.0] * len(samples)
    for fold in range(folds):
        train = [s for s in samples if s['fold'] != fold]
        beta = fit([features(s['row']) for s in train], [s['y'] for s in train])
        for i, s in enumerate(samples):
            if s['fold'] == fold:
                preds[i] = predict(beta, features(s['row']))
    return r2([s['y'] for s in samples], preds)


report['finalResult'] = {}
print('\nB. Final VP margin (Axis - Allied) from the start of each Game Turn: cross-validated R2 by game (10 folds)')
for engagement in ['AXIS_ATTACKS', 'MEETING']:
    chosen = [(index, rows) for index, rows in enumerate(games) if rows[0]['engagement'] == engagement]
    print(f'\n  {engagement}: {len(chosen)} games')
    print('    Game Turn: ' + '  '.join(f'{turn:>6}' for turn in range(2, 9)))
    for name, features in MODELS:
        values = []
        for turn in range(2, 9):
            samples = []
            for index, rows in chosen:
                row = next(r for r in rows if r['gameTurn'] == turn and r['playerTurnIndex'] == 0)
                samples.append({'row': row, 'y': row['finalVp'][AXIS] - row['finalVp'][ALLIED],
                                'fold': int(hashlib.md5(str(rows[0]['match']).encode()).hexdigest(), 16) % 10})
            values.append(cv_r2(samples, features))
        print(f'    {name}:\n      ' + '  '.join(f'{value:6.3f}' for value in values))
        report['finalResult'].setdefault(engagement, []).append({'model': name, 'cvR2ByGameTurn': dict(zip(range(2, 9), values))})
    for (base_name, base), (extended_name, extended) in [(MODELS[0], MODELS[1]), (MODELS[1], MODELS[2])]:
        rng = random.Random(11)
        gains = {}
        for turn in range(2, 9):
            samples = []
            for index, rows in chosen:
                row = next(r for r in rows if r['gameTurn'] == turn and r['playerTurnIndex'] == 0)
                samples.append({'row': row, 'y': row['finalVp'][AXIS] - row['finalVp'][ALLIED]})
            draws = []
            for _ in range(100):
                picks = [rng.randrange(len(samples)) for _ in samples]
                drawn = [{**samples[pick], 'fold': pick % 10} for pick in picks]  # copies of one game share a fold
                draws.append(cv_r2(drawn, extended) - cv_r2(drawn, base))
            draws.sort()
            gains[turn] = (draws[2], draws[97])
        print(f'    gain of "{extended_name}" over "{base_name}", 95% interval over resampled games:\n      '
              + '  '.join(f'[{low:+.2f},{high:+.2f}]' for low, high in gains.values()))
        report['finalResult'].setdefault(engagement + ' gainIntervals', []).append({'model': extended_name, 'over': base_name, 'byGameTurn': gains})

if out:
    json.dump(report, open(out, 'w'), indent=1)
