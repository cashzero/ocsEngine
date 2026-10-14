from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,time,sys
version=sys.argv[1]
root=Path('tmp/ai-match/vp-next-2026-10-14').resolve()
def run(group,label):
 out=root/f'{group}-v{version}-{label}'
 while not (out/'supply-attribution.json').exists():time.sleep(5)
 with (root/f'{out.name}-advances.log').open('w') as f:subprocess.run(['node',str(root/'audit-advances.mjs'),version,str(out)],cwd=root.parent.parent.parent,stdout=f,stderr=subprocess.STDOUT,check=True)
 print(out.name,'advance and causal audit complete',flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
 for f in [pool.submit(run,g,l) for g in ['meeting','attack'] for l in ['temperate','eastern']]:f.result()
