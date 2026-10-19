#!/usr/bin/env python3
"""Frozen exploratory objective acquisition models with grouped out-of-fold scores."""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import random
import statistics
import subprocess
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

M1 = ('occupied', 'nearestP', 'ownAbsent', 'nearestO', 'opponentAbsent', 'points',
      'turnFraction', 'attackerMoving', 'defenderMoving')
M2 = M1 + ('logRatio', 'zeroEnemyStrength')
M3 = M2 + ('column', 'supplyColumnGain', 'drm', 'hedgehog', 'noAdjacent', 'undefended',
           'lineClose', 'lineVeryClose', 'lineExtremelyClose')
MODELS = {'M0': (), 'M1': M1, 'M2': M2, 'M3': M3}
NULLABLE = frozenset(('column', 'supplyColumnGain', 'drm', 'hedgehog'))
ROLES = ('attacker-moving', 'defender-moving', 'meeting')
BINS = (0, .05, .1, .2, .4, .6, .8, 1)
CONFIG = {'features': list(M3), 'nullable': sorted(NULLABLE), 'models': MODELS,
          'windowStart': 'after FIRST_PLAYER decision; actual phasing player remains stable',
          'label': 'retainedCapture', 'primaryContrast': 'M3-M1', 'primaryScore': 'brier',
          'objective': 'SUM Bernoulli cross entropy + 0.5 * SUM standardized slope squared',
          'lambda': 1, 'interceptPenalized': False, 'maxIterations': 100,
          'gradientInfinityTolerance': 1e-7, 'calibrationBins': BINS, 'scoreClip': 1e-6,
          'calibrationWeighting': 'fix complete-subset row weights before probability binning',
          'bootstrapDraws': 1000, 'bootstrapSeed': 73019,
          'folds': 'leave one map seed out; pooled roles; no tuning',
          'preprocessing': 'train median (empty=0), train population standard deviation (constant=0)'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def engine_digest(root):
    files = sorted(root.rglob('*.js'))
    require(files, 'engine has no compiled JavaScript files')
    return digest('\n'.join(f'{path.relative_to(root).as_posix()}\t{digest(path.read_bytes())}' for path in files).encode())


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_validator():
    spec = importlib.util.spec_from_file_location('position_validate', Path(__file__).with_name('ai-position-validate.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def window_from_source(row, traces, game_id):
    key = (row['gameTurn'], row['playerTurnIndex'])
    actions = [trace for trace in traces if tuple(map(int, trace['stepKey'].split(':')[:2])) == key]
    require(actions, f'source window has no actions {key}')
    first = actions[0]
    player = row['phasingPlayerId']
    decision = None
    revision = first['revision']
    if first['stepKey'].split(':')[2] == 'FIRST_PLAYER' and first['action']['kind'] == 'RESPOND_DECISION':
        action = first['action']
        require(action['actorId'] == player, 'recorded first-player chooser mismatch')
        require(action['choiceId'] in ('first', 'second'), 'unknown first-player choice')
        require(len(actions) > 1, 'no action after first-player decision')
        decision = {'chooserId': action['actorId'], 'choiceId': action['choiceId'],
                    'revision': revision, 'actionIndex': first['ordinal']}
        if action['choiceId'] == 'second':
            others = [value for value in row['turn'] if value != player]
            require(len(others) == 1, 'ambiguous other player')
            player = others[0]
        revision = actions[1]['revision']
    def role(value):
        return 'meeting' if row['attackerId'] is None else 'attacker-moving' if row['attackerId'] == value else 'defender-moving'
    return {'id': ':'.join(map(str, (game_id, *key))), 'gameTurn': key[0], 'playerTurnIndex': key[1],
            'phasingPlayerId': player, 'role': role(player), 'recordedPhasingPlayerId': row['phasingPlayerId'],
            'recordedRole': role(row['phasingPlayerId']), 'recordedStartRevision': first['revision'],
            'expectedStartRevision': revision, 'firstPlayerDecision': decision, 'expectedTurn': row['turn']}


def build_worklist(manifest, root):
    validator = load_validator()
    games, audit = validator.load_games(manifest, root)
    coverage = validator.samples_from_games(games)
    eligible = {(row['game'], row['gameTurn'], row['playerTurnIndex']): row for row in coverage}
    work = {'schemaVersion': 2, 'artifactRoot': str(root), 'games': []}
    for game in games:
        alias = game['aliases'][0]
        trace_path = root / alias['source'] / f"match-{alias['match']}.trace.jsonl"
        traces = [trace for line in trace_path.read_text().splitlines()
                  if (trace := json.loads(line))['status'] == 'ACCEPTED']
        windows = []
        for row in game['rows']:
            key = (game['id'], row['gameTurn'], row['playerTurnIndex'])
            if key in eligible:
                windows.append(window_from_source(row, traces, game['id']))
        work['games'].append({key: game[key] for key in ('id', 'mapSeed', 'aliases')})
        work['games'][-1]['expectedWindows'] = windows
    require(sum(len(game['expectedWindows']) for game in work['games']) == len(coverage), 'window coverage mismatch')
    return work, audit


def validate_observations(observations, work):
    require(work['schemaVersion'] == observations['schemaVersion'] == 2, 'unsupported observations schema')
    expected = {game['id']: game for game in work['games']}
    games = observations['games']
    require(len(games) == len(expected) and {game['id'] for game in games} == set(expected), 'game coverage mismatch')
    rows, windows = [], []
    counts = Counter({category + suffix: 0 for category in ('enemy', 'own', 'neutral')
                      for suffix in ('Targets', 'EverCaptured', 'RetainedCapture', 'CapturedThenReleased', 'RecapturedTargets', 'CaptureTransitions')})
    for game in sorted(games, key=lambda value: value['id']):
        original = expected[game['id']]
        require(game['mapSeed'] == original['mapSeed'], 'map seed mismatch')
        require(len(game['aliases']) == len(original['aliases']), 'alias count mismatch')
        for actual_alias, expected_alias in zip(game['aliases'], original['aliases']):
            require(all(actual_alias.get(key) == value for key, value in expected_alias.items()), 'alias identity mismatch')
            root = Path(work['artifactRoot'])
            source = root / expected_alias['source']
            for key, path in (('traceSha256', source / f"match-{expected_alias['match']}.trace.jsonl"),
                              ('rowsSha256', root / expected_alias['file']), ('summarySha256', source / 'summary.json')):
                require(actual_alias.get(key) == digest(path.read_bytes()), f'alias {key} mismatch')
        replay = game['replay']
        require(replay.get('observerStateAndEventEquivalence') is True, f"game {game['id']}: observer state/event equivalence unverified")
        require(replay.get('windowCoverage') is True, f"game {game['id']}: replay window coverage unverified")
        require(replay.get('turnOwnerStable') is True, 'turn owner stability unverified')
        require(replay.get('traceAliasesVerified') == len(original['aliases']), 'trace alias verification count mismatch')
        initial = None
        for alias in original['aliases']:
            require(replay.get('initialStateHash') == alias['initialStateHash'] and
                    replay.get('finalStateHash') == alias['finalStateHash'], 'replay endpoint hash mismatch')
            save_path = Path(work['artifactRoot']) / alias['source'] / f"match-{alias['match']}.save.json"
            save_raw = save_path.read_bytes()
            require(digest(save_raw) == alias['saveSha256'], 'alias save hash mismatch')
            save = json.loads(save_raw)
            accepted = save['acceptedActions']
            if initial is None:
                initial = json.loads(save['initialSnapshot'])
            require(digest(canonical(accepted)) == alias['acceptedActionsSha256'], 'alias accepted action hash mismatch')
            require(replay.get('acceptedActions') == len(accepted), 'replay accepted action count mismatch')
        objectives = {objective['hexId']: objective['points'] for objective in initial['configuration']['objectives']}
        require(len(objectives) == len(initial['configuration']['objectives']), 'duplicate configured objectives')
        players = {player['id'] for player in initial['scenario']['players']}
        require(len(players) == 2, 'objective study requires exactly two scenario players')
        wanted = {window['id']: window for window in original['expectedWindows']}
        for name, count in (
                ('deferredFirstPlayerWindows', sum(w['firstPlayerDecision'] is not None for w in wanted.values())),
                ('correctedTurnOwnerWindows', sum(w['phasingPlayerId'] != w['recordedPhasingPlayerId'] for w in wanted.values()))):
            require(replay.get(name) == count, f'{name} mismatch')
            counts[name] += count
        require(len(game['windows']) == len(wanted) and {w['id'] for w in game['windows']} == set(wanted), 'window coverage mismatch')
        for window in sorted(game['windows'], key=lambda value: (value['gameTurn'], value['playerTurnIndex'])):
            previous = wanted[window['id']]
            for key in ('gameTurn', 'playerTurnIndex', 'phasingPlayerId', 'role', 'recordedPhasingPlayerId',
                        'recordedRole', 'recordedStartRevision', 'firstPlayerDecision'):
                require(window[key] == previous[key], f'window {key} mismatch')
            require(window['role'] in ROLES, 'unknown role')
            require(window['startRevision'] == previous['expectedStartRevision'], 'snapshot revision mismatch')
            require(window['startSequence']['phasingPlayerId'] == window['phasingPlayerId'], 'snapshot owner mismatch')
            require(window['startSequence']['gameTurn'] == window['gameTurn'] and
                    window['startSequence']['playerTurnIndex'] == window['playerTurnIndex'], 'snapshot turn mismatch')
            p, o = window['phasingPlayerId'], window['otherPlayerId']
            require({p, o} == players, 'window players differ from saved scenario')
            require(window['startRevision'] <= window['endRevision'], 'revision order')
            require(window['startStateHash'] and window['endStateHash'], 'missing window hashes')
            reconciliation = window['reconciliation']
            require(reconciliation.get('grossMatchesExpectedTurn') is True, f"window {window['id']}: gross accounting unverified")
            require(reconciliation.get('signedMatchesEndpoints') is True, f"window {window['id']}: signed accounting unverified")
            require(set(reconciliation['players']) == {p, o}, 'reconciliation player coverage mismatch')
            ledger = {player: dict.fromkeys(('objectivesGained', 'objectivesLost', 'objectiveVpGained',
                                            'objectiveVpLost', 'startVp', 'endVp', 'signedVpDelta', 'recaptures'), 0)
                      for player in (p, o)}
            require(isinstance(window['declarations'], list), 'missing declarations audit')
            base = {'game': game['id'], 'mapSeed': game['mapSeed'], 'window': window['id'],
                    'gameTurn': window['gameTurn'], 'playerTurnIndex': window['playerTurnIndex'], 'role': window['role']}
            windows.append(base)
            target_ids = [target['hexId'] for target in window['targets']]
            require(len(target_ids) == len(set(target_ids)), 'duplicate target identity')
            require(set(target_ids) == set(objectives), f"window {window['id']}: target identities differ from configured objectives")
            counts['windows'] += 1
            for target in window['targets']:
                require(target['initialHolder'] in (p, o, None) and target['endHolder'] in (p, o, None), 'unknown objective holder')
                features = target['features']
                require(set(features) == set(M3), 'feature schema must equal frozen whitelist')
                require(all(numeric(value) or (key in NULLABLE and value is None) for key, value in features.items()), 'non-finite or invalid feature')
                kind = target['conditions']['combat']['kind']
                require(kind in ('computed', 'noAdjacentFormation', 'undefended'), 'unknown combat condition')
                require(all((features[key] is not None) == (kind == 'computed') for key in NULLABLE), 'conditional feature availability mismatch')
                require(features['noAdjacent'] == int(kind == 'noAdjacentFormation') and
                        features['undefended'] == int(kind == 'undefended'), 'conditional feature indicators mismatch')
                require(numeric(target['points']) and target['points'] >= 0 and features['points'] == target['points'], 'invalid target points')
                require(target['points'] == objectives[target['hexId']], f"target {target['hexId']}: points differ from configuration")
                require(features['attackerMoving'] == int(window['role'] == 'attacker-moving') and
                        features['defenderMoving'] == int(window['role'] == 'defender-moving'), 'role indicators mismatch')
                labels = target['labels']
                require(set(labels) == {'everCaptured', 'retainedCapture'} and all(isinstance(v, bool) for v in labels.values()), 'invalid labels')
                events = target['controlEvents']
                holder, arrivals = target['initialHolder'], 0
                seen_holders = {holder}
                for player in (p, o):
                    ledger[player]['startVp'] += target['points'] * (holder == player)
                    ledger[player]['endVp'] += target['points'] * (target['endHolder'] == player)
                last_revision = window['startRevision']
                for event in events:
                    require(event['from'] == holder and event['to'] != holder and event['to'] in (p, o, None), 'control ledger discontinuity')
                    require(last_revision <= event['revision'] <= window['endRevision'], 'control event revision order')
                    require(isinstance(event['actionIndex'], int) and 0 <= event['actionIndex'] < replay['acceptedActions'] and isinstance(event['actionKind'], str), 'invalid control event')
                    if holder in ledger:
                        ledger[holder]['objectivesLost'] += 1
                        ledger[holder]['objectiveVpLost'] += target['points']
                    if event['to'] in ledger:
                        ledger[event['to']]['objectivesGained'] += 1
                        ledger[event['to']]['objectiveVpGained'] += target['points']
                        ledger[event['to']]['recaptures'] += event['to'] in seen_holders
                    seen_holders.add(event['to'])
                    last_revision, holder = event['revision'], event['to']
                    arrivals += holder == p
                require(holder == target['endHolder'], 'control ledger endpoint mismatch')
                require(labels['everCaptured'] == bool(arrivals), 'ever-capture label mismatch')
                require(labels['retainedCapture'] == (holder == p), 'retained label mismatch')
                category = 'enemy' if target['initialHolder'] == o else 'own' if target['initialHolder'] == p else 'neutral'
                counts['allTargets'] += 1
                counts[category + 'Targets'] += 1
                counts[category + 'EverCaptured'] += labels['everCaptured']
                counts[category + 'RetainedCapture'] += labels['retainedCapture']
                counts[category + 'CapturedThenReleased'] += labels['everCaptured'] and not labels['retainedCapture']
                counts[category + 'RecapturedTargets'] += arrivals > (0 if category == 'own' else 1)
                counts[category + 'CaptureTransitions'] += arrivals
                if category == 'enemy':
                    rows.append({**base, 'target': target['hexId'], 'points': target['points'],
                                 'features': {key: features[key] for key in M3},
                                 'y': int(labels['retainedCapture']), 'everCaptured': labels['everCaptured']})
            for player, totals in ledger.items():
                totals['signedVpDelta'] = totals['endVp'] - totals['startVp']
                require(totals['signedVpDelta'] == totals['objectiveVpGained'] - totals['objectiveVpLost'], 'ledger gross/signed mismatch')
                for key, value in totals.items():
                    require(reconciliation['players'][player].get(key) == value,
                            f"window {window['id']}, player {player}, {key}: reconciliation differs from target ledger")
                for key in ('objectivesGained', 'objectivesLost', 'objectiveVpGained', 'objectiveVpLost'):
                    require(previous['expectedTurn'][player][key] == totals[key],
                            f"window {window['id']}, player {player}, {key}: target ledger differs from recorder")
    require(rows, 'no primary enemy-held target rows')
    return rows, windows, dict(sorted(counts.items()))


def fit_preprocessor(rows, keys):
    medians, means, scales = [], [], []
    for key in keys:
        observed = [row['features'][key] for row in rows if row['features'][key] is not None]
        median = statistics.median(observed) if observed else 0.0
        values = [median if row['features'][key] is None else row['features'][key] for row in rows]
        mean = statistics.fmean(values)
        scale = math.sqrt(statistics.fmean((value - mean) ** 2 for value in values))
        medians.append(median)
        means.append(mean)
        scales.append(scale)
    return {'keys': list(keys), 'medians': medians, 'means': means, 'scales': scales}


def transform(rows, prep):
    result = []
    for row in rows:
        values = []
        for key, median, mean, scale in zip(prep['keys'], prep['medians'], prep['means'], prep['scales']):
            value = row['features'][key]
            values.append(((median if value is None else value) - mean) / scale if scale else 0.0)
        result.append([1.0] + values)
    return result


def sigmoid(value):
    if value >= 0:
        return 1 / (1 + math.exp(-value))
    exp = math.exp(value)
    return exp / (1 + exp)


def dot(left, right):
    return sum(a * b for a, b in zip(left, right))


def objective(xs, ys, beta):
    loss = .5 * sum(value * value for value in beta[1:])
    for x, y in zip(xs, ys):
        z = dot(x, beta)
        loss += max(z, 0) - y * z + math.log1p(math.exp(-abs(z)))
    return loss


def solve(matrix, vector):
    size = len(vector)
    lower = [[0.0] * size for _ in range(size)]
    for i in range(size):
        for j in range(i + 1):
            residual = matrix[i][j] - sum(lower[i][k] * lower[j][k] for k in range(j))
            if i == j:
                require(residual > 0 and math.isfinite(residual), 'non-positive Hessian pivot')
                lower[i][j] = math.sqrt(residual)
            else:
                lower[i][j] = residual / lower[j][j]
    intermediate = [0.0] * size
    for i in range(size):
        intermediate[i] = (vector[i] - sum(lower[i][j] * intermediate[j] for j in range(i))) / lower[i][i]
    answer = [0.0] * size
    for i in range(size - 1, -1, -1):
        answer[i] = (intermediate[i] - sum(lower[j][i] * answer[j] for j in range(i + 1, size))) / lower[i][i]
    return answer


def fit_logistic(xs, ys):
    size = len(xs[0])
    prevalence = sum(ys) / len(ys)
    require(0 < prevalence < 1, 'logistic optimizer requires both classes')
    beta = [math.log(prevalence / (1 - prevalence))] + [0.0] * (size - 1)
    backtracks = 0
    for iteration in range(101):
        gradient = [0.0] + beta[1:]
        hessian = [[float(i == j and i > 0) for j in range(size)] for i in range(size)]
        for x, y in zip(xs, ys):
            p = sigmoid(dot(x, beta))
            weight = p * (1 - p)
            for i in range(size):
                gradient[i] += (p - y) * x[i]
                for j in range(i + 1):
                    hessian[i][j] += weight * x[i] * x[j]
        norm = max(abs(value) for value in gradient)
        loss = objective(xs, ys, beta)
        if norm <= CONFIG['gradientInfinityTolerance']:
            return beta, {'converged': True, 'iterations': iteration, 'objective': loss,
                          'gradientInfinityNorm': norm, 'lineSearchBacktracks': backtracks}
        require(iteration < 100, f'logistic model did not converge in 100 iterations; gradient={norm}')
        for i in range(size):
            for j in range(i):
                hessian[j][i] = hessian[i][j]
        step = solve(hessian, gradient)
        descent = dot(gradient, step)
        require(descent > 0, 'Newton direction is not descent')
        rate = 1.0
        for _ in range(50):
            candidate = [value - rate * change for value, change in zip(beta, step)]
            if objective(xs, ys, candidate) <= loss - 1e-4 * rate * descent + 1e-12 * max(1, abs(loss)):
                beta = candidate
                break
            rate *= .5
            backtracks += 1
        else:
            raise ValueError(f'Newton line search failed; gradient={norm}')
    raise AssertionError('unreachable')


def fit_predict(train, test, model):
    positives = sum(row['y'] for row in train)
    rate = (positives + .5) / (len(train) + 1)
    audit = {'trainRows': len(train), 'trainPositives': positives, 'trainingRate': rate,
             'model': model, 'fallback': None}
    if model == 'M0' or positives in (0, len(train)):
        audit.update({'fallback': 'one-class-M0' if model != 'M0' else None,
                      'optimizer': {'converged': True, 'iterations': 0, 'method': 'closed-form prevalence'}})
        return [rate] * len(test), audit
    prep = fit_preprocessor(train, MODELS[model])
    beta, convergence = fit_logistic(transform(train, prep), [row['y'] for row in train])
    audit.update({'preprocessing': prep, 'coefficients': beta, 'optimizer': convergence})
    return [sigmoid(dot(x, beta)) for x in transform(test, prep)], audit


def cross_validate(rows, windows):
    seeds = sorted({window['mapSeed'] for window in windows})
    require(len(seeds) >= 2, 'leave-one-seed-out requires two map seeds')
    predictions, folds = [], []
    for seed in seeds:
        train = [row for row in rows if row['mapSeed'] != seed]
        test = [row for row in rows if row['mapSeed'] == seed]
        require(train, f'fold {seed} has no training targets')
        train_seeds = sorted({row['mapSeed'] for row in train})
        require(seed not in train_seeds, 'fold seed leakage')
        audit = {'heldOutSeed': seed, 'trainSeeds': train_seeds,
                 'trainRows': len(train), 'testRows': len(test),
                 'trainPositives': sum(row['y'] for row in train), 'testPositives': sum(row['y'] for row in test),
                 'trainGames': sorted({row['game'] for row in train}),
                 'testGames': sorted({w['game'] for w in windows if w['mapSeed'] == seed}),
                 'testWindows': [w['window'] for w in windows if w['mapSeed'] == seed], 'models': {}}
        model_predictions = {}
        for name in MODELS:
            try:
                model_predictions[name], audit['models'][name] = fit_predict(train, test, name)
            except ValueError as error:
                raise ValueError(f'held-out seed {seed}, model {name}: {error}') from error
        for index, row in enumerate(test):
            predictions.append({key: row[key] for key in row if key != 'features'})
            predictions[-1]['probabilities'] = {name: values[index] for name, values in model_predictions.items()}
            predictions[-1]['expectedVp'] = {name: row['points'] * values[index] for name, values in model_predictions.items()}
        folds.append(audit)
    require(len(predictions) == len(rows), 'fold coverage mismatch')
    require(len({(r['window'], r['target']) for r in predictions}) == len(rows), 'duplicate predicted target')
    return sorted(predictions, key=lambda r: (r['game'], r['gameTurn'], r['playerTurnIndex'], r['target'])), folds


def target_errors(row, model):
    p = 0.0 if model == 'zero' else row['probabilities'][model]
    y = row['y']
    clipped = min(1 - 1e-6, max(1e-6, p))
    return {'brier': (p - y) ** 2, 'logLoss': -y * math.log(clipped) - (1 - y) * math.log1p(-clipped),
            'targetVpMae': row['points'] * abs(p - y), 'targetVpBias': row['points'] * (p - y),
            'eventRate': float(y), 'meanProbability': p, 'probabilityBias': p - y}


def weighted_mean(rows, value, weighting):
    if not rows:
        return None
    if weighting == 'pooled':
        return statistics.fmean(value(row) for row in rows)
    by_seed = defaultdict(list)
    for row in rows:
        by_seed[row['mapSeed']].append(value(row))
    return statistics.fmean(statistics.fmean(values) for values in by_seed.values())


def score_targets(rows, model, weighting):
    report = {'count': len(rows), 'seeds': len({row['mapSeed'] for row in rows}),
              'positives': sum(row['y'] for row in rows)}
    for metric in ('brier', 'logLoss', 'targetVpMae', 'targetVpBias', 'eventRate', 'meanProbability', 'probabilityBias'):
        report[metric] = weighted_mean(rows, lambda row: target_errors(row, model)[metric], weighting)
    seed_sizes = Counter(row['mapSeed'] for row in rows)
    weights = {seed: (1 / len(rows) if weighting == 'pooled' else 1 / (len(seed_sizes) * count))
               for seed, count in seed_sizes.items()}
    calibration = []
    for index, (low, high) in enumerate(zip(BINS, BINS[1:])):
        cell = [row for row in rows if low <= (0 if model == 'zero' else row['probabilities'][model]) and
                ((0 if model == 'zero' else row['probabilities'][model]) < high or index == len(BINS) - 2)]
        mass = sum(weights[row['mapSeed']] for row in cell)
        entry = {'low': low, 'high': high, 'rightInclusive': index == len(BINS) - 2,
                 'count': len(cell), 'occupancy': mass if rows else None,
                 'seeds': len({row['mapSeed'] for row in cell})}
        for metric in ('eventRate', 'meanProbability', 'probabilityBias', 'brier'):
            entry[metric] = sum(weights[row['mapSeed']] * target_errors(row, model)[metric]
                                for row in cell) / mass if mass else None
        calibration.append(entry)
    report['calibration'] = calibration
    return report


def window_predictions(predictions, windows):
    grouped = defaultdict(list)
    for row in predictions:
        grouped[row['window']].append(row)
    result = []
    for window in windows:
        targets = grouped[window['window']]
        result.append({**window, 'targetCount': len(targets), 'observedVp': sum(r['points'] * r['y'] for r in targets),
                       'expectedVp': {name: sum(r['points'] * r['probabilities'][name] for r in targets) for name in MODELS}})
    return result


def score_windows(rows, model, weighting):
    def error(row):
        return (0 if model == 'zero' else row['expectedVp'][model]) - row['observedVp']
    return {'count': len(rows), 'seeds': len({row['mapSeed'] for row in rows}),
            'zeroTargetWindows': sum(row['targetCount'] == 0 for row in rows),
            'mae': weighted_mean(rows, lambda row: abs(error(row)), weighting),
            'bias': weighted_mean(rows, error, weighting),
            'meanObservedVp': weighted_mean(rows, lambda row: row['observedVp'], weighting),
            'meanExpectedVp': weighted_mean(rows, lambda row: 0 if model == 'zero' else row['expectedVp'][model], weighting)}


def paired_intervals(rows, errors, draws=1000):
    clusters = defaultdict(list)
    for row in rows:
        clusters[row['mapSeed']].append(errors(row))
    seeds = sorted(clusters)
    if not seeds:
        return {'clusters': 0, 'draws': draws, 'pooled': None, 'equalSeed': None}
    metrics = tuple(clusters[seeds[0]][0])
    summaries = {seed: {key: sum(cell[key] for cell in cells) for key in metrics} for seed, cells in clusters.items()}
    rng = random.Random(CONFIG['bootstrapSeed'])
    samples = {weighting: {key: [] for key in metrics} for weighting in ('pooled', 'equalSeed')}
    for _ in range(draws):
        chosen = [rng.choice(seeds) for _ in seeds]
        count = sum(len(clusters[seed]) for seed in chosen)
        for key in metrics:
            samples['pooled'][key].append(sum(summaries[seed][key] for seed in chosen) / count)
            samples['equalSeed'][key].append(statistics.fmean(summaries[seed][key] / len(clusters[seed]) for seed in chosen))
    result = {'clusters': len(seeds), 'draws': draws, 'contrast': 'M3-M1', 'negativeFavorsM3': ['brier', 'logLoss', 'targetVpMae', 'mae'],
              'scope': 'paired seed resampling of fixed outer-fold errors; no refit or selection uncertainty'}
    for weighting in samples:
        result[weighting] = {}
        for key, values in samples[weighting].items():
            values.sort()
            estimate = (sum(summaries[s][key] for s in seeds) / len(rows) if weighting == 'pooled' else
                        statistics.fmean(summaries[s][key] / len(clusters[s]) for s in seeds))
            result[weighting][key] = {'estimate': estimate, 'lower': values[int(.025 * draws)], 'upper': values[min(draws - 1, int(.975 * draws))]}
    return result


def summarize(predictions, windows, folds):
    win_rows = window_predictions(predictions, windows)
    reports = {}
    groups = [('all', predictions, win_rows)]
    groups += [(role, [r for r in predictions if r['role'] == role], [w for w in win_rows if w['role'] == role]) for role in ROLES]
    groups += [(f"seed:{fold['heldOutSeed']}", [r for r in predictions if r['mapSeed'] == fold['heldOutSeed']],
                [w for w in win_rows if w['mapSeed'] == fold['heldOutSeed']]) for fold in folds]
    for name, targets, wins in groups:
        reports[name] = {weighting: {model: {'target': score_targets(targets, model, weighting),
                                            'windowVp': score_windows(wins, model, weighting)}
                                    for model in (*MODELS, 'zero')} for weighting in ('pooled', 'equalSeed')}
    def target_deltas(row):
        a, b = target_errors(row, 'M3'), target_errors(row, 'M1')
        return {key: a[key] - b[key] for key in ('brier', 'logLoss', 'targetVpMae', 'targetVpBias')}
    def window_deltas(row):
        a, b = (row['expectedVp'][name] - row['observedVp'] for name in ('M3', 'M1'))
        return {'mae': abs(a) - abs(b), 'bias': a - b}
    intervals = {name: {'target': paired_intervals(targets, target_deltas), 'windowVp': paired_intervals(wins, window_deltas)}
                 for name, targets, wins in groups if not name.startswith('seed:')}
    return reports, intervals, win_rows


def summarize_conditions(observations):
    groups = {name: {'count': 0, 'retained': 0} for name in
              ('undefended', 'noAdjacentFormation', 'computed')}
    bands = {name: {'count': 0, 'retained': 0} for name in ('0', '(0,1]', '(1,3]', '(3,7]', '>7')}
    computed = []
    examples = []
    zero_ratio_captures = []
    for game in observations['games']:
        for window in game['windows']:
            for target in window['targets']:
                if target['initialHolder'] != window['otherPlayerId']:
                    continue
                ratio = target['conditions']['ratio']
                combat = target['conditions']['combat']
                value = ratio['ownStrength'] / max(1, ratio['enemyStrength'])
                band = '0' if value == 0 else '(0,1]' if value <= 1 else '(1,3]' if value <= 3 else '(3,7]' if value <= 7 else '>7'
                retained = int(target['labels']['retainedCapture'])
                for entry in (groups[combat['kind']], bands[band]):
                    entry['count'] += 1
                    entry['retained'] += retained
                if retained and value == 0:
                    zero_ratio_captures.append({'window': window['id'], 'hexId': target['hexId'],
                                                'nearestP': target['features']['nearestP'],
                                                'combatKind': combat['kind']})
                if combat['kind'] != 'computed':
                    continue
                members = {member['pieceId']: member for member in ratio['own']}
                adjacent = {member['pieceId']: member for member in combat['attackers']}
                modified = {unit['pieceId']: unit['modified']
                            for stack in combat['supplied']['stacks'] for unit in stack['units']}
                require(set(modified) == set(adjacent), 'conditional stack/member mismatch')
                require(math.isclose(sum(modified.values()), combat['supplied']['attackerStrength'], abs_tol=1e-9),
                        'conditional modified-strength total mismatch')
                matched = set(members) & set(adjacent)
                detail = {'game': game['id'], 'window': window['id'], 'mapSeed': game['mapSeed'],
                          'hexId': target['hexId'], 'points': target['points'], 'role': window['role'],
                          'retained': retained, 'ratio': value, 'nearbyPrinted': ratio['ownStrength'],
                          'matchedAdjacentPrinted': sum(adjacent[key]['printedStrength'] for key in matched),
                          'matchedAdjacentModified': sum(modified[key] for key in matched),
                          'otherAdjacentPrinted': sum(member['printedStrength'] for key, member in adjacent.items() if key not in matched),
                          'otherAdjacentModified': sum(value for key, value in modified.items() if key not in matched),
                          'attackerStrength': combat['supplied']['attackerStrength'],
                          'defenderStrength': combat['supplied']['defenderStrength'],
                          'suppliedColumn': combat['supplied']['columnIndex'],
                          'unsuppliedColumn': combat['unsupplied']['columnIndex'],
                          'drm': combat['supplied']['drm'], 'hedgehog': combat['supplied']['hedgehogLevel'],
                          'line': combat['supplied']['line']}
                computed.append(detail)
                if not examples and detail['nearbyPrinted'] > detail['matchedAdjacentPrinted'] > detail['matchedAdjacentModified']:
                    examples.append(detail)
    return {'scope': 'Descriptive same-target conditions, not legal-plan or causal bottleneck attribution. Matched adjacent strength uses only members of the ratio cohort; additional adjacent OOS contributors are separate. Strength, column rank and dice modifiers retain different units.',
            'byCombatStatus': groups, 'byRatioBand': bands,
            'computedCount': len(computed),
            'computedWithAdjacentOutsideRatioCohort': sum(row['otherAdjacentPrinted'] > 0 for row in computed),
            'computedWithColumnGainIfDefendersUnfunded': sum(row['unsuppliedColumn'] > row['suppliedColumn'] for row in computed),
            'computedWithNegativeSupplyContrast': sum(row['unsuppliedColumn'] < row['suppliedColumn'] for row in computed),
            'computedWithColumnAtLeast6': sum(row['suppliedColumn'] >= 6 for row in computed),
            'computedWithColumnAtLeast6AndRetained': sum(row['suppliedColumn'] >= 6 and row['retained'] for row in computed),
            'zeroRatioRetainedTargets': zero_ratio_captures,
            'firstMatchedCohortReductionExample': examples,
            'computedTargetDetails': computed}


def synthetic_rows(signal=True):
    rng = random.Random(9182)
    rows, windows = [], []
    for seed in range(8):
        for index in range(32):
            signal_value = -1 if index % 2 else 1
            features = {key: 0.0 for key in M3}
            features.update({'column': signal_value, 'points': 2.0, 'turnFraction': .5,
                             'nearestP': 3.0, 'nearestO': 2.0, 'supplyColumnGain': None,
                             'drm': None, 'hedgehog': None})
            window = {'game': f'g{seed}', 'mapSeed': seed, 'window': f'{seed}:{index}',
                      'gameTurn': index + 1, 'playerTurnIndex': 0, 'role': 'meeting'}
            windows.append(window)
            y = int(signal_value > 0) if signal else int(rng.random() < .5)
            rows.append({**window, 'target': 'hex0', 'points': 2.0, 'features': features, 'y': y, 'everCaptured': bool(y)})
    return rows, windows



def validation_self_test():
    with tempfile.TemporaryDirectory(prefix='objective-study-test-') as directory:
        root = Path(directory)
        accepted = [{'kind': 'MOVE'}] * 3
        initial = {'configuration': {'objectives': [{'hexId': 'a', 'points': 2}, {'hexId': 'b', 'points': 3}]},
                   'scenario': {'players': [{'id': 'P'}, {'id': 'O'}]}}
        save = {'acceptedActions': accepted, 'initialSnapshot': json.dumps(initial)}
        write_json(root / 'match-0.save.json', save)
        for name in ('match-0.trace.jsonl', 'rows.jsonl', 'summary.json'):
            (root / name).write_text('{}\n')
        alias = {'source': '.', 'file': 'rows.jsonl', 'match': 0,
                 'saveSha256': digest((root / 'match-0.save.json').read_bytes()),
                 'acceptedActionsSha256': digest(canonical(accepted)),
                 'initialStateHash': 'initial', 'finalStateHash': 'final'}
        verified_alias = {**alias, 'traceSha256': digest((root / 'match-0.trace.jsonl').read_bytes()),
                          'rowsSha256': digest((root / 'rows.jsonl').read_bytes()),
                          'summarySha256': digest((root / 'summary.json').read_bytes())}
        p_totals = {'objectivesGained': 2, 'objectivesLost': 1, 'objectiveVpGained': 4, 'objectiveVpLost': 2,
                    'startVp': 0, 'endVp': 2, 'signedVpDelta': 2, 'recaptures': 1}
        o_totals = {'objectivesGained': 1, 'objectivesLost': 2, 'objectiveVpGained': 2, 'objectiveVpLost': 4,
                    'startVp': 2, 'endVp': 0, 'signedVpDelta': -2, 'recaptures': 1}
        expected = {'id': 'g:2:0', 'gameTurn': 2, 'playerTurnIndex': 0, 'phasingPlayerId': 'P',
                    'role': 'meeting', 'recordedPhasingPlayerId': 'P', 'recordedRole': 'meeting',
                    'recordedStartRevision': 0, 'expectedStartRevision': 0, 'firstPlayerDecision': None,
                    'expectedTurn': {'P': p_totals, 'O': o_totals}}
        work = {'schemaVersion': 2, 'artifactRoot': directory,
                'games': [{'id': 'g', 'mapSeed': 1, 'aliases': [alias], 'expectedWindows': [expected]}]}
        features = {key: None if key in NULLABLE else 0 for key in M3}
        features.update({'points': 2, 'noAdjacent': 1})
        target = {'hexId': 'a', 'points': 2, 'initialHolder': 'O', 'endHolder': 'P', 'features': features,
                  'conditions': {'combat': {'kind': 'noAdjacentFormation'}},
                  'labels': {'everCaptured': True, 'retainedCapture': True},
                  'controlEvents': [{'actionIndex': i, 'revision': i + 1, 'from': a, 'to': b, 'actionKind': 'MOVE'}
                                    for i, (a, b) in enumerate((('O', 'P'), ('P', 'O'), ('O', 'P')))]}
        neutral = {**target, 'hexId': 'b', 'points': 3, 'initialHolder': None, 'endHolder': None,
                   'features': {**features, 'points': 3}, 'controlEvents': [],
                   'labels': {'everCaptured': False, 'retainedCapture': False}}
        window = {key: value for key, value in expected.items() if key != 'expectedTurn'}
        window.update({'otherPlayerId': 'O', 'startRevision': 0, 'endRevision': 3,
                       'startSequence': {'phasingPlayerId': 'P', 'gameTurn': 2, 'playerTurnIndex': 0},
                       'startStateHash': 's', 'endStateHash': 'e', 'targets': [target, neutral], 'declarations': [],
                       'reconciliation': {'players': {'P': p_totals, 'O': o_totals},
                                          'grossMatchesExpectedTurn': True, 'signedMatchesEndpoints': True}})
        observations = {'schemaVersion': 2, 'games': [{'id': 'g', 'mapSeed': 1, 'aliases': [verified_alias],
                        'windows': [window], 'replay': {'initialStateHash': 'initial', 'finalStateHash': 'final',
                        'acceptedActions': 3, 'traceAliasesVerified': 1, 'turnOwnerStable': True,
                        'deferredFirstPlayerWindows': 0, 'correctedTurnOwnerWindows': 0, 'observerStateAndEventEquivalence': True, 'windowCoverage': True}}]}
        rows, windows, counts = validate_observations(observations, work)
        assert len(rows) == len(windows) == 1 and counts['enemyRecapturedTargets'] == 1
        reordered = copy.deepcopy(observations)
        reordered['games'][0]['windows'][0]['targets'].reverse()
        assert validate_observations(reordered, work) == (rows, windows, counts)
        corruptions = [
            lambda g: g['windows'][0]['targets'][0].update(hexId='wrong'),
            lambda g: (g['windows'][0]['targets'][0].update(points=3),
                       g['windows'][0]['targets'][0]['features'].update(points=3)),
            lambda g: g['windows'][0]['targets'].pop(),
            lambda g: g['replay'].update(observerStateAndEventEquivalence=False),
            lambda g: g['replay'].update(windowCoverage=False),
            lambda g: g['replay'].update(turnOwnerStable=False),
            lambda g: g['windows'][0]['startSequence'].update(phasingPlayerId='O'),
            lambda g: g['windows'][0].update(startRevision=1),
            lambda g: g['replay'].update(correctedTurnOwnerWindows=1),
            lambda g: g['replay'].update(acceptedActions=2),
            lambda g: g['windows'][0]['reconciliation']['players']['P'].update(objectivesGained=1),
            lambda g: g['windows'][0]['targets'][0]['labels'].update(retainedCapture=False),
            lambda g: g['windows'][0]['targets'][0]['features'].update(futureOutcome=1),
            lambda g: g['windows'][0]['targets'][0]['controlEvents'][1].update(to='P'),
            lambda g: g['windows'][0]['targets'].append(copy.deepcopy(g['windows'][0]['targets'][0])),
        ]
        for corrupt in corruptions:
            altered = copy.deepcopy(observations)
            corrupt(altered['games'][0])
            try:
                validate_observations(altered, work)
            except ValueError:
                continue
            raise AssertionError('corrupted extraction accepted')


def self_test():
    validation_self_test()
    report = {}
    exact = {'mapSeed': 1, 'y': 1, 'points': 4, 'probabilities': {'M1': .25}}
    errors = target_errors(exact, 'M1')
    assert errors['brier'] == .5625 and errors['targetVpMae'] == 3 and errors['targetVpBias'] == -3
    assert abs(errors['logLoss'] - math.log(4)) < 1e-14
    assert math.isfinite(target_errors(exact, 'zero')['logLoss'])
    for signal in (True, False):
        rows, windows = synthetic_rows(signal)
        preds, folds = cross_validate(rows, windows)
        baseline = score_targets(preds, 'M1', 'pooled')['brier']
        candidate = score_targets(preds, 'M3', 'pooled')['brier']
        report['signal' if signal else 'null'] = {'M1Brier': baseline, 'M3Brier': candidate}
        assert candidate < baseline - .15 if signal else candidate >= baseline - .02
        assert len(preds) == len(rows) and len(folds) == 8
        assert all(f['heldOutSeed'] not in f['trainSeeds'] for f in folds)
        assert all(model['optimizer']['converged'] for f in folds for model in f['models'].values())
    rows, windows = synthetic_rows()
    original, original_folds = cross_validate(rows, windows)
    changed = copy.deepcopy(rows)
    for row in changed:
        if row['mapSeed'] == 0:
            row['y'] = 1 - row['y']
            row['everCaptured'] = not row['everCaptured']
    altered, _ = cross_validate(changed, windows)
    assert [r['probabilities'] for r in original if r['mapSeed'] == 0] == [r['probabilities'] for r in altered if r['mapSeed'] == 0]
    train, test = rows[32:], copy.deepcopy(rows[:32])
    first, fit = fit_predict(train, test, 'M3')
    for row in test:
        row['declarations'] = {'futureOutcome': 1 - row['y']}
        row['labels'] = {'futureOutcome': 1 - row['y']}
    decorated, decorated_fit = fit_predict(train, test, 'M3')
    assert first == decorated and fit == decorated_fit
    for row in test:
        row['features']['column'] = 1e6
        row['features']['supplyColumnGain'] = 1e8
    _, second_fit = fit_predict(train, test, 'M3')
    assert fit == second_fit and fit['preprocessing']['medians'][M3.index('supplyColumnGain')] == 0
    constant = copy.deepcopy(rows[:10])
    for index, row in enumerate(constant):
        row['y'] = index % 2
        row['features'] = {key: None if key in NULLABLE else 3.0 for key in M3}
    predictions, fitted = fit_predict(constant, constant, 'M3')
    assert all(abs(p - .5) < 1e-12 for p in predictions)
    assert all(scale == 0 for scale in fitted['preprocessing']['scales'])
    for label in (0, 1):
        for row in constant:
            row['y'] = label
        for model in ('M1', 'M2', 'M3'):
            predictions, fitted = fit_predict(constant, constant, model)
            assert fitted['fallback'] == 'one-class-M0' and predictions == [(10 * label + .5) / 11] * 10
    xs, ys = [[1., -1.], [1., 1.]], [0, 1]
    beta, convergence = fit_logistic(xs, ys)
    assert convergence['converged'] and abs(beta[0]) < 1e-12
    assert abs(beta[1] - 2 * (1 - sigmoid(beta[1]))) < 1e-7
    empty_window = {**windows[0], 'window': 'empty'}
    window_rows = window_predictions(original, windows + [empty_window])
    assert len(window_rows) == len(windows) + 1 and window_rows[-1]['observedVp'] == 0
    assert all(value == 0 for value in window_rows[-1]['expectedVp'].values())
    intervals = paired_intervals(original, lambda row: {'brier': target_errors(row, 'M3')['brier'] - target_errors(row, 'M1')['brier']})
    assert intervals['draws'] == 1000 and intervals['clusters'] == 8 and intervals['pooled']['brier']['upper'] < 0
    boundary_rows = [{**exact, 'probabilities': {'M1': value}} for value in BINS]
    bins = score_targets(boundary_rows, 'M1', 'pooled')['calibration']
    assert [cell['count'] for cell in bins] == [1, 1, 1, 1, 1, 1, 2]
    uneven = [{'mapSeed': 0, 'v': 0}, {'mapSeed': 1, 'v': 1}, {'mapSeed': 1, 'v': 1}]
    assert weighted_mean(uneven, lambda row: row['v'], 'pooled') == 2 / 3
    assert weighted_mean(uneven, lambda row: row['v'], 'equalSeed') == .5
    assert paired_intervals(uneven, lambda row: {'delta': 0})['pooled']['delta'] == {'estimate': 0, 'lower': 0, 'upper': 0}
    unequal_bins = []
    for seed, count, low_count in ((0, 10, 1), (1, 20, 18)):
        for index in range(count):
            unequal_bins.append({'mapSeed': seed, 'y': int(seed == 0 and index < low_count), 'points': 1,
                                 'probabilities': {'M1': .15 if index < low_count else .9}})
    calibrated = score_targets(unequal_bins, 'M1', 'equalSeed')
    cell = calibrated['calibration'][2]
    for key, expected in (('occupancy', .5), ('eventRate', .1), ('probabilityBias', .05), ('brier', .0925)):
        assert math.isclose(cell[key], expected, abs_tol=1e-12), (key, cell[key], expected)
    for metric in ('eventRate', 'meanProbability', 'probabilityBias', 'brier'):
        reconstructed = sum(cell['occupancy'] * cell[metric] for cell in calibrated['calibration'] if cell['count'])
        assert math.isclose(reconstructed, calibrated[metric], abs_tol=1e-12)
    report['checks'] = ['authoritative objective identity, points and coverage; reorder invariance', 'replay and accounting rejection, release/recapture ledger', 'exact scores and calibration boundaries', 'fixed equal-seed calibration weights and reconstruction', 'unequal seed weighting', 'strong signal versus null', 'seed fold coverage', 'held-out label invariance',
                        'train-only preprocessing', 'feature whitelist', 'constant columns', 'single-class fallback',
                        'optimizer convergence and sum-loss ridge equation', 'zero-target windows', 'paired bootstrap']
    print(json.dumps({'selfTest': 'passed', **report}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--artifact-root', type=Path)
    parser.add_argument('--engine', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--observations', type=Path, help='score an existing extraction against the same verified manifest/worklist')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    for key in ('manifest', 'artifact_root', 'engine', 'out'):
        if getattr(args, key) is None:
            parser.error('--' + key.replace('_', '-') + ' is required')
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    audit = {'schemaVersion': 2, 'status': 'FAILED', 'failures': [], 'configuration': CONFIG,
             'configurationSha256': digest(canonical(CONFIG)),
             'runnerSha256': digest(Path(__file__).read_bytes()),
             'sourceHashes': {name: digest(Path(__file__).with_name(name).read_bytes())
                              for name in ('ai-position-validate.py', 'ai-vp-metrics-compare.py')}}
    try:
        work, inputs = build_worklist(args.manifest.resolve(), args.artifact_root.resolve())
        audit['inputs'] = inputs
        work_path = out / 'worklist.json'
        write_json(work_path, work)
        work_hash = digest(work_path.read_bytes())
        replay_script = Path(__file__).with_name('ai-objective-replay.mjs')
        observations_path = args.observations.resolve() if args.observations else out / 'observations.json'
        if not args.observations:
            command = ['node', str(replay_script), '--input', str(work_path), '--engine', str(args.engine.resolve()), '--out', str(observations_path)]
            audit['extractionCommand'] = command
            completed = subprocess.run(command, capture_output=True, text=True, check=False)
            audit['extraction'] = {'exitCode': completed.returncode, 'stdout': completed.stdout, 'stderr': completed.stderr}
            require(completed.returncode == 0, 'replay extraction failed; see extraction stderr')
        raw = observations_path.read_bytes()
        observations = json.loads(raw)
        provenance = observations['provenance']
        require(provenance['inputSha256'] == work_hash, 'observation input/worklist hash mismatch')
        require(provenance['extractorSha256'] == digest(replay_script.read_bytes()), 'extractor source hash mismatch')
        require(provenance['engineSha256'] == engine_digest(args.engine.resolve()), 'compiled engine hash mismatch')
        audit.update({'observationsSha256': digest(raw), 'worklistSha256': work_hash, 'provenance': provenance})
        rows, windows, counts = validate_observations(observations, work)
        audit['counts'] = {**counts, 'games': len(work['games']), 'aliases': sum(len(g['aliases']) for g in work['games']),
                           'mapSeeds': len({g['mapSeed'] for g in work['games']}), 'primaryRows': len(rows), 'primaryPositives': sum(r['y'] for r in rows)}
        predictions, folds = cross_validate(rows, windows)
        scores, intervals, window_rows = summarize(predictions, windows, folds)
        prediction_path = out / 'predictions.jsonl'
        prediction_path.write_bytes(b''.join(canonical(row) + b'\n' for row in predictions))
        audit.update({'status': 'SCORED', 'folds': folds, 'scores': scores, 'pairedConditionalIntervals': intervals,
                      'ruleConditions': summarize_conditions(observations),
                      'windowPredictions': window_rows, 'predictionsSha256': digest(prediction_path.read_bytes()),
                      'interpretation': 'Exploratory historical cohort; fixed-error intervals exclude refitting and selection uncertainty. No legal-plan, full net-VP or cross-policy qualification.',
                      'trainingRateBaseline': 'M0; smoothed training target prevalence applied to each target before window aggregation',
                      'primaryLabel': 'retainedCapture', 'everCaptured': 'accounting only; no fitted outcome suite'})
        write_json(out / 'analysis.json', audit)
        print(json.dumps({'status': audit['status'], 'counts': audit['counts'], 'analysis': str(out / 'analysis.json')}, sort_keys=True))
    except Exception as error:
        audit['failures'].append({'type': type(error).__name__, 'message': str(error)})
        write_json(out / 'analysis.json', audit)
        raise


if __name__ == '__main__':
    main()
