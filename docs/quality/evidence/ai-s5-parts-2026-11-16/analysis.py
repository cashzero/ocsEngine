"""S5.2b / S5.4c / optionAdvance analysis, registered before any continuation (registration.json in this folder).

    python3 docs/quality/evidence/ai-s5-parts-2026-11-16/analysis.py parts     # after the part runs
    python3 docs/quality/evidence/ai-s5-parts-2026-11-16/analysis.py cand2     # after the cand2 run

parts: each weight alone against heuristic@86, in the roles where it acts, from artifacts/ai-s5/s52{,b}/{west,east,reused}
(heuristic@86's rows are S5.2's). A role's effect is (Western + Eastern) / 2, SE over maps. A weight's pair effect is the
sum of its roles' effects / 2 (a role where it does not act contributes 0). The attacker's arrivalRailForward and hqBridge
are measured together as cand - approach (registration-amendment.json) and kept or dropped together. Weights with a pair
effect above 0 make cand2; cand2-weights.json is written.
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
PAIRS = 40
PAIR_SDS = (3.7, 4.5)


def files(*roots):
    return sorted(path for root in roots for group in ('west', 'east', 'reused') for path in glob.glob(f'{root}/{group}/*.jsonl'))


def grouped(paths, name, metrics='margin.vp', baseline='v86'):
    out = f'{PARTS}/compare-{name}.json'
    with open(f'{PARTS}/compare-{name}.txt', 'w') as text:
        subprocess.run(['python3', 'scripts/ai-continue-compare.py', *paths, '--baseline', baseline, '--by-style', '--by-role',
                        '--cluster-by-map', '--metrics', metrics, '--out', out], check=True, stdout=text)
    return json.load(open(out))['report']['grouped']


def pass_probability(estimate, se, pair_sd):
    threshold = 2.1 * pair_sd / math.sqrt(PAIRS)
    return NormalDist().cdf((estimate - threshold) / math.sqrt(pair_sd ** 2 / PAIRS + se ** 2))


def unfinished(paths):
    return [f"{row['save']} {row['at']} {row['variant']} dice {row['dice']}: {row['reason']}" for path in paths
            for row in map(json.loads, open(path)) if row['horizon'] == 'end' and row['reason'] != 'FINISHED']


def role_effect(cells, role):
    """(Western + Eastern) / 2 of one role; the styles have no map in common, so their SEs combine as independent."""
    west, east = cells[f'western_europe {role}'], cells[f'eastern_europe {role}']
    return (west['mean'] + east['mean']) / 2, math.hypot(west['se'], east['se']) / 2


if sys.argv[1] == 'parts':
    # Amended before the results were read (registration-amendment.json): the attacker's arrivalRailForward and hqBridge
    # are measured together, as cand - approach on the attacker branches, and kept or dropped together.
    paths = files(S52, PARTS)
    report = grouped(paths, 'parts', 'margin.vp,margin.objectives,margin.killLoss')
    supply = grouped(paths, 'supply', 'margin.vp', baseline='approach')
    effects = {}
    print('== Role effects, VP margin a game at the end, (Western + Eastern) / 2 (SE over maps)')
    for variant, role, source in [('approach', 'attacker', report), ('approach', 'defender', report), ('arrival', 'defender', report),
                                  ('cut', 'defender', report), ('opt', 'attacker', report)]:
        cells = source[variant]['end']['margin.vp']
        for style in ('western_europe', 'eastern_europe'):
            entry = cells[f'{style} {role}']
            print(f"  {variant:9s} {style:15s} {role:9s} {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps), changed {entry['changed']}")
        effects[(variant, role)] = role_effect(cells, role)
        print(f"  {variant:9s} {role:9s} role effect {effects[(variant, role)][0]:+.2f} ± {effects[(variant, role)][1]:.2f}")
    cells = supply['cand']['end']['margin.vp']
    for style in ('western_europe', 'eastern_europe'):
        entry = cells[f'{style} attacker']
        print(f"  cand - approach {style:15s} attacker {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps)")
    effects[('supply', 'attacker')] = role_effect(cells, 'attacker')
    print(f"  arrivalRailForward + hqBridge, attacker role effect {effects[('supply', 'attacker')][0]:+.2f} ± {effects[('supply', 'attacker')][1]:.2f}")
    approach_all = report['approach']['end']['margin.vp']['all cells equally']
    pairs = {
        'approach': (approach_all['mean'], approach_all['se'], {'approachAttack': 1}),
        'arrival + bridge': ((effects[('supply', 'attacker')][0] + effects[('arrival', 'defender')][0]) / 2,
                             math.hypot(effects[('supply', 'attacker')][1], effects[('arrival', 'defender')][1]) / 2,
                             {'arrivalRailForward': 1, 'hqBridge': 1}),
        'cut': (effects[('cut', 'defender')][0] / 2, effects[('cut', 'defender')][1] / 2, {'defenderCut': 2}),
        'opt': (effects[('opt', 'attacker')][0] / 2, effects[('opt', 'attacker')][1] / 2, {'optionAdvance': 1}),
    }
    kept = {}
    print('== Pair effects (the decision: above 0)')
    for name, (pair, se, weights) in pairs.items():
        established = ' established' if pair - 2.1 * se > 0 else ''
        print(f"  {name:17s} {pair:+.2f} ± {se:.2f}  [{'kept' if pair > 0 else 'dropped'}{established}]")
        if pair > 0:
            kept.update(weights)
    for variant in ('approach', 'arrival', 'cut', 'opt'):
        end = report[variant]['end']
        print(f"  {variant}: objectives {end['margin.objectives']['all cells equally']['mean']:+.2f}, Kill - Loss {end['margin.killLoss']['all cells equally']['mean']:+.2f} (cells equally)")
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
