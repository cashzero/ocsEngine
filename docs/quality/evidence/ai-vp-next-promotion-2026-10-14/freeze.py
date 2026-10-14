from pathlib import Path
import subprocess,shutil,sys,json,hashlib
root=Path.cwd(); study=root/'tmp/ai-match/vp-next-2026-10-14'; v=sys.argv[1]; dst=study/f'candidate-v{v}'
paths=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
log=(study/f'freeze-v{v}.log').open('w')
subprocess.run(['git','worktree','add','--detach',str(dst),'HEAD'],stdout=log,stderr=log,check=True)
for rel in paths:
 p=dst/rel; p.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(root/rel,p)
for rel in ['tests/ai/baselines','tests/ai/combat-advance-supply.test.ts','tests/ai/vp-threat.test.ts']:
 p=root/rel; target=dst/rel
 if p.is_dir():shutil.copytree(p,target)
 else:shutil.copy2(p,target)
for p in (root/'tests/ai/fixtures').glob('*.state.json.gz'):
 shutil.copy2(p,dst/'tests/ai/fixtures'/p.name)
(dst/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
subprocess.run(['npm','run','build'],cwd=dst,stdout=log,stderr=log,check=True)
files=[p for p in paths if p.startswith('src/')]+['src/ai/policies/heuristic-weights.ts']
files+=['dist/'+p[4:-3]+'.js' for p in files]
d={'candidate':v,'baseline':'35','sourceCommitBase':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'hashes':{p:hashlib.sha256((dst/p).read_bytes()).hexdigest() for p in files}}
d['sourceTreeHashes']={str(p.relative_to(dst)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (dst/'src').rglob('*.ts')}
d['buildTreeHashes']={str(p.relative_to(dst)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (dst/'dist').rglob('*.js')}
(study/f'v{v}-freeze.json').write_text(json.dumps(d,indent=2)+'\n')
print('frozen',v,d['sourceCommitBase'])
