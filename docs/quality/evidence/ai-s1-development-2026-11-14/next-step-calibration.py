# Are next-step groups worth what the plan says, compared with this-step groups? Reads ai-theater-hq-follow.mjs rows
# (with each group's planned chance) and compares the share held with the mean planned chance, by group step, with a
# bootstrap over maps (the two seat-swapped games of a seed are one map).
import json, glob, random, sys, collections
rows = [json.loads(l) for f in sorted(glob.glob(sys.argv[1])) for l in open(f) if l.strip()]
random.seed(7)
def stats(groups):
    if not groups: return None
    chance = sum(g['chance'] for g in groups) / len(groups)
    held = sum(1 for g in groups if g['held']) / len(groups)
    return chance, held, held / chance if chance else None
def collect(cond):
    out = collections.defaultdict(lambda: {1: [], 2: []})
    for r in rows:
        if not cond(r): continue
        for g in r['groups']:
            if g.get('chance') is None: continue
            if g['turn'] == 1: out[r['match'] // 2][1].append({'chance': g['chance'], 'held': g['heldAtEnd']})
            elif g['turn'] == 2 and g.get('next') is not None:
                out[r['match'] // 2][2].append({'chance': g['chance'], 'held': g['next']['heldAtEnd'], 'converted': g['next']['turn'] == 1, 'dropped': g['next']['turn'] is None})
    return out
for label, cond in [('GT1-3', lambda r: r['gameTurn'] <= 3), ('GT4-7', lambda r: 4 <= r['gameTurn'] <= 7), ('GT1-7', lambda r: r['gameTurn'] <= 7)]:
    by_map = collect(cond)
    all1 = [g for m in by_map.values() for g in m[1]]; all2 = [g for m in by_map.values() for g in m[2]]
    s1, s2 = stats(all1), stats(all2)
    ratios = []
    maps = list(by_map)
    for _ in range(2000):
        sample = [random.choice(maps) for _ in maps]
        a = [g for m in sample for g in by_map[m][1]]; b = [g for m in sample for g in by_map[m][2]]
        x, y = stats(a), stats(b)
        if x and y and x[2] and y[2]: ratios.append(y[2] / x[2])
    ratios.sort()
    k = s2[2] / s1[2] if s1 and s2 else None
    lo, hi = (ratios[int(0.025 * len(ratios))], ratios[int(0.975 * len(ratios))]) if ratios else (None, None)
    conv = sum(g['converted'] for g in all2) / len(all2) if all2 else None
    drop = sum(g['dropped'] for g in all2) / len(all2) if all2 else None
    print(f"{label}: this-step groups {len(all1)} chance {s1[0]:.2f} held {s1[1]:.2f} ratio {s1[2]:.2f} | next-step groups {len(all2)} chance {s2[0]:.2f} held next turn {s2[1]:.2f} ratio {s2[2]:.2f} converted {conv:.2f} dropped {drop:.2f} | next/this ratio {k:.2f} [{lo:.2f}, {hi:.2f}] ({len(maps)} maps)")
