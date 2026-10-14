from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,sys,json
root=Path('tmp/ai-match/vp-next-2026-10-14').resolve()
version=sys.argv[1]; group=sys.argv[2]
engine=root/('candidate-v'+version)
freeze=json.loads((root/f'v{version}-freeze.json').read_text())
baseline=Path(freeze.get('baselineBuildPath', str(root.parent/'vp-promotion-2026-10-13/candidate-v35/dist')))
count=8 if group.startswith('development') else 20
if group.startswith('development'):starts=[1280200,1280300] if group=='development-attack' else [1280000,1280100]
else:
 freeze=json.loads((root/f'v{version}-freeze.json').read_text());prefix='meeting' if group=='meeting' else 'attack'
 starts=[freeze['seedRanges'][prefix+style][0] for style in ['Temperate','Eastern']]
def run(style,label,start):
 out=root/(f'{group}-v{version}-{label}')
 cmd=['node','scripts/ai-match.mjs','--matches',str(count),'--start',str(start),'--parallel','2','--turns','8','--style',style,'--allied','heuristic','--axis','heuristic@'+str(baseline),'--trace','--swap','--out',str(out)]
 if group in ['attack','development-attack']:cmd.extend(['--engagement','AXIS_ATTACKS'])
 with (root/(out.name+'.log')).open('w') as f:subprocess.run(cmd,cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
 print(out.name,'matches complete',flush=True)
 with (root/(out.name+'-supply.log')).open('w') as f:subprocess.run(['node','scripts/ai-supply-study.mjs',str(out)],cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
 print(out.name,'supply audit complete',flush=True)
with ThreadPoolExecutor(max_workers=2) as pool:
 fs=[pool.submit(run,style,label,start) for (style,label),start in zip([('TEMPERATE_INLAND','temperate'),('EASTERN_EUROPE','eastern')],starts)]
 for f in fs:f.result()
