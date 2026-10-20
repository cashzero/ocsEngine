import concurrent.futures
import hashlib
import json
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts/ai-progress-dice-reproducibility')
registration = json.loads((root / 'registration.json').read_bytes())
assert registration['stage'] == 'frozen'
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
for case in registration['cases']:
    assert not (root / f'resample/pair-{case["firstMatch"]}').exists(), 'No silent restart or replacement'


def run(case):
    first = case['firstMatch']
    with (root / f'pair-{first}.stdout.log').open('w') as out, (root / f'pair-{first}.stderr.log').open('w') as err:
        process = subprocess.run(['node', 'scripts/ai-progress-dice-run.mjs', '--root', str(root),
                                  '--case', str(first), '--mode', 'resample'], stdout=out, stderr=err)
    print(json.dumps({'completedProcess': first, 'exitCode': process.returncode}), flush=True)
    return first, process.returncode


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(run, registration['cases']))
(root / 'batch.json').write_text(json.dumps(results, indent=2) + '\n')
assert all(code == 0 for _, code in results), results
