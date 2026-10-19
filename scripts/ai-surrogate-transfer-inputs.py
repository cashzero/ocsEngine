#!/usr/bin/env python3
"""Validate historical P8 artifacts and expose the registered GT4 pair effects."""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

AXIS, ALLIED = 'player:axis', 'player:allied'
MODEL_NAMES = {'M0': 'M0 VP', 'M1': 'M1 + steps, out of trace',
               'M2': 'M2 + objective reach and risk'}
METRIC_SIGNS = {'steps': 1, 'outOfTrace': -1, 'objectiveReachColumn': 1,
                'objectiveVpAtRisk': -1, 'stacksExposedAllocated': -1, 'hqsInReach': -1}
SOURCE_FILES = {'scripts/ai-position-surrogacy.py', 'scripts/ai-position-final.py',
                'scripts/ai-position-validate.py', 'scripts/ai-vp-metrics-compare.py',
                'scripts/ai-position-record.mjs', 'scripts/ai-position-metrics.mjs'}
BOUNDARIES = [(turn, player) for turn in range(1, 9) for player in (0, 1)]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def read_json(path, expected_hash=None):
    raw = path.read_bytes()
    actual = digest(raw)
    require(expected_hash is None or actual == expected_hash, f'SHA256 mismatch: {path}')
    return json.loads(raw), {'file': str(path), 'sha256': actual}


def verify_sources(repository_root, registered):
    require(set(registered) == SOURCE_FILES, 'registration must bind all six historical source scripts')
    identities = []
    for name, expected in sorted(registered.items()):
        actual = digest((repository_root / name).read_bytes())
        require(actual == expected, f'SHA256 mismatch: {name}')
        identities.append({'file': name, 'sha256': actual})
    return identities


def variant_axes(variants):
    require(len(variants) == 24, 'expected 24 registered variants')
    axes, families = {}, defaultdict(list)
    for variant in variants:
        name, family = variant['name'], variant['weight']
        require(name not in axes, f'duplicate variant: {name}')
        require(finite(variant['default']) and variant['default'] != 0 and finite(variant['value']),
                f'invalid registered weight: {name}')
        ratio = variant['value'] / variant['default']
        require(ratio in (0.5, 2), f'expected half or double perturbation: {name}')
        direction = 'half' if ratio == 0.5 else 'double'
        axes[name] = {'family': family, 'direction': direction}
        families[family].append(direction)
    require(len(families) == 12 and all(sorted(v) == ['double', 'half'] for v in families.values()),
            'expected 12 complete half/double weight families')
    return axes


def validate_rows(rows, record, source, policies):
    match = record['match']
    require(sorted((r['gameTurn'], r['playerTurnIndex']) for r in rows) == BOUNDARIES,
            f'expected exactly 16 player-turn rows: {source}, {match}')
    final = {AXIS: record['sides']['axis']['vp'], ALLIED: record['sides']['allied']['vp']}
    require(all(finite(value) for value in final.values()), f'invalid final VP: {source}, {match}')
    for row in rows:
        require(row['match'] == match and row['dir'] == source and row['policies'] == policies,
                f'row source or policy mismatch: {source}, {match}')
        require(row['engagement'] == 'AXIS_ATTACKS' and row['attackerId'] == AXIS,
                f'wrong engagement: {source}, {match}')
        require(row['finalVp'] == final, f'row final VP mismatch: {source}, {match}')
        require(set(row['metrics']) == {AXIS, ALLIED} and row['phasingPlayerId'] in (AXIS, ALLIED),
                f'invalid player metrics: {source}, {match}')
        require(all(finite(row['metrics'][p][key]) for p in (AXIS, ALLIED)
                    for key in ('vp', *METRIC_SIGNS)), f'nonfinite metric: {source}, {match}')
    return next(row for row in rows if (row['gameTurn'], row['playerTurnIndex']) == (4, 0))


