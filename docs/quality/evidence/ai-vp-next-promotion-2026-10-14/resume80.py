from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,subprocess,shutil
root=Path('tmp/ai-match/vp-next-2026-10-14').resolve();engine=root/'candidate-v42'
baseline=root.parent/'vp-promotion-2026-10-13/candidate-v35/dist'
jobs=[];kept=[]
for group,starts in [('meeting',[1281000,1281100]),('attack',[1282000,1282100])]:
 for (style,label),start in zip([('TEMPERATE_INLAND','temperate'),('EASTERN_EUROPE','eastern')],starts):
  out=root/f'{group}-v42-{label}';interrupted=out/'interrupted-256-plan';interrupted.mkdir(exist_ok=True)
  for index in range(start,start+20):
   save=out/f'match-{index}.save.json';complete=False
   if save.exists():
    data=json.loads(save.read_text());state=json.loads(data['currentSnapshot']);complete=state['sequence']['phase']=='COMPLETE' and not state['pendingDecision']
   if complete:kept.append(index);continue
   for suffix in ['save.json','trace.jsonl','debug.log']:
    p=out/f'match-{index}.{suffix}'
    if p.exists():shutil.move(str(p),str(interrupted/p.name))
   jobs.append((group,style,out,index))
print('Retained complete games:',len(kept),'Missing games:',len(jobs),flush=True)
(root/'resume80-plan.json').write_text(json.dumps({'retained':kept,'missing':[j[3] for j in jobs]},indent=2)+'\n')
def run(job):
 group,style,out,index=job;resumed=out/f'resumed-{index}';log=root/f'resume-{index}.log'
 cmd=['node','scripts/ai-match.mjs','--matches','1','--start',str(index),'--parallel','1','--turns','8','--style',style,'--allied','heuristic','--axis','heuristic@'+str(baseline),'--trace','--swap','--out',str(resumed)]
 if group=='attack':cmd.extend(['--engagement','AXIS_ATTACKS'])
 with log.open('w') as f:subprocess.run(cmd,cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
 for suffix in ['save.json','trace.jsonl']:shutil.copyfile(resumed/f'match-{index}.{suffix}',out/f'match-{index}.{suffix}')
 print('Resumed',index,'complete',flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
 for f in [pool.submit(run,j) for j in jobs]:f.result()
