import json,sys,statistics,math
from pathlib import Path
pairs=[];total=[0,0];games=0
for arg in sys.argv[1:]:
 d=json.loads(Path(arg).read_text());rows={};vp=[0,0];kill=[0,0];loss=[0,0];wins=[0,0,0]
 for r in d['records']:
  s=list(r['sides'].values());c=next(x for x in s if x['policy']=='heuristic');b=next(x for x in s if x['policy']!='heuristic')
  delta=c['vp']-b['vp'];rows.setdefault(r['match']//2,[]).append(delta)
  vp[0]+=c['vp'];vp[1]+=b['vp'];kill[0]+=c['stepsKilled'];kill[1]+=b['stepsKilled'];loss[0]+=c['stepsLost'];loss[1]+=b['stepsLost'];wins[0 if delta>0 else 1 if delta<0 else 2]+=1
  assert r['stopReason']=='FINISHED' and r['replay']['ok'] and r['rejected']==0 and not r['errors']
 for values in rows.values():
  assert len(values)==2
  pairs.append(sum(values)/2)
 total=[a+b for a,b in zip(total,vp)];games+=len(d['records'])
 print(Path(arg).parent.name,'games',len(d['records']),'VP',vp,'delta',vp[0]-vp[1],'stepLosses',loss,'VP higher/lower/equal',wins)
mean=statistics.mean(pairs);se=statistics.stdev(pairs)/math.sqrt(len(pairs));print('TOTAL',games,total,'mean',mean,'CI',[mean-2.1*se,mean+2.1*se])
