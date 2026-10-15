"""Development batch: snapshot the current build as candidate LABEL and play it against the frozen baseline.

usage (repo root, after npm run build): python3 tmp/ai-match/vp-v67/dev.py LABEL PAIRS START [--baseline DIR] [--groups m-t,m-e,a-t,a-e]
Each group plays PAIRS same-seed swapped pairs from match index START. Prints per-group and total VP deltas.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess, sys, json, shutil, statistics, math, os

repo = Path.cwd()
study = Path('/home/cashlin/ocsEngine/artifacts/bot-vp-v67')
args = sys.argv[1:]
label, pairs, start = args[0], int(args[1]), int(args[2])
baseline = study / 'baseline-v66/dist'
groups = ['m-t', 'm-e', 'a-t', 'a-e']
par = 3
if '--baseline' in args: baseline = Path(args[args.index('--baseline') + 1]).resolve()
if '--groups' in args: groups = args[args.index('--groups') + 1].split(',')
if '--par' in args: par = int(args[args.index('--par') + 1])
cand = 'heuristic'
if '--weights' in args: cand = 'heuristic:' + str(Path(args[args.index('--weights') + 1]).resolve())
snap = study / f'cand-{label}'
if '--reuse' not in args:
    if snap.exists(): shutil.rmtree(snap)
    (snap / 'scripts').mkdir(parents=True)
    shutil.copytree(Path(args[args.index('--dist') + 1]) if '--dist' in args else repo / 'dist', snap / 'dist')
    shutil.copy2(repo / 'scripts/ai-match.mjs', snap / 'scripts/ai-match.mjs')
    shutil.copy2(repo / 'package.json', snap / 'package.json')
    (snap / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
styles = {'t': 'TEMPERATE_INLAND', 'e': 'EASTERN_EUROPE'}
engagements = {'m': 'MEETING', 'a': 'AXIS_ATTACKS'}

def run(group):
    e, s = group.split('-')
    out = snap / f'{group}-{start}-{pairs}'
    if out.exists(): shutil.rmtree(out)
    cmd = ['node', 'scripts/ai-match.mjs', '--matches', str(2 * pairs), '--start', str(start), '--parallel', str(par), '--turns', '8',
           '--style', styles[s], '--engagement', engagements[e], '--allied', cand, '--axis', f'heuristic@{baseline}', '--swap', '--air', 'NONE', '--air-transport', 'NONE', '--out', str(out)]
    if '--trace' in args: cmd.append('--trace')
    with (snap / f'{group}-{start}-{pairs}.log').open('w') as f:
        r = subprocess.run(cmd, cwd=snap, stdout=f, stderr=subprocess.STDOUT)
    return group, out, r.returncode

with ThreadPoolExecutor(max_workers=len(groups)) as pool:
    results = list(pool.map(run, groups))
allpairs = []; report = {}
for group, out, code in results:
    d = json.loads((out / 'summary.json').read_text())
    rows = {}; vp = [0, 0]; bad = 0
    for r in d['records']:
        if r['stopReason'] != 'FINISHED' or not (r.get('replay') or {}).get('ok', False) or r.get('errors'):
            bad += 1; continue
        sides = list(r['sides'].values())
        c = next(x for x in sides if not x['policy'].startswith('heuristic@')); b = next(x for x in sides if x['policy'].startswith('heuristic@'))
        rows.setdefault(r['match'] // 2, []).append(c['vp'] - b['vp']); vp[0] += c['vp']; vp[1] += b['vp']
    ps = [sum(v) / 2 for v in rows.values() if len(v) == 2]
    allpairs += ps
    report[group] = {'vp': vp, 'delta': vp[0] - vp[1], 'pairs': len(ps), 'bad': bad, 'exit': code}
    print(f'{group}: VP {vp[0]}-{vp[1]} delta {vp[0]-vp[1]:+d} pairs {len(ps)} bad {bad} exit {code}')
m = statistics.mean(allpairs); se = statistics.stdev(allpairs) / math.sqrt(len(allpairs)) if len(allpairs) > 1 else float('nan')
print(f'TOTAL {label} start {start}: pairs {len(allpairs)} mean {m:+.3f} SE {se:.3f} lower {m-2.1*se:+.3f}')
report['total'] = {'pairs': len(allpairs), 'mean': m, 'se': se, 'pairValues': allpairs}
(snap / f'report-{start}-{pairs}.json').write_text(json.dumps(report, indent=1))
