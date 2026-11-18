"""S10.2: the end-of-game VP that goes with one more step of Kill - Loss in each Game Turn.

    python3 docs/quality/evidence/ai-s10-kill-value-2026-11-18/kill-value.py

Reads artifacts/ai-s10/kill-value/*.jsonl: 100 Western Europe attack branches of S5.2 (50 attacker, 50 defender, Game
Turn 2), heuristic@90 against heuristic@86's weights in the same build, 1 dice, rows at the start of Game Turns 3 to 8
and at the end. For each branch, the two variants' differences: Kill - Loss in each Game Turn (2 to 8, from the
cumulative events) and the VP margin at the end. Least squares of the VP difference on the seven per-turn Kill - Loss
differences, with an intercept, and on early (Game Turns 2-4) and late (5-8) sums.

This is an association between two outcomes of the same divergent games, not the causal value of a kill: a turn whose
fighting goes better also tends to take ground.
"""
import glob
import json
import math
from collections import defaultdict


def ols(xs, ys):
    """Coefficients and standard errors of y on x (an intercept first)."""
    rows = [[1.0, *x] for x in xs]
    k = len(rows[0])
    ata = [[sum(r[a] * r[b] for r in rows) for b in range(k)] for a in range(k)]
    aty = [sum(r[a] * y for r, y in zip(rows, ys)) for a in range(k)]
    inv = [[float(i == j) for j in range(k)] for i in range(k)]
    m = [ata[i][:] + inv[i] for i in range(k)]
    for c in range(k):
        pivot = max(range(c, k), key=lambda r: abs(m[r][c]))
        m[c], m[pivot] = m[pivot], m[c]
        scale = m[c][c]
        m[c] = [v / scale for v in m[c]]
        for r in range(k):
            if r != c:
                f = m[r][c]
                m[r] = [a - f * b for a, b in zip(m[r], m[c])]
    inverse = [row[k:] for row in m]
    beta = [sum(inverse[i][j] * aty[j] for j in range(k)) for i in range(k)]
    residuals = [y - sum(b * v for b, v in zip(beta, r)) for r, y in zip(rows, ys)]
    s2 = sum(e * e for e in residuals) / (len(rows) - k)
    return beta, [math.sqrt(s2 * inverse[i][i]) for i in range(k)]


cells = defaultdict(dict)
for path in glob.glob('artifacts/ai-s10/kill-value/*.jsonl'):
    for row in map(json.loads, open(path)):
        players = list(row['metrics'])
        own = next(p for p in players if p.endswith(row['subject']))
        enemy = next(p for p in players if p != own)
        kill_loss = row['events'][enemy]['stepsLost'] - row['events'][own]['stepsLost']
        vp = row['metrics'][own]['vp'] - row['metrics'][enemy]['vp']
        cells[(row['save'], row['at'], row['dice'])].setdefault(row['variant'], {})[str(row['horizon'])] = (kill_loss, vp)
xs, ys = [], []
for cell in cells.values():
    if set(cell) != {'v90', 'v86w'}:
        continue
    a, b = cell['v90'], cell['v86w']
    marks = ['0', '1', '2', '3', '4', '5', '6', 'end']
    if not all(h in a and h in b for h in marks[1:]):
        continue
    cumulative = [0.0] + [(a[h][0] - b[h][0]) for h in marks[1:]]
    xs.append([cumulative[i + 1] - cumulative[i] for i in range(7)])
    ys.append(a['end'][1] - b['end'][1])
print(f'{len(xs)} branches with every Game Turn')
beta, se = ols(xs, ys)
for turn, (b, s) in enumerate(zip(beta[1:], se[1:]), start=2):
    print(f'  Kill - Loss in Game Turn {turn}: {b:+.3f} ± {s:.3f} VP a step')
beta, se = ols([[sum(x[:3]), sum(x[3:])] for x in xs], ys)
print(f'  Game Turns 2-4: {beta[1]:+.3f} ± {se[1]:.3f}; Game Turns 5-8: {beta[2]:+.3f} ± {se[2]:.3f} VP a step')
