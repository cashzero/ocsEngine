"""Run full checks against an immutable candidate; never overwrite a previous run."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import time

manifest = Path(sys.argv[1]).resolve()
frozen = json.loads(manifest.read_text())
build = Path(frozen['buildDirectory'])
for key in ['sourceHashes', 'testHashes', 'buildHashes']:
    for relative, digest in frozen[key].items():
        assert hashlib.sha256((build / relative).read_bytes()).hexdigest() == digest, relative
output = build.with_name(build.name + '-quality')
output.mkdir(exist_ok=False)
result = {'policyVersion': frozen['policyVersion'], 'freezeSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(), 'checks': {}}
for name, command in [('typecheck', ['npm', 'run', 'typecheck']), ('tests', ['npx', 'vitest', 'run', '--maxWorkers=2']), ('smoke', ['npm', 'run', 'smoke'])]:
    log = output / (name + '.log')
    started = time.monotonic()
    with log.open('w') as stream:
        completed = subprocess.run(command, cwd=build, stdout=stream, stderr=subprocess.STDOUT)
    check = {'command': command, 'exitCode': completed.returncode, 'seconds': time.monotonic() - started, 'log': str(log), 'sha256': hashlib.sha256(log.read_bytes()).hexdigest()}
    if name == 'tests':
        counts = re.search(r'Tests\s+(\d+) passed \| (\d+) skipped', log.read_text())
        if counts:
            check.update({'passed': int(counts[1]), 'skipped': int(counts[2])})
    result['checks'][name] = check
    (output / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(name, completed.returncode, flush=True)
    if completed.returncode:
        raise SystemExit(completed.returncode)
print('Complete frozen quality passed', frozen['policyVersion'])
