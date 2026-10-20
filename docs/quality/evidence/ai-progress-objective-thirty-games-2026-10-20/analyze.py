import hashlib
import json
import math
import statistics
from pathlib import Path

root = Path('artifacts/ai-progress-objective-30games')
registration = json.loads((root / 'registration.json').read_text())
for key, path in [('protocolSha256', root / 'protocol.md'), ('weightsSha256', root / 'weights.json'),
                  ('matchRunnerSha256', Path('scripts/ai-match.mjs')),
                  ('heuristicSourceSha256', Path('src/ai/policies/heuristic.ts')),
                  ('weightDefaultsSourceSha256', Path('src/ai/policies/heuristic-weights.ts'))]:
    assert hashlib.sha256(path.read_bytes()).hexdigest() == registration[key], path
assert hashlib.sha256(Path(__file__).read_bytes()).hexdigest() == registration['analysisSha256']
digest = hashlib.sha256()
for path in sorted(Path('dist').rglob('*.js'), key=lambda p: str(p.relative_to('dist'))):
    digest.update(str(path.relative_to('dist')).encode() + b'\0')
    digest.update(hashlib.sha256(path.read_bytes()).hexdigest().encode() + b'\0')
assert digest.hexdigest() == registration['engineTreeSha256']
summary_path = root / 'matches/summary.json'
summary_bytes = summary_path.read_bytes()
summary = json.loads(summary_bytes)
options = summary['options']
for key, expected in {'matches': 30, 'start': 1800000, 'parallel': 4, 'turns': 8,
                      'width': 32, 'height': 24, 'divisions': 6, 'armored': 2,
                      'style': 'TEMPERATE_INLAND', 'engagement': 'AXIS_ATTACKS',
                      'air': 'NONE', 'airTransport': 'NONE', 'swap': True,
                      'trace': True, 'replay': True}.items():
    assert options[key] == expected, key
candidate = 'heuristic:artifacts/ai-progress-objective-30games/weights.json'
assert options['policies'] == {'allied': candidate, 'axis': 'heuristic'}
records = sorted(summary['records'], key=lambda row: row['match'])
assert [r['match'] for r in records] == list(range(1800000, 1800030))
games, manifests = [], []
for row in records:
    assert row['stopReason'] == 'FINISHED' and row['replay']['ok'] is True
    assert row['errors'] == [] and row['rejected'] == 0 and row['fatalCode'] is None
    assert row['reached'] == {'gameTurn': 8, 'phase': 'COMPLETE'}
    assert row['summary']['mapStyle'] == 'TEMPERATE_INLAND'
    assert row['summary']['engagement'] == 'AXIS_ATTACKS'
    side = 'allied' if row['match'] % 2 == 0 else 'axis'
    other = 'axis' if side == 'allied' else 'allied'
    own, opponent = row['sides'][side], row['sides'][other]
    assert own['policy'] == candidate and opponent['policy'] == 'heuristic'
    assert own['stepsKilled'] == opponent['stepsLost']
    assert opponent['stepsKilled'] == own['stepsLost']
    path = root / 'matches' / f"match-{row['match']}.save.json"
    raw = path.read_bytes()
    save = json.loads(raw)
    assert save['finalStateHash'] == row['finalStateHash'] and save['lifecycle'] == 'FINISHED'
    assert len(save['acceptedActions']) == row['accepted']
    final = json.loads(save['currentSnapshot'])
    control = {entry['hexId']: entry['controllerId'] for entry in final['mapState']['hexControl']}
    points = {player['id']: sum(o['points'] for o in final['configuration']['objectives']
                               if control.get(o['hexId']) == player['id']) for player in final['scenario']['players']}
    assert points[f'player:{side}'] == own['vp'] and points[f'player:{other}'] == opponent['vp']
    games.append({'match': row['match'], 'mapSeed': row['seeds']['map'], 'candidateSide': side,
                  'candidateVp': own['vp'], 'standardVp': opponent['vp'],
                  'vpMargin': own['vp'] - opponent['vp'], 'candidateKill': own['stepsKilled'],
                  'candidateLoss': own['stepsLost'], 'standardKill': opponent['stepsKilled'],
                  'standardLoss': opponent['stepsLost'], 'killLossMargin': own['stepsKilled'] - own['stepsLost'],
                  'candidateOos': own['outOfSupply'], 'standardOos': opponent['outOfSupply'],
                  'accepted': row['accepted'], 'initialStateHash': save['initialStateHash'],
                  'finalStateHash': row['finalStateHash']})
    manifests.append({'match': row['match'], 'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest(),
                      'traceSha256': hashlib.sha256(path.with_name(f"match-{row['match']}.trace.jsonl").read_bytes()).hexdigest()})
pairs = []
for index, expected in enumerate(registration['seedPairs']):
    a, b = games[2 * index:2 * index + 2]
    raw_a, raw_b = records[2 * index:2 * index + 2]
    assert raw_a['seeds'] == raw_b['seeds'] == {key: value for key, value in expected.items() if key != 'firstMatch'}
    assert a['initialStateHash'] == b['initialStateHash']
    assert [a['candidateSide'], b['candidateSide']] == ['allied', 'axis']
    pairs.append({'firstMatch': a['match'], 'mapSeed': a['mapSeed'],
                  'defenderVpMargin': a['vpMargin'], 'attackerVpMargin': b['vpMargin'],
                  'vpMargin': (a['vpMargin'] + b['vpMargin']) / 2,
                  'candidateKill': (a['candidateKill'] + b['candidateKill']) / 2,
                  'candidateLoss': (a['candidateLoss'] + b['candidateLoss']) / 2,
                  'killLossMargin': (a['killLossMargin'] + b['killLossMargin']) / 2})
values = [row['vpMargin'] for row in pairs]
mean, se = statistics.mean(values), statistics.stdev(values) / math.sqrt(15)
totals = {key: sum(game[key] for game in games) for key in ('candidateVp', 'standardVp', 'candidateKill',
          'candidateLoss', 'standardKill', 'standardLoss', 'candidateOos', 'standardOos', 'accepted')}
result = {'qualification': 'EXPLORATORY_30_GAMES_NO_PROMOTION', 'registration': registration,
          'summarySha256': hashlib.sha256(summary_bytes).hexdigest(),
          'primary': {'seedPairs': 15, 'games': 30, 'meanPairedVpMargin': mean, 'standardErrorAcrossSeeds': se,
                      'descriptive95PercentTIntervalDf14': [mean - 2.1447866879169273 * se, mean + 2.1447866879169273 * se],
                      'minimumPair': min(values), 'maximumPair': max(values),
                      'positivePairs': sum(value > 0 for value in values), 'zeroPairs': sum(value == 0 for value in values),
                      'negativePairs': sum(value < 0 for value in values)},
          'totals': totals,
          'perGameVpSigns': {'positive': sum(g['vpMargin'] > 0 for g in games),
                            'zero': sum(g['vpMargin'] == 0 for g in games), 'negative': sum(g['vpMargin'] < 0 for g in games)},
          'byCandidateRole': {side: {'games': len(selected := [g for g in games if g['candidateSide'] == side]),
              'meanVpMargin': statistics.mean(g['vpMargin'] for g in selected),
              'vpMarginRange': [min(g['vpMargin'] for g in selected), max(g['vpMargin'] for g in selected)]}
              for side in ('allied', 'axis')},
          'pairs': pairs, 'games': games, 'manifests': manifests,
          'elapsedMs': summary['elapsedMs']}
(root / 'results.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
print(json.dumps({key: result[key] for key in ('primary', 'totals', 'perGameVpSigns', 'byCandidateRole')}, allow_nan=False))
