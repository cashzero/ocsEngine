"""S5.2 analysis, registered before any continuation (registration.json in this folder).

    python3 docs/quality/evidence/ai-s5-vp-check-2026-11-15/analysis.py

Reads artifacts/ai-s5/s52/{west,east,reused}/*.jsonl (reused: the 28 Eastern branches S4.7 ran, heuristic@87 renamed
cand). Writes the comparison reports next to them (compare-all.{json,txt}, compare-new.{json,txt}) and prints:
- the estimate (Western attacker + Western defender + Eastern attacker + Eastern defender) / 4 of the VP change a game,
  cand - v86, with its SE over maps, and the same per cell and per style;
- the probability that an independent batch of 40 attack pairs passes (mean - 2.1 SE > 0) at a pair SD of 3.7 and 4.5;
- the registered reading;
- the estimate without the 28 reused branches;
- continuations that did not finish the game.
"""
import glob
import json
import math
import subprocess
from statistics import NormalDist

DATA = 'artifacts/ai-s5/s52'
METRICS = 'margin.vp,margin.objectives,margin.killLoss,margin.outOfTrace'
PAIRS = 40
PAIR_SDS = (3.7, 4.5)
ALL = 'all cells equally'


def compare(files, name):
    out = f'{DATA}/compare-{name}.json'
    with open(f'{DATA}/compare-{name}.txt', 'w') as text:
        subprocess.run(['python3', 'scripts/ai-continue-compare.py', *files, '--baseline', 'v86', '--by-style', '--by-role',
                        '--cluster-by-map', '--metrics', METRICS, '--out', out], check=True, stdout=text)
    return json.load(open(out))['report']['grouped']['cand']['end']


def pass_probability(estimate, se, pair_sd):
    """Observed mean of the batch ~ N(estimate, pair_sd^2 / PAIRS + se^2); it passes above 2.1 pair_sd / sqrt(PAIRS)."""
    threshold = 2.1 * pair_sd / math.sqrt(PAIRS)
    return NormalDist().cdf((estimate - threshold) / math.sqrt(pair_sd ** 2 / PAIRS + se ** 2))


files = {group: sorted(glob.glob(f'{DATA}/{group}/*.jsonl')) for group in ('west', 'east', 'reused')}
unfinished = [f"{row['save']} {row['at']} {row['variant']} dice {row['dice']}: {row['reason']}"
              for group in files.values() for path in group for row in map(json.loads, open(path))
              if row['horizon'] == 'end' and row['reason'] != 'FINISHED']
report = compare(files['west'] + files['east'] + files['reused'], 'all')
vp = report['margin.vp']
print('== VP margin a game, cand - v86, end of the game (SE over maps)')
for name, entry in vp.items():
    print(f"  {name:38s} {entry['mean']:+6.2f} ± {entry['se']:4.2f}  n {entry['n']} ({entry['clusters']} maps), "
          f"changed {entry['changed']}  [mean + 2.1 SE {entry['mean'] + 2.1 * entry['se']:+.2f}]")
for metric in METRICS.split(',')[1:]:
    entry = report[metric][ALL]
    print(f"  {metric:20s} (all cells equally) {entry['mean']:+6.2f} ± {entry['se']:4.2f}")
estimate, se = vp[ALL]['mean'], vp[ALL]['se']
probabilities = {sd: pass_probability(estimate, se, sd) for sd in PAIR_SDS}
print('== Independent batch, 40 attack pairs: pass probability')
for sd, probability in probabilities.items():
    print(f'  pair SD {sd}: threshold {2.1 * sd / math.sqrt(PAIRS):.2f}, probability {probability:.2f}')
cells = {name: entry for name, entry in vp.items() if name != ALL and ', roles equally' not in name}
worse = [name for name, entry in cells.items() if entry['mean'] + 2.1 * entry['se'] < 0]
print('== Reading (registered)')
if worse:
    print(f'  established worse in {worse}: fix before registering')
elif all(p >= 0.8 for p in probabilities.values()):
    print('  both >= 0.8: recommend registering the independent batch (S5.3)')
elif all(p < 0.5 for p in probabilities.values()):
    print('  both < 0.5: report to the user; recommend not registering')
else:
    print('  report to the user with the probabilities: accept the lower probability, S5.4 first, or stop')
new = compare(files['west'] + files['east'], 'new')['margin.vp'][ALL]
print(f"== Without the 28 reused S4.7 branches: {new['mean']:+.2f} ± {new['se']:.2f} "
      f"({', '.join(f'SD {sd}: {pass_probability(new['mean'], new['se'], sd):.2f}' for sd in PAIR_SDS)})")
print(f'== Continuations that did not finish the game: {len(unfinished)}')
for line in unfinished:
    print(f'  {line}')
