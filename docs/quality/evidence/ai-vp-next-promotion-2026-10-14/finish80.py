from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
root=Path('tmp/ai-match/vp-next-2026-10-14').resolve();engine=root/'candidate-v42'
def run(group,label,start):
 out=root/f'{group}-v42-{label}'
 commands=[(['node',str(root/'recover-summary.mjs'),group,label,str(start)],root.parent.parent.parent),(['node','scripts/ai-supply-study.mjs',str(out)],engine),(['node',str(root/'audit-advances.mjs'),'42',str(out)],root.parent.parent.parent)]
 for (command,cwd),name in zip(commands,['recovery','supply','advances']):
  with (root/f'{out.name}-{name}-80.log').open('w') as f:subprocess.run(command,cwd=cwd,stdout=f,stderr=subprocess.STDOUT,check=True)
  print(out.name,name,'complete',flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
 for f in [pool.submit(run,g,l,s) for g,l,s in [('meeting','temperate',1281000),('meeting','eastern',1281100),('attack','temperate',1282000),('attack','eastern',1282100)]]:f.result()
