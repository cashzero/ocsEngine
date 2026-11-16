"""S5.2b / S5.4c / optionAdvance analysis, registered before any continuation (registration.json in this folder).

    python3 docs/quality/evidence/ai-s5-parts-2026-11-16/analysis.py parts     # after the part runs
    python3 docs/quality/evidence/ai-s5-parts-2026-11-16/analysis.py cand2     # after the cand2 run

parts: each weight alone against heuristic@86, in the roles where it acts, from artifacts/ai-s5/s52{,b}/{west,east,reused}
(heuristic@86's rows are S5.2's). A role's effect is (Western + Eastern) / 2, SE over maps. A weight's pair effect is the
sum of its roles' effects / 2 (a role where it does not act contributes 0). Weights with a pair effect above 0 make cand2;
cand2-weights.json is written.
cand2: the S5.2 estimate and reading for cand2 (artifacts/ai-s5/s52c and S5.2's heuristic@86 rows).
"""
import glob
import json
import math
import subprocess
import sys
from statistics import NormalDist

FOLDER = 'docs/quality/evidence/ai-s5-parts-2026-11-16'
S52 = 'artifacts/ai-s5/s52'
PARTS = 'artifacts/ai-s5/s52b'
CAND2 = 'artifacts/ai-s5/s52c'
ROLES = {'approach': ('attacker', 'defender'), 'arrival': ('attacker', 'defender'), 'bridge': ('attacker',),
         'cut': ('defender',), 'opt': ('attacker',)}
WEIGHTS = {'approach': ('approachAttack', 1), 'arrival': ('arrivalRailForward', 1), 'bridge': ('hqBridge', 1),
           'cut': ('defenderCut', 2), 'opt': ('optionAdvance', 1)}
PAIRS = 40
PAIR_SDS = (3.7, 4.5)


def files(*roots):
    return sorted(path for root in roots for group in ('west', 'east', 'reused') for path in glob.glob(f'{root}/{group}/*.jsonl'))


def grouped(paths, name, metrics='margin.vp'):
    out = f'{PARTS}/compare-{name}.json'
    with open(f'{PARTS}/compare-{name}.txt', 'w') as text:
        subprocess.run(['python3', 'scripts/ai-continue-compare.py', *paths, '--baseline', 'v86', '--by-style', '--by-role',
                        '--cluster-by-map', '--metrics', metrics, '--out', out], check=True, stdout=text)
    return json.load(open(out))['report']['grouped']


def pass_probability(estimate, se, pair_sd):
    threshold = 2.1 * pair_sd / math.sqrt(PAIRS)
    return NormalDist().cdf((estimate - threshold) / math.sqrt(pair_sd ** 2 / PAIRS + se ** 2))


def unfinished(paths):
    return [f"{row['save']} {row['at']} {row['variant']} dice {row['dice']}: {row['reason']}" for path in paths
            for row in map(json.loads, open(path)) if row['horizon'] == 'end' and row['reason'] != 'FINISHED']


if sys.argv[1] == 'parts':
    paths = files(S52, PARTS)
    report = grouped(paths, 'parts', 'margin.vp,margin.objectives,margin.killLoss')
    kept = {}
    print('== Each weight alone - heuristic@86, VP margin a game at the end (SE over maps)')
    for variant, roles in ROLES.items():
        cells = report[variant]['end']['margin.vp']
        for role in roles:
            for style in ('western_europe', 'eastern_europe'):
                entry = cells.get(f'{style} {role}')
                if entry is None:
                    print(f'  {variant:9s} {style:15s} {role:9s} no rows')
                    continue
                print(f"  {variant:9s} {style:15s} {role:9s} {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps), changed {entry['changed']}")
        # With the variant's rows only in its roles, 'all cells equally' averages those roles' style cells (one cell: itself).
        overall = lambda metric: report[variant]['end'][metric].get('all cells equally') or next(iter(report[variant]['end'][metric].values()))
        allc = overall('margin.vp')
        pair = allc['mean'] * len(roles) / 2
        se = allc['se'] * len(roles) / 2
        print(f"  {variant:9s} pair effect {pair:+.2f} ± {se:.2f}  [{'kept' if pair > 0 else 'dropped'}]"
              f"  objectives {overall('margin.objectives')['mean'] * len(roles) / 2:+.2f},"
              f" Kill - Loss {overall('margin.killLoss')['mean'] * len(roles) / 2:+.2f} a pair")
        if pair > 0:
            kept[WEIGHTS[variant][0]] = WEIGHTS[variant][1]
    print(f'== cand2: {kept or "no weight kept: stop"}')
    if kept:
        json.dump({'label': 'S5 cand2: the weights whose pair effect is above 0', 'weights': kept}, open(f'{FOLDER}/cand2-weights.json', 'w'))
    print(f'== Continuations that did not finish the game: {len(unfinished(paths))}')
else:
    paths = files(S52, CAND2)
    vp = grouped(paths, 'cand2')['cand2']['end']['margin.vp']
    print('== cand2 - heuristic@86, VP margin a game at the end (SE over maps)')
    for name, entry in vp.items():
        print(f"  {name:38s} {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps), changed {entry['changed']}"
              f"  [mean + 2.1 SE {entry['mean'] + 2.1 * entry['se']:+.2f}]")
    estimate, se = vp['all cells equally']['mean'], vp['all cells equally']['se']
    probabilities = {sd: pass_probability(estimate, se, sd) for sd in PAIR_SDS}
    for sd, probability in probabilities.items():
        print(f'  pair SD {sd}: threshold {2.1 * sd / math.sqrt(PAIRS):.2f}, pass probability {probability:.2f}')
    cells = {name: entry for name, entry in vp.items() if name != 'all cells equally' and ', roles equally' not in name}
    worse = [name for name, entry in cells.items() if entry['mean'] + 2.1 * entry['se'] < 0]
    if worse:
        print(f'  established worse in {worse}: fix before registering')
    elif all(p >= 0.8 for p in probabilities.values()):
        print('  both >= 0.8: recommend registering the independent batch (S5.3)')
    elif all(p < 0.5 for p in probabilities.values()):
        print('  both < 0.5: report to the user; recommend not registering')
    else:
        print('  report to the user with the probabilities: accept the lower probability, more S5.4 work, or stop')
    new = grouped([path for path in paths if '/reused/' not in path], 'cand2-new')['cand2']['end']['margin.vp']['all cells equally']
    print(f"== Without the 28 reused S4.7 branches: {new['mean']:+.2f} ± {new['se']:.2f}")
    print(f'== Continuations that did not finish the game: {len(unfinished(paths))}')