def validate_save(save, record, source):
    match = record['match']
    require(save['finalStateHash'] == record['finalStateHash'], f'save final hash mismatch: {source}, {match}')
    actions = save['acceptedActions']
    require(len(actions) == record['accepted'], f'save action count mismatch: {source}, {match}')
    counts = dict(Counter(action['kind'] for action in actions))
    require(counts == record['actionCounts'], f'save action kind counts mismatch: {source}, {match}')
    for player, side in ((AXIS, 'axis'), (ALLIED, 'allied')):
        player_counts = dict(Counter(action['kind'] for action in actions if action['actorId'] == player))
        require(player_counts == record['sides'][side]['actions'],
                f'save player action counts mismatch: {source}, {match}')
    require(all(action['actorId'] in (AXIS, ALLIED) for action in actions),
            f'unknown action actor: {source}, {match}')
    current = json.loads(save['currentSnapshot'])
    require(current['revision'] == len(actions), f'snapshot revision mismatch: {source}, {match}')
    require(current['victory'] == record['victory'], f'snapshot victory mismatch: {source}, {match}')
    reached = {key: current['sequence'][key] for key in ('gameTurn', 'phase')}
    require(reached == record['reached'] == {'gameTurn': 8, 'phase': 'COMPLETE'},
            f'snapshot endpoint mismatch: {source}, {match}')
    scores = {entry['playerId']: entry['points'] for entry in current['victory']['scores']}
    require(scores == {AXIS: record['sides']['axis']['vp'], ALLIED: record['sides']['allied']['vp']},
            f'snapshot VP mismatch: {source}, {match}')
    action_hash = digest(canonical(actions))
    return {'acceptedActionsSha256': action_hash, 'acceptedActions': len(actions),
            'initialStateHash': save['initialStateHash'], 'finalStateHash': save['finalStateHash'],
            'id': digest(canonical([save['initialStateHash'], save['finalStateHash'], action_hash]))}


def validate_pair(members, label):
    require(len(members) == 2 and {m['player'] for m in members} == {AXIS, ALLIED},
            f'pair must have opposite variant seats: {label}')
    require(members[0]['identity']['seeds'] == members[1]['identity']['seeds'],
            f'pair seeds differ: {label}')
    require(members[0]['identity']['initialStateHash'] == members[1]['identity']['initialStateHash'],
            f'pair initial hashes differ: {label}')
    return (members[0]['identity']['seeds'], members[0]['identity']['initialStateHash'])


def reject_training_overlap(training_games, panel_seeds):
    overlap = {game['mapSeed'] for game in training_games} & set(panel_seeds)
    require(not overlap, f'historical training/P8 map-seed overlap: {sorted(overlap)}')


def reproduce_means(panel, raw_results, expected_results):
    grouped = defaultdict(list)
    for row in panel:
        grouped[row['variant']].append(row)
    require(raw_results['variants'] == expected_results['variants'] == len(grouped) == 24,
            'results variant count mismatch')
    require(set(raw_results['effects']) == set(expected_results['effects']) == set(grouped),
            'results variant identities mismatch')
    checks, rounded, max_error = [], 0, 0.0
    for variant, rows in grouped.items():
        values = {'dVP': sum(row['finalVp'] for row in rows) / len(rows)}
        for key in (*MODEL_NAMES, *METRIC_SIGNS):
            registered_key = f'GT4 {MODEL_NAMES.get(key, key)}'
            values[registered_key] = sum(row['early'][key] for row in rows) / len(rows)
        for key, value in values.items():
            raw_value = raw_results['effects'][variant][key]
            expected_value = expected_results['effects'][variant][key]
            require(finite(raw_value) and finite(expected_value), f'nonfinite registered mean: {variant}, {key}')
            require(math.isclose(value, raw_value, abs_tol=1e-8, rel_tol=1e-10),
                    f'registered mean mismatch: {variant}, {key}: {value} versus {raw_value}')
            if expected_value != raw_value:
                require(expected_value == round(raw_value, 4),
                        f'committed mean differs from full precision record: {variant}, {key}')
                rounded += 1
            error = abs(value - raw_value)
            max_error = max(max_error, error)
            checks.append({'variant': variant, 'outcome': key, 'reproduced': value,
                           'registeredFullPrecision': raw_value, 'committedExpected': expected_value,
                           'absoluteError': error})
    return {'checks': checks, 'count': len(checks), 'maxAbsoluteError': max_error,
            'absTolerance': 1e-8, 'relTolerance': 1e-10, 'committedFourDecimalValues': rounded}


