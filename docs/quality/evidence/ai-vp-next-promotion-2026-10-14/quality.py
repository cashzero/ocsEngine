from pathlib import Path
import subprocess,json,hashlib,re,sys

root=Path('tmp/ai-match/vp-next-2026-10-14').resolve();version=sys.argv[1];engine=root/f'candidate-v{version}'
freeze=json.loads((root/f'v{version}-freeze.json').read_text())
for tree in ['sourceTreeHashes','buildTreeHashes']:
 for f,sha in freeze[tree].items():assert hashlib.sha256((engine/f).read_bytes()).hexdigest()==sha
checks={'build':{'command':f'python3 freeze.py {version} (npm run build)','exitCode':0}}
logname=f'freeze-v{version}.log';logs={logname:hashlib.sha256((root/logname).read_bytes()).hexdigest()}
output=root/f'v{version}-quality.json';assert not output.exists(),'Do not overwrite an existing quality run'
for name,args in [('typecheck',['npm','run','typecheck']),('tests',['npx','vitest','run','--maxWorkers=4']),('smoke',['npm','run','smoke'])]:
 log=root/f'{name}-v{version}-frozen.log';assert not log.exists(),'Preserve earlier logs'
 with log.open('w') as f:result=subprocess.run(args,cwd=engine,stdout=f,stderr=subprocess.STDOUT)
 checks[name]={'command':' '.join(args),'exitCode':result.returncode};logs[log.name]=hashlib.sha256(log.read_bytes()).hexdigest()
 if name=='tests':
  counts=re.search(r'Tests\s+(\d+) passed \| (\d+) skipped',log.read_text())
  if counts:checks[name].update({'passed':int(counts[1]),'skipped':int(counts[2])})
 output.write_text(json.dumps({'candidate':version,'checks':checks,'logs':logs},indent=2)+'\n')
 if result.returncode:raise SystemExit(result.returncode)
print('Frozen quality completed',version)
