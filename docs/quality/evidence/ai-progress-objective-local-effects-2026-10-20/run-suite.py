import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path

root = Path('artifacts/ai-progress-objective-original-continuation')
registration = json.loads((root / 'registration.json').read_text())
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
tree = hashlib.sha256()
for path in sorted(Path('dist').rglob('*.js'), key=lambda path: path.relative_to('dist').as_posix()):
    tree.update(path.relative_to('dist').as_posix().encode() + b'\0')
    tree.update(hashlib.sha256(path.read_bytes()).hexdigest().encode() + b'\0')
assert tree.hexdigest() == registration['engineTreeSha256']

def run_case(first, full=False):
    directory = root / f'pair-{first}'
    assert not (directory / 'branch-results.json').exists(), f'Existing case {first}; do not restart a completed run'
    directory.mkdir(exist_ok=True)
    command = ['node', str(root / 'run-case.mjs'), str(first)] + (['--control-full'] if full else [])
    with (directory / 'stdout.log').open('w') as stdout, (directory / 'stderr.log').open('w') as stderr:
        process = subprocess.run(command, stdout=stdout, stderr=stderr)
    assert process.returncode == 0, f'Case {first} exit {process.returncode}; inspect stderr'
    assert not (directory / 'stderr.log').read_text(), f'Case {first} stderr'
    result = json.loads((directory / 'branch-results.json').read_text())
    assert result['preMemoriesEqual'] and result['branches'][1]['finished']
    print(json.dumps({'firstMatch': first, 'finished': True, 'counterfactualActions': result['branches'][1]['acceptedActions']}), flush=True)
    return first

run_case(1800012, full=True)
print('Pilot full factual reproduction and counterfactual finished; starting fourteen remaining cases.', flush=True)
remaining = [first for first in registration['firstMatches'] if first != 1800012]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    futures = [executor.submit(run_case, first) for first in remaining]
    for future in concurrent.futures.as_completed(futures):
        future.result()
for path, digest in registration['files'].items():
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest() == digest, path
subprocess.run(['python3', str(root / 'score.py')], check=True)
