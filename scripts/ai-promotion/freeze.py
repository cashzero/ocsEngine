"""Freeze a policy and its complete common engine; raw builds stay in artifacts/."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('directory')
parser.add_argument('--baseline', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
destination = Path(args.directory).resolve()
assert destination.is_relative_to(root / 'artifacts'), 'Raw builds belong in artifacts/'
assert not destination.exists(), 'Never overwrite a frozen build'
destination.parent.mkdir(parents=True, exist_ok=True)
build_log = destination.with_name(destination.name + '-build.log')
with build_log.open('w') as log:
    subprocess.run(['git', 'worktree', 'add', '--detach', str(destination), 'HEAD'], cwd=root, stdout=log, stderr=log, check=True)
    if not args.baseline:
        changed = subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], cwd=root, text=True).splitlines()
        added = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '--', 'src', 'tests'], cwd=root, text=True).splitlines()
        for relative in changed + added:
            source, target = root / relative, destination / relative
            if source.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
            elif target.exists():
                target.unlink()
    (destination / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    subprocess.run(['npm', 'run', 'build'], cwd=destination, stdout=log, stderr=log, check=True)
policy = (destination / 'src/ai/policies/heuristic.ts').read_text()
version = re.search(r"version: options.label === undefined \? '([^']+)'", policy)[1]
def hashes(folder, pattern):
    return {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest() for p in (destination / folder).rglob(pattern)}
result = {
    'policyVersion': version,
    'baseline': args.baseline,
    'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'buildDirectory': str(destination),
    'sourceHashes': hashes('src', '*.ts'),
    'testHashes': hashes('tests', '*.*'),
    'buildHashes': hashes('dist', '*.js'),
    'buildLog': str(build_log),
    'buildLogSha256': hashlib.sha256(build_log.read_bytes()).hexdigest(),
}
manifest = destination.with_name(destination.name + '-freeze.json')
assert not manifest.exists()
manifest.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'manifest': str(manifest), 'policyVersion': version, 'sourceCommit': result['sourceCommit']}))
