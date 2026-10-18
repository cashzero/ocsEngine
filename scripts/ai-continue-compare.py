"""Compare policy variants of ai-continue.mjs runs: paired differences per metric and horizon (docs/ai/evaluation.md).

    python3 scripts/ai-continue-compare.py <branch-*.jsonl …> --baseline <variant> [--out <file.json>]

Rows of every other variant are paired with the baseline's on the same save, branch action, dice seed and horizon. For
each metric of the subject side ("own"), of its opponent ("enemy") and their differences ("margin"), and for the events
since the branch (kills are the opponent's steps lost):
- mean paired difference, its standard error over branch points (dice seeds of one branch averaged first: they share the
  position, so they are not independent), and mean / SE;
- at the early horizons, the correlation between a metric's paired difference and the paired difference of the final
  VP margin ("end"), over branch points: whether the metric moves early in the direction the game ends up.
"""
import json
import math
import statistics
import sys
from collections import defaultdict

args = sys.argv[1:]
baseline = args[args.index('--baseline') + 1]
out = args[args.index('--out') + 1] if '--out' in args else None
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
    for horizon in horizons:
        print(f'== {variant} − {baseline}, horizon {horizon}')
        for metric, e in sorted(report[variant][horizon].items(), key=lambda kv: -abs(kv[1]['t']) if math.isfinite(kv[1]['t']) else 0):
            corr = f"  r(end VP) {e['corrWithEndVpMargin']:+.2f}" if 'corrWithEndVpMargin' in e else ''
            print(f"  {metric:28s} {e['mean']:+8.2f} ± {e['se']:5.2f}  t {e['t']:+6.2f}  n {e['n']}{corr}")
if out:
    json.dump({'baseline': baseline, 'files': files, 'report': report}, open(out, 'w'), indent=1)
