"""S10.2 from the S5 continuations: end-of-game VP that goes with Kill - Loss in the first Game Turn after the branch and
after it, and the overall ratio per variant.

    python3 docs/quality/evidence/ai-s10-kill-value-2026-11-18/s5-two-segments.py

Reads artifacts/ai-s5/s52{,b,c,d}/*/*.jsonl (S5.2 to S5.4 continuations from Game Turn 2, rows at the start of Game
Turn 3 and at the end). Pairs each variant with heuristic@86 on the same branch and dice.
"""
import glob
import importlib.util
import json
import statistics
from collections import defaultdict

spec = importlib.util.spec_from_file_location('kv', __file__.replace('s5-two-segments.py', 'kill-value.py'))
cells = defaultdict(dict)
for path in glob.glob('artifacts/ai-s5/s52*/*/*.jsonl'):
    for row in map(json.loads, open(path)):
        players = list(row['metrics'])
        own = next(p for p in players if p.endswith(row['subject']))
        enemy = next(p for p in players if p != own)
        cells[(row['save'], row['at'], row['dice'], row['variant'])][str(row['horizon'])] = (
            row['events'][enemy]['stepsLost'] - row['events'][own]['stepsLost'], row['metrics'][own]['vp'] - row['metrics'][enemy]['vp'])


def ols(xs, ys):
    exec(open(__file__.replace('s5-two-segments.py', 'kill-value.py')).read().split('cells = defaultdict')[0], globals())
    return globals()['ols'](xs, ys)


xs, ys, by_variant = [], [], defaultdict(list)
for (save, at, dice, variant), rows in cells.items():
    base = cells.get((save, at, dice, 'v86'))
    if variant == 'v86' or not base or not all(h in rows and h in base for h in ('1', 'end')):
        continue
    early = rows['1'][0] - base['1'][0]
    total = rows['end'][0] - base['end'][0]
    xs.append([early, total - early])
    ys.append(rows['end'][1] - base['end'][1])
    by_variant[variant].append((total, rows['end'][1] - base['end'][1]))
beta, se = ols(xs, ys)
print(f'{len(xs)} pairs: Kill - Loss in Game Turn 2 {beta[1]:+.3f} ± {se[1]:.3f}, in Game Turns 3-8 {beta[2]:+.3f} ± {se[2]:.3f} VP a step')
for variant, pairs in sorted(by_variant.items()):
    b, s = ols([[x] for x, _ in pairs], [y for _, y in pairs])
    print(f'  {variant:9s} n {len(pairs):4d}  mean Kill - Loss {statistics.mean(x for x, _ in pairs):+.2f}  mean VP {statistics.mean(y for _, y in pairs):+.2f}  VP a step {b[1]:+.3f} ± {s[1]:.3f}')
