import hashlib
import importlib.util
import itertools
import json
from pathlib import Path

root = Path('artifacts/ai-movement-metric-stability')
registration = json.loads((root / 'registration.json').read_text())
paths = {'script': Path(__file__), 'protocol': root / 'protocol.md',
         'helper': Path('scripts/ai-vp-metrics-compare.py'),
         'panel': Path('docs/quality/evidence/ai-movement-window-refinement-2026-10-20/panel.json')}
for key, path in paths.items():
    assert hashlib.sha256(path.read_bytes()).hexdigest() == registration[f'{key}Sha256'], key
spec = importlib.util.spec_from_file_location('helper', paths['helper'])
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
panel = json.loads(paths['panel'].read_text())
variables = ['finalVp', *[f'early:{key}' for key in ('VP', 'M0', 'M1', 'M2')], *panel[0]['features']]
assert len(variables) == 18
climates = sorted({row['climate'] for row in panel})
seeds = {climate: sorted({row['pair'] for row in panel if row['climate'] == climate}) for climate in climates}
variants = sorted({row['variant'] for row in panel})
families = sorted({row['family'] for row in panel})
results = {}
for variable in variables:
    measurements = {}
    for row in panel:
        value = row['finalVp'] if variable == 'finalVp' else row['early'][variable.split(':')[1]] if variable.startswith('early:') else row['features'][variable]
        measurements[(row['variant'], row['pair'])] = value
    splits = []
    for split, choices in enumerate(itertools.product(range(2), repeat=2)):
        dev = [seeds[climate][choice] for climate, choice in zip(climates, choices)]
        evaluation = [seeds[climate][1 - choice] for climate, choice in zip(climates, choices)]
        x = [sum(measurements[(variant, seed)] for seed in dev) / 2 for variant in variants]
        y = [sum(measurements[(variant, seed)] for seed in evaluation) / 2 for variant in variants]
        contrast_x, contrast_y, contrasts = [], [], []
        for family in families:
            members = {row['direction']: row['variant'] for row in panel if row['family'] == family}
            assert set(members) == {'half', 'double'}
            a = sum(measurements[(members['double'], seed)] - measurements[(members['half'], seed)] for seed in dev) / 2
            b = sum(measurements[(members['double'], seed)] - measurements[(members['half'], seed)] for seed in evaluation) / 2
            contrast_x.append(a)
            contrast_y.append(b)
            contrasts.append({'family': family, 'dev': a, 'evaluation': b,
                              'bothNonzero': a != 0 and b != 0, 'sameNonzeroSign': a * b > 0})
        splits.append({'split': split, 'devSeeds': dev, 'evaluationSeeds': evaluation,
                       'variantMeans': [{'variant': variant, 'dev': a, 'evaluation': b} for variant, a, b in zip(variants, x, y)],
                       'variantSpearman': helper.pearson(helper.ranks(x), helper.ranks(y)),
                       'familyContrastSpearman': helper.pearson(helper.ranks(contrast_x), helper.ranks(contrast_y)),
                       'familyBothNonzero': sum(a != 0 and b != 0 for a, b in zip(contrast_x, contrast_y)),
                       'familySameNonzeroSign': sum(a * b > 0 for a, b in zip(contrast_x, contrast_y)),
                       'familyContrasts': contrasts})
    results[variable] = splits
output = {'qualification': 'DESCRIPTIVE_POST_RESULT_META_ANALYSIS', 'registration': registration,
          'pairRows': len(panel), 'variables': len(variables), 'dependentSplits': 4, 'results': results}
(root / 'results.json').write_text(json.dumps(output, indent=2, allow_nan=False) + '\n')
print(json.dumps({key: [{'split': row['split'], 'variantSpearman': row['variantSpearman'],
                         'familyContrastSpearman': row['familyContrastSpearman'],
                         'sameSign': row['familySameNonzeroSign'], 'bothNonzero': row['familyBothNonzero']}
                        for row in value] for key, value in results.items()}, allow_nan=False))
