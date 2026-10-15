"""Run the registered independent batch of a frozen candidate once: python3 indep.py NAME
Plays the four registered groups with traces, audits supply, then evaluates the registered pass conditions.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json, math, statistics, subprocess, sys

study = Path('/home/cashlin/ocsEngine/artifacts/bot-vp-v67')
name = sys.argv[1]
snap = study / name
freeze = json.loads((study / f'{name}-freeze.json').read_text())
groups = {'meetingTemperate': ('MEETING', 'TEMPERATE_INLAND'), 'meetingEastern': ('MEETING', 'EASTERN_EUROPE'),
          'attackTemperate': ('AXIS_ATTACKS', 'TEMPERATE_INLAND'), 'attackEastern': ('AXIS_ATTACKS', 'EASTERN_EUROPE')}

def run(group):
    engagement, style = groups[group]
    start, end = freeze['seedRanges'][group]
    out = snap / group
    assert not out.exists(), 'an independent batch runs once'
    cmd = ['node', 'scripts/ai-match.mjs', '--matches', str(end - start + 1), '--start', str(start), '--parallel', '3', '--turns', '8',
           '--style', style, '--engagement', engagement, '--allied', 'heuristic', '--axis', f"heuristic@{freeze['baselineBuildPath']}",
           '--swap', '--trace', '--air', 'NONE', '--air-transport', 'NONE', '--out', str(out)]
    with (snap / f'{group}.log').open('w') as f:
        code = subprocess.run(cmd, cwd=snap, stdout=f, stderr=subprocess.STDOUT).returncode
    with (snap / f'{group}-supply.log').open('w') as f:
        audit = subprocess.run(['node', 'scripts/ai-supply-study.mjs', str(out)], cwd=snap, stdout=f, stderr=subprocess.STDOUT).returncode
    with (snap / f'{group}-advances.log').open('w') as f:
        audit |= subprocess.run(['node', str(study / 'audit-advances.mjs'), str(snap / 'dist'), str(out), freeze['policyVersion']],
                                cwd=snap, stdout=f, stderr=subprocess.STDOUT).returncode
    return group, code, audit

with ThreadPoolExecutor(max_workers=4) as pool:
    runs = list(pool.map(run, groups))
result = {'candidate': name, 'groups': {}, 'pairs': []}
for group, code, audit in runs:
    d = json.loads((snap / group / 'summary.json').read_text())
    rows, vp, losses, legal = {}, [0, 0], [0, 0], True
    for r in d['records']:
        ok = r['stopReason'] == 'FINISHED' and (r.get('replay') or {}).get('ok') and r['rejected'] == 0 and not r['errors']
        legal = legal and bool(ok)
        sides = list(r['sides'].values())
        c = next(x for x in sides if x['policy'] == 'heuristic'); b = next(x for x in sides if x['policy'] != 'heuristic')
        rows.setdefault(r['match'] // 2, []).append(c['vp'] - b['vp'])
        vp[0] += c['vp']; vp[1] += b['vp']; losses[0] += c['stepsLost']; losses[1] += b['stepsLost']
    pairs = [sum(v) / 2 for v in rows.values() if len(v) == 2]
    violations = 0
    for row in json.loads((snap / group / 'supply-attribution.json').read_text()):
        violations += len(row['previewMismatches']) + len(row['otherUnitTraceBreaks']) + len(row['relocationTraceBreaks']) + len(row['feedBreaks'])
        violations += sum(1 for a in row['rationSpending'] if not a['preserved'])
    advances = json.loads((snap / group / 'advance-supply.json').read_text())
    advanceViolations = sum(len(row.get('previewViolations', [])) for row in advances)
    cand_adv = [a for row in advances for a in row['advances'] if a['candidate']]
    cand_ovr = [a for row in advances for a in row['overruns'] if a['candidate']]
    result['pairs'] += pairs
    result['groups'][group] = {'games': len(d['records']), 'vp': vp, 'delta': vp[0] - vp[1], 'stepLosses': losses,
                               'allLegalComplete': legal and code == 0, 'auditExit': audit,
                               'supplyGuardViolations': violations, 'advanceConservativeBoundViolations': advanceViolations,
                               'candidateAdvances': len(cand_adv), 'candidateFundedAdvances': sum(1 for a in cand_adv if a['funded']),
                               'candidateSuccessfulOverruns': len(cand_ovr), 'candidateActuallyFundedOverruns': sum(1 for a in cand_ovr if a['actualFunded'])}
    print(group, result['groups'][group], flush=True)
p = result['pairs']
mean = statistics.mean(p); se = statistics.stdev(p) / math.sqrt(len(p))
g = result['groups']
result.update({'meanVpGain': mean, 'standardError': se, 'interval': [mean - 2.1 * se, mean + 2.1 * se],
               'meetingDelta': g['meetingTemperate']['delta'] + g['meetingEastern']['delta'],
               'attackDelta': g['attackTemperate']['delta'] + g['attackEastern']['delta']})
result['vpGate'] = result['meetingDelta'] > 0 and result['attackDelta'] > 0 and mean - 2.1 * se > 0
result['allLegalComplete'] = all(x['allLegalComplete'] for x in g.values())
result['auditsClean'] = all(x['auditExit'] == 0 and x['supplyGuardViolations'] == 0 and x['advanceConservativeBoundViolations'] == 0 for x in g.values())
(study / f'{name}-result.json').write_text(json.dumps(result, indent=1) + '\n')
print('TOTAL', len(p), 'pairs mean', round(mean, 3), 'SE', round(se, 3), 'interval', [round(x, 3) for x in result['interval']],
      'meeting', result['meetingDelta'], 'attack', result['attackDelta'], 'vpGate', result['vpGate'], 'legal', result['allLegalComplete'], 'audits', result['auditsClean'])
