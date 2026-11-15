"""Compare policy variants of ai-continue.mjs runs: paired differences per metric and horizon (docs/ai/evaluation.md).

    python3 scripts/ai-continue-compare.py <branch-*.jsonl …> --baseline <variant> [--out <file.json>]
        [--cluster-by-map] [--by-style] [--by-role] [--metrics margin.vp,margin.objectives]

Rows of every other variant are paired with the baseline's on the same save, branch action, dice seed and horizon. For
each metric of the subject side ("own"), of its opponent ("enemy") and their differences ("margin"), and for the events
since the branch (kills are the opponent's steps lost):
- mean paired difference, its standard error over branch points (dice seeds of one branch averaged first: they share the
  position, so they are not independent), and mean / SE;
- at the early horizons, the correlation between a metric's paired difference and the paired difference of the final
  VP margin ("end"), over branch points: whether the metric moves early in the direction the game ends up.

Grouped report (any of the options below; the scenario of each save is read from the save):
- --by-style and --by-role split the branch points into cells by map style (western_europe, eastern_europe, …) and by the
  subject's role (attacker or defender of an attack engagement, or meeting). Each cell, each style (its cells weighted
  equally) and all cells weighted equally are reported; with both options the last is the mean of the style × role cells.
- --cluster-by-map takes a map (the scenario's map, OOB and deployment seeds) as the unit of the SE instead of a branch
  point: branch points from one map (the two games of a seed, the same seed in other batches) are not independent.
  The SE of an equally weighted mean of cells is the cluster-robust one, Var = G / (G - 1) * sum over clusters of the
  squared sum of each branch's (value - its cell mean) / (cells * branches in its cell); with one branch a cluster and one
  cell it is the usual SD / sqrt(n).
- Each cell also reports how many branch points end differently from the baseline in any end-of-game measure.
- --metrics limits the grouped report to the named measures.
"""
import json
import math
import re
import statistics
import sys
from collections import defaultdict

args = sys.argv[1:]
baseline = args[args.index('--baseline') + 1]
out = args[args.index('--out') + 1] if '--out' in args else None
cluster_by_map = '--cluster-by-map' in args
by_style = '--by-style' in args
by_role = '--by-role' in args
grouped = cluster_by_map or by_style or by_role
metric_filter = args[args.index('--metrics') + 1].split(',') if '--metrics' in args else None
files = [a for i, a in enumerate(args) if a.endswith('.jsonl')]
rows = [json.loads(line) for path in files for line in open(path) if line.strip()]

def features(row):
    side = row['subject']
    players = list(row['metrics'])
    own_id = next(p for p in players if p.endswith(side))
    enemy_id = next(p for p in players if p != own_id)
    own, enemy = row['metrics'][own_id], row['metrics'][enemy_id]
    ev_own, ev_enemy = row['events'][own_id], row['events'][enemy_id]
    f = {}
    for key, value in own.items():
        if value is not None: f[f'own.{key}'] = value
    for key, value in enemy.items():
        if value is not None: f[f'enemy.{key}'] = value
    for key in ('vp', 'steps', 'units', 'objectives', 'outOfTrace', 'dg', 'spOnMap', 'spFront'):
        f[f'margin.{key}'] = own[key] - enemy[key]
    f['kill'] = ev_enemy['stepsLost']
    f['loss'] = ev_own['stepsLost']
    f['margin.killLoss'] = ev_enemy['stepsLost'] - ev_own['stepsLost']
    for key in ('spSpent', 'attacks', 'barrages'):
        f[f'own.{key}'] = ev_own[key]
        f[f'enemy.{key}'] = ev_enemy[key]
    return f

by = defaultdict(dict)
for row in rows:
    by[(row['save'], row['at'], row['dice'], str(row['horizon']))][row['variant']] = features(row)

variants = sorted({row['variant'] for row in rows} - {baseline})
horizons = sorted({str(row['horizon']) for row in rows}, key=lambda h: (h == 'end', h))
report = {}
for variant in variants:
    report[variant] = {}
    # Paired differences per branch point (dice averaged) and horizon.
    diffs = defaultdict(lambda: defaultdict(list))  # horizon -> metric -> {branch: [diff per dice]}
    per_branch = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for (save, at, dice, horizon), cell in by.items():
        if baseline not in cell or variant not in cell: continue
        a, b = cell[baseline], cell[variant]
        for metric in set(a) & set(b):
            per_branch[horizon][metric][(save, at)].append(b[metric] - a[metric])
    end_vp = {branch: statistics.mean(values) for branch, values in per_branch['end']['margin.vp'].items()}
    for horizon in horizons:
        report[variant][horizon] = {}
        for metric, branches in sorted(per_branch[horizon].items()):
            values = {branch: statistics.mean(v) for branch, v in branches.items()}
            xs = list(values.values())
            if len(xs) < 2: continue
            mean = statistics.mean(xs)
            se = statistics.stdev(xs) / math.sqrt(len(xs))
            entry = {'n': len(xs), 'mean': mean, 'se': se, 't': mean / se if se > 0 else (0.0 if mean == 0 else math.inf)}
            common = [branch for branch in values if branch in end_vp]
            if horizon != 'end' and len(common) > 2:
                x = [values[branch] for branch in common]; y = [end_vp[branch] for branch in common]
                if statistics.pstdev(x) > 0 and statistics.pstdev(y) > 0:
                    entry['corrWithEndVpMargin'] = statistics.correlation(x, y)
            report[variant][horizon][metric] = entry
    for horizon in horizons if not grouped else []:
        print(f'== {variant} − {baseline}, horizon {horizon}')
        for metric, e in sorted(report[variant][horizon].items(), key=lambda kv: -abs(kv[1]['t']) if math.isfinite(kv[1]['t']) else 0):
            corr = f"  r(end VP) {e['corrWithEndVpMargin']:+.2f}" if 'corrWithEndVpMargin' in e else ''
            print(f"  {metric:28s} {e['mean']:+8.2f} ± {e['se']:5.2f}  t {e['t']:+6.2f}  n {e['n']}{corr}")

