"""Verify a complete registered batch, then calculate paired VP gain once."""
from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import json
import math
import statistics
import subprocess
import sys

candidate_file, baseline_file, mode = [Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]]
assert mode in ['development', 'independent']
candidate, baseline = [json.loads(p.read_text()) for p in [candidate_file, baseline_file]]
build = Path(candidate['buildDirectory'])
directory = build.with_name(build.name + '-' + mode)
registration = json.loads(build.with_name(build.name + '-registration.json').read_text()) if mode == 'independent' else None
for frozen in [candidate, baseline]:
    for key in ['sourceHashes', 'testHashes', 'buildHashes']:
        for name, digest in frozen[key].items():
            assert hashlib.sha256((Path(frozen['buildDirectory']) / name).read_bytes()).hexdigest() == digest, name
quality = json.loads((build.with_name(build.name + '-quality') / 'result.json').read_text())
assert quality['freezeSha256'] == hashlib.sha256(candidate_file.read_bytes()).hexdigest()
assert set(quality['checks']) == {'typecheck', 'tests', 'smoke'}
assert quality['checks']['tests'].get('passed', 0) >= 743
for check in quality['checks'].values():
    assert check['exitCode'] == 0
    assert hashlib.sha256(Path(check['log']).read_bytes()).hexdigest() == check['sha256']
if '--delivered' in sys.argv:
    root = Path(__file__).resolve().parents[2]
    for key in ['sourceHashes', 'buildHashes']:
        for name, digest in candidate[key].items():
            assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == candidate['sourceCommit']
if registration:
    assert registration['candidateFreezeSha256'] == hashlib.sha256(candidate_file.read_bytes()).hexdigest()
    assert registration['baselineFreezeSha256'] == hashlib.sha256(baseline_file.read_bytes()).hexdigest()
groups = [('meeting-temperate', 'MEETING', 'TEMPERATE_INLAND', 1300000), ('meeting-eastern', 'MEETING', 'EASTERN_EUROPE', 1300100),
          ('attack-temperate', 'AXIS_ATTACKS', 'TEMPERATE_INLAND', 1300200), ('attack-eastern', 'AXIS_ATTACKS', 'EASTERN_EUROPE', 1300300)]
# A registration names the groups it plays; one whose development batch left an engagement unchanged plays only the others.
if registration:
    groups = [group for group in groups if group[0] in registration['ranges']]
# Paired measures, each as the candidate's game value minus the standard's: VP margin, steps killed minus steps lost
# (Kill − Loss: in a head-to-head game one side's kills are the other's losses, so Kill and Loss are not separable here),
# and units the opponent ends out of supply minus the candidate's.
METRICS = {'vp': lambda ours, other: ours['vp'] - other['vp'],
           'killLoss': lambda ours, other: ours['stepsKilled'] - other['stepsKilled'],
           'supply': lambda ours, other: other['outOfSupply'] - ours['outOfSupply']}
tables, pair_means, totals, engagements = [], defaultdict(lambda: defaultdict(list)), Counter(), Counter()
unchanged = defaultdict(lambda: True)
for engagement in (registration or {}).get('unchangedEngagements', []):
    unchanged[engagement] = True
