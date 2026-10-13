from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys
root=Path('tmp/ai-match/vp-promotion-2026-10-13').resolve();engine=root/'candidate-v29'
baseline=root.parent/'v19-vp-2026-10-13/engine-checkout/dist'
def run(name):
    for style,label,start in [('TEMPERATE_INLAND','temperate',1251000),('EASTERN_EUROPE','eastern',1251100)]:
        out=root/'weight-search'/(name+'-'+label)
        cmd=['node','scripts/ai-match.mjs','--matches','8','--start',str(start),'--parallel','2','--turns','8','--style',style,
             '--allied','heuristic:'+str(root/'weight-search'/(name+'.json')),'--axis','heuristic@'+str(baseline),'--trace','--swap','--out',str(out)]
        with (root/'weight-search'/(name+'-'+label+'.log')).open('w') as f:subprocess.run(cmd,cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
        print(name,label,'finished',flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    futures=[pool.submit(run,name) for name in (sys.argv[1:] or ['defence','capture','balanced','concentrated'])]
    for f in futures:f.result()