scenarios = {}


def scenario(save):
    """Map style, map (its three generator seeds) and engagement of a save's scenario."""
    if save not in scenarios:
        snapshot = json.load(open(save))['initialSnapshot']
        parts = re.search(r'"id":"(scenario:generated:[^"]+)"', snapshot).group(1).split(':')
        scenarios[save] = {'style': parts[2], 'map': ':'.join(parts[2:6]), 'engagement': parts[6] if len(parts) > 6 else 'meeting'}
    return scenarios[save]


def role(save, subject):
    engagement = scenario(save)['engagement']
    if engagement == 'meeting':
        return 'meeting'
    return 'attacker' if engagement == f'{subject}-attacks' else 'defender'


def combine(values, cell_of, cluster_of):
    """Equally weighted mean of the cells' means, its SE over clusters, branch points and clusters."""
    cells = defaultdict(list)
    for branch in values:
        cells[cell_of(branch)].append(branch)
    means = {cell: statistics.mean(values[branch] for branch in branches) for cell, branches in cells.items()}
    estimate = sum(means.values()) / len(cells)
    influence = defaultdict(float)
    for cell, branches in cells.items():
        for branch in branches:
            influence[cluster_of(branch)] += (values[branch] - means[cell]) / (len(cells) * len(branches))
    clusters = len(influence)
    se = math.sqrt(sum(value * value for value in influence.values()) * clusters / (clusters - 1)) if clusters > 1 else math.nan
    return {'n': len(values), 'clusters': clusters, 'mean': estimate, 'se': se, 't': estimate / se if se > 0 else math.nan}


if grouped:
    subject_of = {(row['save'], row['at']): row['subject'] for row in rows}
    def style_of(branch): return scenario(branch[0])['style']
    def role_of(branch): return role(branch[0], subject_of[branch])
    def cell_of(branch): return (style_of(branch) if by_style else 'all', role_of(branch) if by_role else 'all')
    def cluster_of(branch): return scenario(branch[0])['map'] if cluster_by_map else branch
    def cell_name(cell): return ' '.join(part for part in cell if part != 'all') or 'all'
    grouped_report = {}
    for variant in variants:
        grouped_report[variant] = {}
        per_branch = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
        changed = defaultdict(bool)
        for (save, at, dice, horizon), cell in by.items():
            if baseline not in cell or variant not in cell: continue
            a, b = cell[baseline], cell[variant]
            for metric in set(a) & set(b):
                per_branch[horizon][metric][(save, at)].append(b[metric] - a[metric])
            if horizon == 'end':
                changed[(save, at)] |= a != b
        for horizon in horizons:
            grouped_report[variant][horizon] = {}
            print(f'== {variant} − {baseline}, horizon {horizon}; SE over {"maps" if cluster_by_map else "branch points"}')
            for metric in metric_filter or sorted(per_branch[horizon]):
                values = {branch: statistics.mean(v) for branch, v in per_branch[horizon][metric].items()}
                if len(values) < 2: continue
                cells = sorted({cell_of(branch) for branch in values})
                strata = {cell_name(cell): (lambda branch, cell=cell: cell_of(branch) == cell) for cell in cells}
                if by_style and by_role:
                    for style in sorted({cell[0] for cell in cells}):
                        strata[f'{style}, roles equally'] = lambda branch, style=style: style_of(branch) == style
                if len(cells) > 1:
                    strata['all cells equally'] = lambda branch: True
                entries = {}
                print(f'  {metric}')
                for name, keep in strata.items():
                    kept = {branch: value for branch, value in values.items() if keep(branch)}
                    if len(kept) < 2: continue
                    entry = combine(kept, cell_of, cluster_of)
                    entry['changed'] = sum(changed[branch] for branch in kept)
                    entries[name] = entry
                    print(f"    {name:38s} {entry['mean']:+8.2f} ± {entry['se']:5.2f}  t {entry['t']:+6.2f}  "
                          f"n {entry['n']} ({entry['clusters']} {'maps' if cluster_by_map else 'branches'}), changed {entry['changed']}")
                grouped_report[variant][horizon][metric] = entries
    report = {'pooled': report, 'grouped': grouped_report}
if out:
    json.dump({'baseline': baseline, 'files': files, 'report': report}, open(out, 'w'), indent=1)