for name, engagement, style, development_start in groups:
    folder = directory / name
    summary = json.loads((folder / 'summary.json').read_text())
    rows = summary['records']
    count = registration['ranges'][name][1] - registration['ranges'][name][0] + 1 if registration else 8
    start = registration['ranges'][name][0] if registration else development_start
    assert len(rows) == count and sorted(r['match'] for r in rows) == list(range(start, start + count))
    pairs, owners, inputs, scores, hashes = defaultdict(list), {}, defaultdict(list), Counter(), defaultdict(set)
    for row in rows:
        assert row['stopReason'] == 'FINISHED' and not row['errors'] and row['rejected'] == 0 and row['replay']['ok']
        assert row['reached'] == {'gameTurn': 8, 'phase': 'COMPLETE'}
        assert row['summary']['mapStyle'] == style and row['summary']['engagement'] == engagement and row['summary']['turnLimit'] == 8
        seat, ours = next((seat, side) for seat, side in row['sides'].items() if side['policy'] == 'heuristic')
        other = next(side for side in row['sides'].values() if side['policy'] != 'heuristic')
        assert other['policy'] == 'heuristic@' + str(Path(baseline['buildDirectory']) / 'dist')
        owners[row['match']] = 'player:' + seat
        inputs[row['match'] // 2].append((seat, {key: row['seeds'][key] for key in ['map', 'oob', 'deployment', 'rules']}))
        hashes[row['match'] // 2].add(row['finalStateHash'])
        delta = ours['vp'] - other['vp']
        pairs[row['match'] // 2].append({metric: measure(ours, other) for metric, measure in METRICS.items()})
        scores['candidateVP'] += ours['vp']
        scores['baselineVP'] += other['vp']
        scores['delta'] += delta
        for label, side in [('candidate', ours), ('baseline', other)]:
            totals[label + 'VP'] += side['vp']
            totals[label + 'StepsKilled'] += side['stepsKilled']
            totals[label + 'StepsLost'] += side['stepsLost']
    for pair, deltas in pairs.items():
        assert len(deltas) == 2
        seats = inputs[pair]
        assert seats[0][0] != seats[1][0] and seats[0][1] == seats[1][1]
        for metric in METRICS:
            pair_means[engagement][metric].append(sum(delta[metric] for delta in deltas) / 2)
        # Both seats ending in the same state means the candidate played the standard's game in this pair.
        unchanged[engagement] &= len(hashes[pair]) == 1
    supply = json.loads((folder / 'supply-attribution.json').read_text())
    advances = json.loads((folder / 'advance-supply.json').read_text())
    assert len(supply) == len(advances) == count
    assert {r['match'] for r in supply} == {r['match'] for r in advances} == set(owners)
    for row in supply:
        assert all(not row[key] for key in ['previewMismatches', 'otherUnitTraceBreaks', 'relocationTraceBreaks', 'feedBreaks'])
        assert all(a['preserved'] for a in row['rationSpending'])
    for row in advances:
        assert row['candidateOwner'] == owners[row['match']] and row['candidateActions'] > 0 and not row['previewViolations']
        for advance in row['advances']:
            assert advance['candidate'] == (advance['action']['actorId'] == owners[row['match']])
            if advance['candidate']:
                totals['candidateAdvances'] += 1
                totals['candidateFundedAdvances'] += advance['funded']
                if not advance['funded']:
                    assert advance['turn'] == 8 and advance['phase'] in ['COMBAT', 'EXPLOITATION']
        for overrun in row['overruns']:
            assert overrun['candidate'] == (overrun['action']['actorId'] == owners[row['match']])
            if overrun['candidate']:
                totals['candidateSuccessfulOverruns'] += 1
                totals['candidateActuallyFundedOverruns'] += overrun['actualFunded']
                assert overrun['predictedFunded'] or (overrun['turn'] == 8 and overrun['phase'] == 'EXPLOITATION')
    engagements[engagement] += scores['delta']
    tables.append({'group': name, 'games': count, **dict(scores), 'legalReplayAndSupply': True})
# User decision 2026-10-17: only engagements the candidate changes are judged. An engagement is unchanged when both games of
# every pair end in the same state; its pairs are 0 by construction and are left out of the interval.
changed = [engagement for engagement in engagements if not unchanged[engagement]]
def paired(metric):
    judged = [value for engagement in changed for value in pair_means[engagement][metric]]
    mean = statistics.mean(judged) if len(judged) > 1 else 0.0
    se = statistics.stdev(judged) / math.sqrt(len(judged)) if len(judged) > 1 else math.inf
    return {'pairs': len(judged), 'mean': mean, 'standardError': se, 'interval': [mean - 2.1 * se, mean + 2.1 * se],
            'engagementPairMeans': {engagement: statistics.mean(pair_means[engagement][metric]) for engagement in changed}}
metrics = {metric: paired(metric) for metric in METRICS}
# User decision 2026-10-17/18 (docs/ai/evaluation.md): the registered primary measure improves in every changed engagement
# and over their pairs (lower bound > 0); every other measure stays within its registered non-inferiority margin.
gate = (registration or {}).get('gate', {})
primary = gate.get('primary', 'vp')
margins = gate.get('nonInferiorityMargins', {})
checks = {f'primary {primary}': len(changed) > 0 and all(metrics[primary]['engagementPairMeans'][engagement] > 0 for engagement in changed)
          and metrics[primary]['interval'][0] > 0}
for metric, margin in margins.items():
    checks[f'{metric} not worse than -{margin}'] = metrics[metric]['interval'][0] > -margin
result = {'strategyVersion': candidate['policyVersion'], 'baselineVersion': baseline['policyVersion'], 'sourceCommit': candidate['sourceCommit'],
          'mode': mode, 'groups': tables, 'totals': dict(totals), 'engagementDeltas': dict(engagements),
          'unchangedEngagements': sorted({engagement for engagement in [*engagements, *(registration or {}).get('unchangedEngagements', [])] if unchanged[engagement]}),
          'metrics': metrics, 'pairs': metrics['vp']['pairs'], 'mean': metrics['vp']['mean'], 'standardError': metrics['vp']['standardError'],
          'interval': metrics['vp']['interval'], 'gateChecks': checks, 'gate': all(checks.values()),
          'vpGate': len(changed) > 0 and all(engagements[engagement] > 0 for engagement in changed) and metrics['vp']['interval'][0] > 0,
          'verificationScope': 'frozen-and-delivered' if '--delivered' in sys.argv else 'frozen-only', 'quality': quality['checks']}
output = directory / 'acceptance.json'
assert not output.exists(), 'Preserve prior verification; use a new batch for a new result'
output.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