def load_panel(repository_root: Path, artifact_root: Path, registration_path: Path,
               manifest_path: Path, expected_results_path: Path):
    repository_root, artifact_root = Path(repository_root), Path(artifact_root)
    registration, registration_identity = read_json(Path(registration_path))
    manifest, manifest_identity = read_json(Path(manifest_path))
    expected, expected_identity = read_json(Path(expected_results_path))
    sources = verify_sources(repository_root, registration['scripts'])
    axes = variant_axes(registration['variants'])
    require(registration['analysis']['primaryGameTurn'] == 4, 'registered primary turn must be GT4')
    groups = {group['name']: group for group in registration['groups']}
    require(len(groups) == len(registration['groups']) == 2 and
            {group['style'] for group in groups.values()} == {'TEMPERATE_INLAND', 'EASTERN_EUROPE'},
            'expected the two registered climates')
    require(all(group['matches'] == 8 for group in groups.values()), 'expected eight games per variant/climate')
    entries = {(entry['variant'], entry['group']): entry for entry in manifest['files']}
    require(len(entries) == len(manifest['files']) == 48 and
            set(entries) == {(variant, group) for variant in axes for group in groups},
            'manifest must cover all 48 variant/climate sources once')
    weights = []
    for variant in registration['variants']:
        weight, identity = read_json(artifact_root / variant['file'], variant['sha256'])
        require(weight['weights'] == {variant['weight']: variant['value']},
                f'weight file does not implement registered perturbation: {variant["name"]}')
        weights.append(identity)
    raw_results, raw_results_identity = read_json(artifact_root / manifest['results']['file'],
                                                 manifest['results']['sha256'])
    spec = importlib.util.spec_from_file_location('surrogate_transfer_historical',
                                                 repository_root / 'scripts/ai-position-surrogacy.py')
    historical = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(historical)
    training_manifest = repository_root / registration['training']['manifest']
    training_games, training_audit = historical.VALIDATE.load_games(training_manifest, artifact_root)
    samples = [s for s in historical.FINAL.samples_of(training_games)
               if s['gameTurn'] == 4 and s['engagement'] == 'AXIS_ATTACKS']
    require(bool(samples), 'no historical GT4 Axis-attack training samples')
    games, files, paired, common_axes = [], [], defaultdict(list), {}
    for variant in registration['variants']:
        name = variant['name']
        for group_name, group in groups.items():
            entry = entries[name, group_name]
            source = group['out'].format(variant=name)
            rows_name = group['rows'].format(variant=name)
            require(entry['rows'] == rows_name and entry['finished'] == entry['replayOk'] == 8,
                    f'manifest source/count mismatch: {name}, {group_name}')
            summary, summary_identity = read_json(artifact_root / source / 'summary.json', entry['summarySha256'])
            rows_raw = (artifact_root / rows_name).read_bytes()
            require(digest(rows_raw) == entry['rowsSha256'], f'SHA256 mismatch: {rows_name}')
            options = summary['options']
            require(options['style'] == group['style'] and options['engagement'] == 'AXIS_ATTACKS'
                    and options['turns'] == 8 and options['swap'] is True and options['replay'] is True,
                    f'summary configuration mismatch: {source}')
            by_match = defaultdict(list)
            for line in rows_raw.splitlines():
                if line.strip():
                    row = json.loads(line)
                    by_match[row['match']].append(row)
            records = {record['match']: record for record in summary['records']}
            expected_matches = set(range(group['start'], group['start'] + 8))
            require(len(summary['records']) == len(records) == 8 and set(records) == set(by_match) == expected_matches,
                    f'rows/summary match identities differ: {source}')
            files.append({'variant': name, 'group': group_name, 'rows': rows_name,
                          'rowsSha256': digest(rows_raw), 'summary': summary_identity})
            for match in sorted(records):
                record = records[match]
                require(record['stopReason'] == 'FINISHED' and record['errors'] == []
                        and record['replay']['ok'] is True and record.get('fatalCode') is None,
                        f'incomplete, errored or replay-failed game: {source}, {match}')
                seeds = record['seeds']
                require(set(seeds) == {'map', 'oob', 'deployment', 'rules', 'axis', 'allied'}
                        and all(type(seed) is int for seed in seeds.values()),
                        f'invalid game seed identities: {source}, {match}')
                variant_policy = f'heuristic:{variant["file"]}'
                policies = {AXIS: record['sides']['axis']['policy'], ALLIED: record['sides']['allied']['policy']}
                require(set(policies.values()) == {'heuristic', variant_policy},
                        f'wrong policy opponents: {source}, {match}')
                player = next(p for p, policy in policies.items() if policy == variant_policy)
                require(player == (ALLIED if (match - group['start']) % 2 == 0 else AXIS),
                        f'wrong registered seat swap: {source}, {match}')
                early = validate_rows(by_match[match], record, source, policies)
                save_path = artifact_root / source / f'match-{match}.save.json'
                save, save_identity = read_json(save_path)
                identity = {'variant': name, 'source': source, 'rows': rows_name,
                            'match': match, 'variantPlayer': player, 'policies': policies,
                            'seeds': seeds, 'saveSha256': save_identity['sha256'],
                            **validate_save(save, record, source), 'historicalReplayOk': True}
                game = {'variant': name, 'climate': group['style'], 'player': player,
                        'metrics': early['metrics'], 'identity': identity,
                        'finalVp': record['sides']['axis']['vp'] - record['sides']['allied']['vp']}
                games.append(game)
                paired[name, group['style'], seeds['map']].append(game)
            for pair_index in range(4):
                members = [game for game in games if game['variant'] == name and game['climate'] == group['style']
                           and (game['identity']['match'] - group['start']) // 2 == pair_index]
                seed_identity = validate_pair(members, (name, group_name, pair_index))
                axis = group['style'], pair_index
                require(axis not in common_axes or common_axes[axis] == seed_identity,
                        f'seed/initial identity differs across variants: {name}, {axis}')
                common_axes[axis] = seed_identity
    require(len(games) == 384 and len(paired) == 192, 'expected 384 games in 192 complete seed pairs')
    require(len({seeds['map'] for seeds, _ in common_axes.values()}) == 8, 'duplicate map-seed axis')
    reject_training_overlap(training_games, [seeds['map'] for seeds, _ in common_axes.values()])
    predictions = {}
    for short, name in MODEL_NAMES.items():
        features = historical.FINAL.MODELS[name]
        predictions[short] = historical.FINAL.fit_predict([features(s['metrics']) for s in samples],
                                                         [s['y'] for s in samples],
                                                         [features(game['metrics']) for game in games])
    for index, game in enumerate(games):
        sign = 1 if game['player'] == AXIS else -1
        game['early'] = {key: sign * values[index] for key, values in predictions.items()}
        game['early']['VP'] = sign * (game['metrics'][AXIS]['vp'] - game['metrics'][ALLIED]['vp'])
        game['early'].update({key: sign * metric_sign * (game['metrics'][AXIS][key] - game['metrics'][ALLIED][key])
                              for key, metric_sign in METRIC_SIGNS.items()})
        game['finalVp'] *= sign
        require(all(finite(value) for value in game['early'].values()), 'nonfinite historical model prediction')
    panel = []
    for (variant, climate, seed), members in paired.items():
        validate_pair(members, (variant, climate, seed))
        panel.append({'variant': variant, **axes[variant], 'climate': climate, 'pair': seed,
                      'finalVp': sum(game['finalVp'] for game in members) / 2,
                      'early': {key: sum(game['early'][key] for game in members) / 2 for key in members[0]['early']},
                      'games': [game['identity'] for game in members]})
    reproduction = reproduce_means(panel, raw_results, expected)
    audit = {'registration': registration_identity, 'manifest': manifest_identity,
             'expectedResults': expected_identity, 'fullPrecisionResults': raw_results_identity,
             'repositoryRoot': str(repository_root.resolve()), 'artifactRoot': str(artifact_root.resolve()),
             'sources': sources, 'weights': weights, 'files': files, 'training': training_audit,
             'trainingGames': len(training_games), 'trainingGT4AxisAttackSamples': len(samples),
             'trainingMapSeeds': sorted({game['mapSeed'] for game in training_games}),
             'variantAxes': [{'variant': name, **axes[name]} for name in axes],
             'seedAxes': [{'climate': climate, 'pairIndex': index, 'seeds': seeds, 'initialStateHash': initial}
                          for (climate, index), (seeds, initial) in common_axes.items()],
             'counts': {'variants': 24, 'families': 12, 'climates': 2, 'seedPairs': 8, 'pairEffects': 192,
                        'games': 384, 'rows': 6144, 'savedActionIdentities': 384, 'savedEndpointsReconciled': 384,
                        'historicalReplayOk': 384, 'newEngineReplays': 0,
                        'distinctTrajectoryIdentities': len({game['identity']['id'] for game in games})},
             'identityScope': 'Save bytes, canonical accepted actions, saved hash strings, action counts and '
                              'saved snapshot endpoints reconciled; replay.ok is historical summary evidence. '
                              'No new engine replay or engine state-hash recomputation was performed.',
             'meanReproduction': reproduction}
    return panel, audit


def self_test():
    def rejected(function, expected):
        try:
            function()
        except ValueError as error:
            require(expected in str(error), f'wrong failure: {error}')
        else:
            raise AssertionError(f'accepted invalid input: {expected}')
    identity = {'seeds': {'map': 1}, 'initialStateHash': 'initial'}
    pair = [{'player': AXIS, 'identity': copy.deepcopy(identity)},
            {'player': ALLIED, 'identity': copy.deepcopy(identity)}]
    validate_pair(pair, 'valid')
    rejected(lambda: validate_pair(pair[:1], 'missing'), 'opposite variant seats')
    bad = copy.deepcopy(pair)
    bad[1]['identity']['seeds']['map'] = 2
    rejected(lambda: validate_pair(bad, 'seeds'), 'pair seeds differ')
    bad = copy.deepcopy(pair)
    bad[1]['identity']['initialStateHash'] = 'different'
    rejected(lambda: validate_pair(bad, 'initial'), 'pair initial hashes differ')
    policies = {AXIS: 'heuristic', ALLIED: 'heuristic:weight.json'}
    record = {'match': 1, 'sides': {'axis': {'vp': 2}, 'allied': {'vp': 1}}}
    rows = [{'match': 1, 'dir': 'source', 'policies': policies, 'engagement': 'AXIS_ATTACKS',
             'attackerId': AXIS, 'gameTurn': turn, 'playerTurnIndex': player, 'phasingPlayerId': AXIS,
             'finalVp': {AXIS: 2, ALLIED: 1},
             'metrics': {p: dict.fromkeys(('vp', *METRIC_SIGNS), 0) for p in (AXIS, ALLIED)}}
            for turn, player in BOUNDARIES]
    validate_rows(rows, record, 'source', policies)
    rejected(lambda: validate_rows(rows[:-1], record, 'source', policies), '16 player-turn rows')
    bad_rows = copy.deepcopy(rows)
    bad_rows[0]['dir'] = 'other'
    rejected(lambda: validate_rows(bad_rows, record, 'source', policies), 'row source or policy mismatch')
    bad_rows = copy.deepcopy(rows)
    bad_rows[6]['metrics'][AXIS]['vp'] = float('nan')
    rejected(lambda: validate_rows(bad_rows, record, 'source', policies), 'nonfinite metric')
    rejected(lambda: reject_training_overlap([{'mapSeed': 1}], [1]), 'training/P8 map-seed overlap')
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / 'input.json'
        path.write_text('{}')
        read_json(path, digest(b'{}'))
        rejected(lambda: read_json(path, '0' * 64), 'SHA256 mismatch')
    rejected(lambda: verify_sources(Path('.'), {}), 'all six historical source scripts')
    print('self-test passed: opposite seats, pair seeds and initial hashes, complete rows, row provenance, '
          'finite metrics, input hashes, required source coverage and historical training exclusion')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true', required=True)
    parser.parse_args()
    self_test()
