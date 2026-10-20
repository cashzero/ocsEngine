import copy
import hashlib
import importlib.util
import json
from pathlib import Path

root = Path('artifacts/ai-movement-metric-followup')
source = Path('scripts/ai-movement-panel-compare.py')
original_root = Path('artifacts/ai-movement-metric-panel')
registration = json.loads((root / 'registration.json').read_text())
for label, path in [('script', Path(__file__)), ('protocol', root / 'protocol.md'),
                    ('scorer', source), ('originalAnalysis', original_root / 'results/analysis.json')]:
    assert hashlib.sha256(path.read_bytes()).hexdigest() == registration[f'{label}Sha256'], label
spec = importlib.util.spec_from_file_location('original_scorer', source)
scorer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scorer)
original = json.loads((original_root / 'results/analysis.json').read_text())
panel, audits, _ = scorer.load_panel(original_root / 'cohort.json', original_root / 'games',
                                    json.loads((original_root / 'analysis-registration.json').read_text()))
assert audits == original['provenance']['games']
old_feature, new_feature = 'approach:scoreBlocked', 'combat:scoreOrVisitedSupplyBlocked'
support, values = [], []
for audit in audits:
    data = json.loads(Path(audit['path']).read_text())
    windows = {}
    for group in data['groupRows']:
        assert group['gameTurn'] < 4
        if group['role'] != 'COMBAT':
            continue
        for row in group['objectives']:
            if row['basis'] != 'approach':
                continue
            assert row['initialHolder'] != group['playerId']
            assert row['finalSupplyChecked'] <= row['improving']
            assert row['finalSupplyChecked'] == row['routeRefusals'] + row['finalSupplyPreserved']
            key = (group['playerId'], group['gameTurn'], row['hexId'])
            if key not in windows:
                windows[key] = {'player': group['playerId'], 'turn': group['gameTurn'],
                                'hexId': row['hexId'], 'points': row['points'],
                                **dict.fromkeys(('scored', 'improving', 'checked', 'preserved', 'budget'), 0)}
            window = windows[key]
            for field, column in [('scored', 'scored'), ('improving', 'improving'),
                                  ('checked', 'finalSupplyChecked'), ('preserved', 'finalSupplyPreserved'),
                                  ('budget', 'correctionBudget')]:
                window[field] += row[column]
    player_values = {}
    for player in data['features']:
        selected = [window for window in windows.values() if window['player'] == player]
        blocked = sum(w['points'] for w in selected if w['scored'] > 0 and w['improving'] == 0)
        assert blocked / data['diagnostics']['denominator'] == data['features'][player]['approach']['scoreBlocked']
        combined = 0
        for window in selected:
            window['scoreBlocked'] = window['scored'] > 0 and window['improving'] == 0
            window['visitedSupplyExhausted'] = window['improving'] > 0 and window['checked'] == window['improving'] and window['preserved'] == 0
            window['unknownImproving'] = window['checked'] < window['improving'] and window['preserved'] == 0
            window['contributes'] = window['scoreBlocked'] or window['visitedSupplyExhausted']
            if window['contributes']:
                combined += window['points']
        player_values[player] = combined / data['diagnostics']['denominator']
    player = data['game']['variantPlayer']
    opponent = next(other for other in player_values if other != player)
    values.append(player_values[player] - player_values[opponent])
    support.append({'gameIndex': data['gameIndex'], 'featuresByPlayer': player_values, 'windows': list(windows.values())})
for index, pair in enumerate(panel):
    pair['features'][new_feature] = sum(values[2 * index:2 * index + 2]) / 2
scorer.FEATURES = [old_feature, new_feature]
outputs = []
for original_row in original['predictions']:
    dev = {variant: scorer.mean_row([p for p in panel if p['variant'] == variant and p['pair'] in original_row['developmentSeeds']])
           for variant in {p['variant'] for p in panel}}
    train = [dev[variant] for variant in original_row['trainVariants']]
    assert len(train) == 8
    held_family = original_row['family']
    assert all(p['family'] != held_family for p in panel if p['variant'] in original_row['trainVariants'])
    residuals = copy.deepcopy(train)
    for row in residuals:
        row['y'] -= row['early']['M2']
    target = dev[original_row['variant']]
    offset = target['early']['M2']
    fits = {'m2ResidualMean': scorer.fit(residuals, with_vp=False)}
    predictions = {'zero': 0.0, 'identity:M2': offset,
                   'm2ResidualMean': offset + scorer.predict(fits['m2ResidualMean'], target)}
    for feature in (old_feature, new_feature):
        for prefix, rows, base in [('alone', train, 0.0), ('m2Residual', residuals, offset)]:
            name = f'{prefix}:{feature}'
            fits[name] = scorer.fit(rows, feature, False)
            predictions[name] = base + scorer.predict(fits[name], target)
    assert abs(predictions[f'alone:{old_feature}'] - original_row['predictions'][f'alone:{old_feature}']) < 1e-12
    outputs.append({key: original_row[key] for key in ('split', 'variant', 'family', 'developmentSeeds', 'evaluationSeeds', 'trainVariants', 'observed', 'byClimate')}
                   | {'predictions': predictions, 'fits': fits})
all_windows = [w for game in support for w in game['windows']]
result = {'qualification': 'POST_RESULT_EXPLORATION_ONLY', 'registration': registration,
          'support': {'windows': len(all_windows), **{field: sum(w[field] for w in all_windows)
                      for field in ('scoreBlocked', 'visitedSupplyExhausted', 'contributes', 'unknownImproving')},
                      'contributingWindowsWithCorrectionOmissions': sum(w['contributes'] and w['budget'] > 0 for w in all_windows),
                      'rawPlayerScoreBlockedEqualityChecks': len(audits) * 2,
                      'nonzeroPairValues': sum(p['features'][new_feature] != 0 for p in panel)},
          'overall': scorer.score(outputs),
          'bySplit': {str(split): scorer.score([row for row in outputs if row['split'] == split]) for split in range(4)},
          'byFamily': {family: scorer.score([row for row in outputs if row['family'] == family]) for family in sorted({row['family'] for row in outputs})},
          'byClimate': {climate: scorer.score(outputs, climate) for climate in sorted(outputs[0]['byClimate'])},
          'panel': panel, 'predictions': outputs, 'windowSupport': support}
(root / 'results.json').write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
print(json.dumps({key: result[key] for key in ('qualification', 'support', 'overall', 'byClimate')}, allow_nan=False))
