import copy
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

repo = Path.cwd()
relative = Path('artifacts/ai-progress-objective-original-continuation')
root = repo / relative
source = json.loads((root / 'pair-1800000/branch-results.json').read_text())
controls = []
for name in ['wrongCaseIdentity', 'unmatchedVictory', 'falseMemoryEqualityFlag', 'unequalMemoryPayload']:
    changed = copy.deepcopy(source)
    expected = ''
    altered_memory = None
    if name == 'wrongCaseIdentity':
        changed['firstMatch'] += 2
        expected = "assert result['firstMatch'] == first"
    elif name == 'unmatchedVictory':
        changed['branches'][1]['victory']['scores'][0]['points'] += 1
        expected = "assert current['victory'] == branch['victory']"
    elif name == 'falseMemoryEqualityFlag':
        changed['preMemoriesEqual'] = False
        expected = "assert result['preMemoriesEqual'] and result['originalRulesRng']"
    else:
        file = changed['branches'][1]['files']['memory.json']
        memory = json.loads(Path(file['path']).read_text())
        memory['before']['entries'][0][1]['actions'] += 1
        altered_memory = json.dumps(memory).encode()
        file['sha256'] = hashlib.sha256(altered_memory).hexdigest()
        expected = 'assert memories[0] == memories[1]'
    with tempfile.TemporaryDirectory(prefix='progress-objective-scorer-') as temporary:
        workspace = Path(temporary)
        (workspace / 'src').symlink_to(repo / 'src', target_is_directory=True)
        (workspace / 'artifacts').mkdir()
        for directory in ['ai-progress-objective-mechanism', 'ai-progress-objective-30games']:
            (workspace / 'artifacts' / directory).symlink_to(repo / 'artifacts' / directory, target_is_directory=True)
        overlay = workspace / relative
        overlay.mkdir()
        for path in root.iterdir():
            if path.name in ['results.json', 'manifest.json']:
                continue
            if path.name == 'pair-1800000':
                target = overlay / path.name
                target.mkdir()
                for child in path.iterdir():
                    if child.name == 'branch-results.json':
                        (target / child.name).write_text(json.dumps(changed))
                    elif child.name == 'branch-15.memory.json' and altered_memory is not None:
                        (target / child.name).write_bytes(altered_memory)
                    else:
                        (target / child.name).symlink_to(child)
            else:
                (overlay / path.name).symlink_to(path, target_is_directory=path.is_dir())
        result = subprocess.run(['python3', str(root / 'score.py')], cwd=workspace, capture_output=True, text=True)
        assert result.returncode != 0 and expected in result.stderr, (name, result.returncode, result.stderr)
        controls.append({'name': name, 'rejected': True, 'assertion': expected, 'exitCode': result.returncode})
(root / 'scorer-controls.json').write_text(json.dumps({'scope': 'Isolated temporary overlays; authoritative inputs and results unchanged', 'controls': controls}, indent=2) + '\n')
print(json.dumps(controls))
