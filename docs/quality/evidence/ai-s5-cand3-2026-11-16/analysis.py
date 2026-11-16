"""cand3 analysis, registered before any continuation (registration.json in this folder).

    python3 docs/quality/evidence/ai-s5-cand3-2026-11-16/analysis.py

cand3's defender rows: artifacts/ai-s5/s52d/{west,east}. Its attacker rows are cand2's (artifacts/ai-s5/s52c), relabelled
cand3 into artifacts/ai-s5/s52d/attacker-from-cand2. heuristic@86's rows are S5.2's.
"""
import glob
import json
import math
import os
import subprocess
from statistics import NormalDist

OUT = 'artifacts/ai-s5/s52d'
CAND2 = 1.24


def pass_probability(estimate, se, pair_sd, pairs):
    threshold = 2.1 * pair_sd / math.sqrt(pairs)
    return NormalDist().cdf((estimate - threshold) / math.sqrt(pair_sd ** 2 / pairs + se ** 2))


os.makedirs(f'{OUT}/attacker-from-cand2', exist_ok=True)
for path in glob.glob('artifacts/ai-s5/s52c/*/*.jsonl'):
    rows = [json.loads(line) for line in open(path)]
    if rows and rows[0]['subject'] == 'axis':
        with open(f"{OUT}/attacker-from-cand2/{os.path.basename(path).replace('.cand2.', '.cand3.')}", 'w') as out:
            out.write(''.join(json.dumps({**row, 'variant': 'cand3'}) + '\n' for row in rows))
paths = sorted(glob.glob('artifacts/ai-s5/s52/*/*.jsonl') + glob.glob(f'{OUT}/*/*.jsonl'))
unfinished = [path for path in glob.glob(f'{OUT}/*/*.jsonl') for row in map(json.loads, open(path)) if row['horizon'] == 'end' and row['reason'] != 'FINISHED']
with open(f'{OUT}/compare-cand3.txt', 'w') as text:
    subprocess.run(['python3', 'scripts/ai-continue-compare.py', *paths, '--baseline', 'v86', '--by-style', '--by-role', '--cluster-by-map',
                    '--metrics', 'margin.vp', '--out', f'{OUT}/compare-cand3.json'], check=True, stdout=text)
vp = json.load(open(f'{OUT}/compare-cand3.json'))['report']['grouped']['cand3']['end']['margin.vp']
print('== cand3 - heuristic@86, VP margin a game at the end (SE over maps)')
for name, entry in vp.items():
    print(f"  {name:38s} {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps), changed {entry['changed']}")
estimate, se = vp['all cells equally']['mean'], vp['all cells equally']['se']
print(f"== {'cand3' if estimate > CAND2 else 'cand2'} goes to S5.3 (cand3 {estimate:+.2f} against cand2 {CAND2:+.2f})")
for pairs in (40, 80, 120):
    print(f'  {pairs} attack pairs: ' + ', '.join(f'SD {sd}: {pass_probability(estimate, se, sd, pairs):.2f}' for sd in (3.7, 4.5)))
print(f'== Continuations that did not finish the game: {len(unfinished)}')
