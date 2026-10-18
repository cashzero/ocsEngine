"""Register a fresh fixed 80 only after complete development and frozen quality.

    python3 register.py <candidate freeze.json> <baseline freeze.json> <start> [--primary vp|killLoss|supply] [--margin metric=value ...]

The primary measure and the non-inferiority margins of the other measures are registered here, before any independent game
(docs/ai/evaluation.md). An engagement the development batch left unchanged (both games of every pair in the same final
state) is not played; its 40 games go to the changed engagement.
"""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess
import sys

candidate_file, baseline_file = [Path(p).resolve() for p in sys.argv[1:3]]
candidate, baseline = [json.loads(p.read_text()) for p in [candidate_file, baseline_file]]
build = Path(candidate['buildDirectory'])
development = json.loads((build.with_name(build.name + '-development') / 'acceptance.json').read_text())
assert development['strategyVersion'] == candidate['policyVersion'] and development['baselineVersion'] == baseline['policyVersion']
assert development['mode'] == 'development' and sum(g['games'] for g in development['groups']) == 32
assert all(g['legalReplayAndSupply'] for g in development['groups'])
quality = json.loads((build.with_name(build.name + '-quality') / 'result.json').read_text())
assert set(quality['checks']) == {'typecheck', 'tests', 'smoke'} and all(c['exitCode'] == 0 for c in quality['checks'].values())
root = Path(__file__).resolve().parents[2]
assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip() == candidate['sourceCommit']
for key in ['sourceHashes', 'buildHashes']:
    for relative, digest in candidate[key].items():
        assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == digest, relative
start = int(sys.argv[3])
assert start % 2 == 0
primary = sys.argv[sys.argv.index('--primary') + 1] if '--primary' in sys.argv else 'vp'
margins = dict(arg.split('=') for index, arg in enumerate(sys.argv) if index > 0 and sys.argv[index - 1] == '--margin')
margins = {metric: float(value) for metric, value in margins.items()}
assert primary in {'vp', 'killLoss', 'supply'} and primary not in margins and set(margins) <= {'vp', 'killLoss', 'supply'}
unchanged = development.get('unchangedEngagements', [])
names = {'MEETING': ['meeting-temperate', 'meeting-eastern'], 'AXIS_ATTACKS': ['attack-temperate', 'attack-eastern']}
played = [name for engagement, group in names.items() if engagement not in unchanged for name in group]
assert played, 'The candidate changes no engagement'
per_group = 80 // len(played)
offsets = {'meeting-temperate': 0, 'meeting-eastern': 100, 'attack-temperate': 200, 'attack-eastern': 300}
ranges = {name: [start + offsets[name], start + offsets[name] + per_group - 1] for name in played}
fresh = {i for first, last in ranges.values() for i in range(first, last + 1)}
for folder in [root / 'artifacts', root / 'tmp/ai-match']:
    if folder.exists():
        for save in folder.rglob('match-*.save.json'):
            match = re.fullmatch(r'match-(\d+)\.save\.json', save.name)
            if match:assert int(match[1]) not in fresh, 'Independent seed was already played: ' + str(save)
# Ledger of played seeds, kept so saves can be deleted to reclaim disk space: one "seed<TAB>folder" line per save.
ledger = root / 'artifacts/ai-promotion/played-seeds.tsv'
if ledger.exists():
    for line in ledger.read_text().splitlines():
        seed, folder = line.split('\t', 1)
        assert int(seed) not in fresh, 'Independent seed was already played: ' + seed + ' in ' + folder
record = {'strategyVersion': candidate['policyVersion'], 'baselineVersion': baseline['policyVersion'], 'sourceCommit': candidate['sourceCommit'],
          'registeredAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'candidateFreezeSha256': hashlib.sha256(candidate_file.read_bytes()).hexdigest(),
          'baselineFreezeSha256': hashlib.sha256(baseline_file.read_bytes()).hexdigest(), 'ranges': ranges,
          'unchangedEngagements': unchanged,
          'gate': {'games': 80, 'pairs': 40, 'turns': 8, 'primary': primary, 'nonInferiorityMargins': margins,
                   'primaryPositiveInEachChangedEngagement': True, 'primaryPairedMeanMinus2Point1SePositive': True,
                   'otherMeasuresPairedMeanMinus2Point1SeAboveMinusMargin': True,
                   'unchangedEngagement': 'both games of every pair end in the same state hash',
                   'allLegalCompleteReplayHashes': True, 'zeroGuardedSupplyAdvanceViolations': True, 'fullFrozenQuality': True}}
output = build.with_name(build.name + '-registration.json')
with output.open('x') as stream:
    json.dump(record, stream, indent=2)
    stream.write('\n')
print(json.dumps(record, indent=2))
