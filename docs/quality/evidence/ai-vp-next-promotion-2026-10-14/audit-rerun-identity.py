from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
root=Path('tmp/ai-match/vp-next-2026-10-14').resolve()
def run(group,style):
 out=root/f'{group}-v66-main-{style}'
 with (root/f'{out.name}-advances-identity-fixed.log').open('w') as log:
  subprocess.run(['node',str(root/'audit-advances.mjs'),'66-main',str(out)],stdout=log,stderr=subprocess.STDOUT,check=True)
 print(out.name,'owner-identified strict audit complete',flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
 for f in [pool.submit(run,g,s) for g in ['meeting','attack'] for s in ['temperate','eastern']]:f.result()
