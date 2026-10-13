from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys
root=Path('tmp/ai-match/vp-promotion-2026-10-13').resolve()
def run(name,style):
    d=root/'weight-search'/(name+'-'+style)
    with (root/'weight-search'/(name+'-'+style+'-audit.log')).open('w') as f:
        subprocess.run(['node','scripts/ai-supply-study.mjs',str(d)],cwd=root/'candidate-v29',stdout=f,stderr=subprocess.STDOUT,check=True)
    print(name,style,'audit finished',flush=True)
with ThreadPoolExecutor(max_workers=2) as pool:
    futures=[pool.submit(run,name,style) for name in (sys.argv[1:] or ['defence','capture','balanced','concentrated']) for style in ['temperate','eastern']]
    for f in futures:f.result()
