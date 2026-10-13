from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess, sys
root=Path('tmp/ai-match/vp-promotion-2026-10-13').resolve()
group=sys.argv[1]
version=sys.argv[2] if len(sys.argv)>2 else '21'
engine=root/('candidate-v'+version)
baseline=root.parent/'v19-vp-2026-10-13/engine-checkout/dist'
starts={'development':[1230000,1230100,1230200], 'development-v22':[1233000,1233100,1233200], 'development-v23':[1234000,1234100,1234200], 'development-v24':[1235000,1235100], 'development-v25':[1236000,1236100], 'development-v26':[1239000,1239100], 'development-v27':[1242000,1242100], 'development-v28':[1245000,1245100], 'development-v29':[1248000,1248100], 'development-v30':[1254000,1254100], 'development-v32':[1259000,1259100], 'development-v33':[1262000,1262100], 'development-v34':[1265000,1265100], 'development-v35':[1268000,1268100], 'replication-v35-meeting':[1271000,1271100], 'replication-v35-attack':[1272000,1272100], 'validation-v35-meeting':[1269000,1269100], 'validation-v35-attack':[1270000,1270100], 'validation-v34-meeting':[1266000,1266100], 'validation-v34-attack':[1267000,1267100], 'validation-v33-meeting':[1263000,1263100], 'validation-v33-attack':[1264000,1264100], 'validation-v32-meeting':[1260000,1260100], 'validation-v32-attack':[1261000,1261100], 'validation-v31-meeting':[1257000,1257100], 'validation-v31-attack':[1258000,1258100], 'validation-v30-meeting':[1255000,1255100], 'validation-v30-attack':[1256000,1256100], 'validation-meeting':[1231000,1231100], 'validation-attack':[1232000,1232100], 'validation-v26-meeting':[1240000,1240100], 'validation-v26-attack':[1241000,1241100], 'validation-v27-meeting':[1243000,1243100], 'validation-v27-attack':[1244000,1244100], 'validation-v28-meeting':[1246000,1246100], 'validation-v28-attack':[1247000,1247100], 'validation-v29-meeting':[1249000,1249100], 'validation-v29-attack':[1250000,1250100]}[group]
count=64 if group.startswith('replication') else 8 if group.startswith('development') else 16
def run(style,label,start):
    out=root/(group+'-'+label)
    cmd=['node','scripts/ai-match.mjs','--matches',str(count),'--start',str(start),'--parallel','2','--turns','8','--style',style,'--allied','heuristic','--axis','heuristic@'+str(baseline),'--trace','--swap','--out',str(out)]
    if group.endswith('attack'):cmd.extend(['--engagement','AXIS_ATTACKS'])
    with (root/(group+'-'+label+'.log')).open('w') as f:subprocess.run(cmd,cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
    print(group,label,'matches finished',flush=True)
    with (root/(group+'-'+label+'-audit.log')).open('w') as f:subprocess.run(['node','scripts/ai-supply-study.mjs',str(out)],cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
    print(group,label,'audit finished',flush=True)
    if int(version)>=32:
        with (root/(group+'-'+label+'-advance-supply.log')).open('w') as f:subprocess.run(['node',str(root/'audit-advance-supply.mjs'),version,str(out)],cwd=engine,stdout=f,stderr=subprocess.STDOUT,check=True)
        print(group,label,'advance supply audit finished',flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    fs=[pool.submit(run,style,label,start) for (style,label),start in zip([('TEMPERATE_INLAND','temperate'),('EASTERN_EUROPE','eastern')],starts)]
    for f in fs:f.result()
