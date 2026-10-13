from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys
root=Path('tmp/ai-match/v19-vp-2026-10-13').resolve();engine=root/'engine-checkout'
prefix=sys.argv[1]
starts={'development':[1220000,1220100,1220200],'holdout':[1221000,1221100,1221200],'reference-v17':[1222000,1222100,1222200],'attack':[1226000,1226100,1226200]}[prefix]
baseline=root/'baseline-v18' if prefix!='reference-v17' else root.parent/'v18-battles-2026-10-13'/'baseline-v17'
def run(style,label,start):
 out=root/(prefix+'-'+label)
 cmd=['node','scripts/ai-match.mjs','--matches','8','--start',str(start),'--parallel','2','--turns','8','--style',style,'--allied','heuristic','--axis','heuristic@'+str(baseline),'--trace','--swap','--out',str(out)]
 if prefix=='attack':cmd.extend(['--engagement','AXIS_ATTACKS'])
 with (root/(prefix+'-'+label+'.log')).open('w') as f:subprocess.run(cmd,cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
 print(prefix,label,'matches finished',flush=True)
 with (root/(prefix+'-'+label+'-audit.log')).open('w') as f:subprocess.run(['node','scripts/ai-supply-study.mjs',str(out)],cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
 print(prefix,label,'supply audit finished',flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
 futures=[pool.submit(run,style,label,start) for (style,label),start in zip([('TEMPERATE_INLAND','temperate'),('EASTERN_EUROPE','eastern'),('MEDITERRANEAN_COAST','mediterranean')],starts)]
 for f in futures:f.result()
