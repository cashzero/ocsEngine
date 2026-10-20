"""Paired matches through the candidate engine; raw data is written to artifacts/."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import subprocess
import sys

candidate_path, baseline_path, mode = map(str, sys.argv[1:4])
candidate, baseline = [json.loads(Path(p).read_text()) for p in [candidate_path, baseline_path]]
assert mode in ['development', 'independent']
engine, opponent = Path(candidate['buildDirectory']), Path(baseline['buildDirectory']) / 'dist'
assert candidate['policyVersion'] != baseline['policyVersion'], 'A new policy must contain an actual change'
for frozen in [candidate, baseline]:
    for key in ['sourceHashes', 'buildHashes']:
        for relative, digest in frozen[key].items():
            assert hashlib.sha256((Path(frozen['buildDirectory']) / relative).read_bytes()).hexdigest() == digest
quality = json.loads((engine.with_name(engine.name + '-quality') / 'result.json').read_text())
assert set(quality['checks']) == {'typecheck', 'tests', 'smoke'} and all(c['exitCode'] == 0 for c in quality['checks'].values())
out = engine.with_name(engine.name + '-' + mode)
out.mkdir(exist_ok=False)
groups = [('meeting-western', 'MEETING', 'WESTERN_EUROPE', 1300000), ('meeting-eastern', 'MEETING', 'EASTERN_EUROPE', 1300100),
          ('attack-western', 'AXIS_ATTACKS', 'WESTERN_EUROPE', 1300200), ('attack-eastern', 'AXIS_ATTACKS', 'EASTERN_EUROPE', 1300300)]
registration = json.loads((engine.with_name(engine.name + '-registration.json')).read_text()) if mode == 'independent' else None
if registration:
    assert registration['candidateFreezeSha256'] == hashlib.sha256(Path(candidate_path).read_bytes()).hexdigest()
    assert registration['baselineFreezeSha256'] == hashlib.sha256(Path(baseline_path).read_bytes()).hexdigest()
def run(name, engagement, style, development_start):
    folder = out / name
    count = registration['ranges'][name][1] - registration['ranges'][name][0] + 1 if registration else 8
    start = registration['ranges'][name][0] if registration else development_start
    command = ['node', 'scripts/ai-match.mjs', '--matches', str(count), '--start', str(start), '--parallel', str(max(2, 10 // len(groups))), '--turns', '8',
               '--size', '32x24', '--divisions', '6', '--armored', '2', '--air', 'NONE', '--air-transport', 'NONE',
               '--style', style, '--engagement', engagement, '--allied', 'heuristic', '--axis', 'heuristic@' + str(opponent), '--swap', '--trace', '--out', str(folder)]
    with (out / (name + '-matches.log')).open('w') as log:
        subprocess.run(command, cwd=engine, stdout=log, stderr=subprocess.STDOUT, check=True)
    print(name, 'matches complete', flush=True)
    with (out / (name + '-supply.log')).open('w') as log:
        subprocess.run(['node', 'scripts/ai-supply-study.mjs', str(folder)], cwd=engine, stdout=log, stderr=subprocess.STDOUT, check=True)
    print(name, 'ordinary supply audit complete', flush=True)
    audit = Path(__file__).with_name('audit-advances.mjs')
    with (out / (name + '-advances.log')).open('w') as log:
        subprocess.run(['node', str(audit), str(Path(candidate_path).resolve()), str(folder)], stdout=log, stderr=subprocess.STDOUT, check=True)
    print(name, 'strict advance audit complete', flush=True)
# A registration names the groups it plays (an engagement the candidate left unchanged is not played).
if registration:
    groups = [group for group in groups if group[0] in registration['ranges']]
with ThreadPoolExecutor(max_workers=4) as pool:
    for future in [pool.submit(run, *group) for group in groups]:
        future.result()
