"""Re-analysis of the S4.7 continuations and the VP gate (docs/quality/evidence/ai-s4-vp-review-2026-11-15/README.md).

    python3 docs/quality/evidence/ai-s4-vp-review-2026-11-15/review.py

Reads artifacts/ai-vp-why/cont/<group>/*.jsonl (the S4.7 continuations). Prints: the meeting effect by map style, the
variance components of the VP difference, pooled estimates of each part's VP effect, and gate pass probabilities.
"""
import glob
import json
import math
import random
import statistics
from collections import defaultdict


def load(group):
    rows = [json.loads(line) for path in glob.glob(f'artifacts/ai-vp-why/cont/{group}/*.jsonl') for line in open(path) if line.strip()]
    cells = defaultdict(dict)
    for row in rows:
        if row['horizon'] != 'end':
            continue
        players = list(row['metrics'])
        own = next(p for p in players if p.endswith(row['subject']))
        enemy = next(p for p in players if p != own)
        metrics, events = row['metrics'], row['events']
        cells[(row['save'], row['at'], row['dice'])][row['variant']] = {
            'VP margin': metrics[own]['vp'] - metrics[enemy]['vp'], 'own objectives': metrics[own]['objectives'],
            'own attacks': events[own]['attacks'], 'own steps lost': events[own]['stepsLost'], 'enemy steps lost': events[enemy]['stepsLost']}
    return cells


def mean_se(values):
    return statistics.mean(values), statistics.stdev(values) / math.sqrt(len(values))


def branch_means(cells, variant, measure, keep=lambda save: True):
    per = defaultdict(list)
    for (save, at, _), cell in cells.items():
        if keep(save):
            per[(save, at)].append(cell[variant][measure] - cell['v86'][measure])
    return [statistics.mean(values) for values in per.values()], per


print('== Meeting: approachAttack - heuristic@86 by map style (dice averaged per branch)')
meeting = load('meeting')
styles = {'Western Europe': lambda save: 'eastern' not in save, 'Eastern Europe': lambda save: 'eastern' in save}
by_style = {}
for style, keep in styles.items():
    print(f'  {style}')
    for measure in ['VP margin', 'own objectives', 'own attacks', 'enemy steps lost', 'own steps lost']:
        means, _ = branch_means(meeting, 'approach', measure, keep)
        mean, se = mean_se(means)
        if measure == 'VP margin':
            by_style[style] = (mean, se)
        print(f'    {measure:17s} {mean:+.2f} ± {se:.2f}  (n {len(means)})')
(west, west_se), (east, east_se) = by_style['Western Europe'], by_style['Eastern Europe']
print(f'  Eastern - Western VP margin: {east - west:+.2f} ± {math.hypot(west_se, east_se):.2f}')
for name, keep in [('B5 self-play positions (Western, seeds apart from the batch)', lambda save: 'ai-b5-v87' in save),
                   ('independent batch positions, Western', lambda save: 'independent/meeting-western' in save),
                   ('independent batch positions, Eastern', lambda save: 'independent/meeting-eastern' in save)]:
    means, _ = branch_means(meeting, 'approach', 'VP margin', keep)
    mean, se = mean_se(means)
    print(f'  {name}: {mean:+.2f} ± {se:.2f}  (n {len(means)})')

print('== Variance of the heuristic@87 - heuristic@86 VP difference')
for group in ['meeting', 'attacker', 'defender']:
    means, per = branch_means(load(group), 'v87', 'VP margin')
    dice = statistics.mean(statistics.variance(values) for values in per.values() if len(values) == 2)
    between = max(0.0, statistics.variance(means) - dice / 2)
    print(f'  {group:8s} single-dice SD {math.sqrt(dice):.1f}, SD of 2-dice branch means {statistics.stdev(means):.1f}, '
          f'between-branch SD {math.sqrt(between):.1f}; SE with 150 branches x 2 dice {statistics.stdev(means) / math.sqrt(150):.2f}')


def pool(estimates):
    weights = [1 / se ** 2 for _, se in estimates]
    return sum(w * mean for w, (mean, _) in zip(weights, estimates)) / sum(weights), 1 / math.sqrt(sum(weights))


print('== Pooled VP effects a game (inverse-variance; inputs are the recorded results)')
attacker_approach = pool([(2.00, 0.59), (1.11, 1.05)])   # S3.2 (160 branches), S4.7 (28)
defender_cut = pool([(0.85, 0.46), (-0.18, 0.58)])       # S2.3 (239 branches), S4.7 (28)
attacker_all = pool([(1.21, 1.00), (0.90, 1.63), (2.50, 3.33)])   # S4.7, independent batch role split, development batch
defender_all = pool([(1.82, 1.04), (3.60, 1.03), (-1.25, 2.85)])
for name, (mean, se) in [('approachAttack, attacker', attacker_approach), ('defenderCut, defender', defender_cut),
                         ('all four, attacker', attacker_all), ('all four, defender', defender_all)]:
    print(f'  {name:26s} {mean:+.2f} ± {se:.2f}')
parts = ((2.00 + 0.85) / 2, math.hypot(0.59, 0.46) / 2)
whole = ((attacker_all[0] + defender_all[0]) / 2, math.hypot(attacker_all[1], defender_all[1]) / 2)
print(f'  attack pair, from the two registered part tests (S3.2, S2.3): {parts[0]:+.2f} ± {parts[1]:.2f}; '
      f'so 20 attack + 20 meeting pairs with meeting 0: {parts[0] / 2:+.2f} (observed +0.73)')
print(f'  attack pair, from the whole-candidate role estimates: {whole[0]:+.2f} ± {whole[1]:.2f}')

print('== VP gate pass probability (mean - 2.1 SE > 0; positive in each changed engagement)')
random.seed(7)


def as_run(attack, meeting_effect, trials=40000):
    passed = 0
    for _ in range(trials):
        a = [random.gauss(attack, 3.7) for _ in range(20)]
        m = [random.gauss(meeting_effect, 6.1) for _ in range(20)]
        both = a + m
        if statistics.fmean(a) > 0 and statistics.fmean(m) > 0 and statistics.fmean(both) - 2.1 * statistics.stdev(both) / math.sqrt(40) > 0:
            passed += 1
    return passed / trials


def attack_only(effect, sd, trials=40000):
    passed = 0
    for _ in range(trials):
        a = [random.gauss(effect, sd) for _ in range(40)]
        if statistics.fmean(a) - 2.1 * statistics.stdev(a) / math.sqrt(40) > 0:
            passed += 1
    return passed / trials


print('  as run, 20 attack (SD 3.7) + 20 meeting (SD 6.1) pairs:')
for attack, meeting_effect in [(2.25, 0.0), (2.25, -0.8), (1.43, 0.0)]:
    print(f'    attack {attack:+.2f}, meeting {meeting_effect:+.2f}: {as_run(attack, meeting_effect):.2f}')
print('  meeting unchanged, 40 attack pairs:')
for sd in (3.7, 4.5):
    print(f'    SD {sd}: ' + ', '.join(f'true {effect:+.2f} -> {attack_only(effect, sd):.2f}' for effect in (1.0, 1.43, 1.8, 2.25)))
