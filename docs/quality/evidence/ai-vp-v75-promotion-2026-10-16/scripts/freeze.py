"""Freeze the worktree's current build as the independent candidate and register its batch before any game.

usage (from the candidate worktree, after npm run build): python3 freeze.py NAME
Writes <study>/<NAME>/ (runnable snapshot) and <study>/<NAME>-freeze.json. Refuses to overwrite.
"""
from pathlib import Path
import hashlib, json, shutil, subprocess, sys

study = Path('/home/cashlin/ocsEngine/artifacts/bot-vp-v67')
name = sys.argv[1]
repo = Path.cwd()
dst = study / name
manifest = study / f'{name}-freeze.json'
assert not dst.exists() and not manifest.exists(), 'never overwrite a frozen candidate'
(dst / 'scripts').mkdir(parents=True)
shutil.copytree(repo / 'dist', dst / 'dist')
for script in ['ai-match.mjs', 'ai-supply-study.mjs', 'ai-replay-study.mjs']:
    shutil.copy2(repo / 'scripts' / script, dst / 'scripts' / script)
shutil.copy2(repo / 'package.json', dst / 'package.json')
(dst / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
baseline = study / 'baseline-v66'
record = {
    'candidate': name,
    'policyVersion': '75',
    'baseline': 'heuristic@66 (main 716bac9, frozen build)',
    'baselineBuildPath': str(baseline / 'dist'),
    'baselineCommit': (baseline / 'COMMIT').read_text().strip(),
    'sourceCommitBase': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'sourceDiff': subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src'], text=True),
    'settings': '32x24, 6 divisions (2 armored) per side, 8 turns, no air and no air transport (--air NONE --air-transport NONE); TEMPERATE_INLAND and EASTERN_EUROPE; MEETING and AXIS_ATTACKS; same-seed swapped pairs',
    'games': 80,
    'seedRanges': {'meetingTemperate': [6700000, 6700019], 'meetingEastern': [6700100, 6700119],
                   'attackTemperate': [6700200, 6700219], 'attackEastern': [6700300, 6700319]},
    'passConditions': [
        'MEETING VP delta > 0 and AXIS_ATTACKS VP delta > 0',
        '40-pair mean VP gain - 2.1 x SE > 0',
        'every game FINISHED, replay hash ok, 0 rejected actions, no errors',
        'supply audit (ai-supply-study.mjs) violations 0',
        'typecheck, build, tests, smoke pass',
    ],
    'sourceTreeHashes': {str(p.relative_to(repo)): sha(p) for p in sorted((repo / 'src').rglob('*.ts'))},
    'buildTreeHashes': {str(p.relative_to(dst)): sha(p) for p in sorted((dst / 'dist').rglob('*.js'))},
    'baselineBuildHashes': {str(p.relative_to(baseline)): sha(p) for p in sorted((baseline / 'dist').rglob('*.js'))},
}
manifest.write_text(json.dumps(record, indent=1) + '\n')
print('frozen', name, record['sourceCommitBase'], 'manifest sha256', sha(manifest))
