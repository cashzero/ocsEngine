from pathlib import Path
import gzip,json,hashlib,statistics,math,collections,shutil,re,sys
root=Path('tmp/ai-match/vp-next-2026-10-14');dest=Path('docs/quality/evidence/ai-vp-next-promotion-2026-10-14');dest.mkdir(parents=True,exist_ok=True)
runs=[];tables=[];pairs=collections.defaultdict(list)
for group in sorted(root.glob('*-v*-*')):
 if not group.is_dir() or not (group/'summary.json').exists():continue
 summary=json.loads((group/'summary.json').read_text());vp=[0,0];loss=[0,0];wld=[0,0,0];paired={}
 for r in summary['records']:
  c=next(s for s in r['sides'].values() if s['policy']=='heuristic');b=next(s for s in r['sides'].values() if s['policy']!='heuristic')
  vp=[vp[0]+c['vp'],vp[1]+b['vp']];loss=[loss[0]+c['stepsLost'],loss[1]+b['stepsLost']];delta=c['vp']-b['vp'];wld[0 if delta>0 else 1 if delta<0 else 2]+=1
  paired.setdefault(r['match']//2,[]).append(delta)
 for values in paired.values():
  if len(values)!=2:raise ValueError('Incomplete seat pair')
 if group.name.startswith(('meeting-','attack-')):pairs[re.search(r'-v(\d+(?:-main)?)-',group.name)[1]].extend(sum(v)/2 for v in paired.values())
 table={'group':group.name,'games':len(summary['records']),'vp':vp,'delta':vp[0]-vp[1],'stepLosses':loss,'vpHigherLowerEqual':wld};tables.append(table)
 run={'group':group.name,'summary':summary}
 for name in ['supply-attribution.json','advance-supply.json']:
  if (group/name).exists():run[name]=json.loads((group/name).read_text())
 runs.append(run)
result={'status':'IN PROGRESS','baseline':'35','candidate':sys.argv[1] if len(sys.argv)>1 else '51','tables':tables,'independentValidations':{}}
if '-main' in result['candidate']:result.update({'strategyVersion':result['candidate'].split('-')[0],'artifactBatchId':result['candidate'],'sourceCommitBase':json.loads((root/f"v{result['candidate']}-freeze.json").read_text())['sourceCommitBase']})
if result['candidate']=='58':result.update({'candidate':'57','artifactBatchId':'58','currentMainRerun':True})
for version,values in pairs.items():
 validation=[t for t in tables if t['group'].startswith(('meeting-','attack-')) and f'-v{version}-' in t['group']]
 if len(validation)!=4 or sum(t['games'] for t in validation)!=80:continue
 mean=statistics.mean(values);se=statistics.stdev(values)/math.sqrt(len(values));ci=[mean-2.1*se,mean+2.1*se];eng={g:sum(t['delta'] for t in validation if t['group'].startswith(g)) for g in ['meeting','attack']}
 result['independentValidations'][version]={'games':80,'pairs':len(values),'meanVpGain':mean,'standardError':se,'interval':ci,'engagementDelta':eng,'vpGate':all(n>0 for n in eng.values()) and ci[0]>0}
 if version=='58':result['independentValidations'][version].update({'strategyVersion':'57','artifactBatchId':'58','currentMainRerun':True})
if '--promoted' in sys.argv:
 accepted=json.loads((root/f"v{result['candidate']}-acceptance.json").read_text())
 assert accepted['vpGate'] and accepted['verificationScope']=='frozen-and-delivered'
 result.update({'status':'PROMOTED','standardStrategyVersion':accepted.get('strategyVersion',result['candidate']),'acceptanceArtifact':f"v{result['candidate']}-acceptance.json"})
(dest/'results.json').write_text(json.dumps(result,indent=2)+'\n')
(dest/'runs.json.gz').write_bytes(gzip.compress(json.dumps(runs).encode(),compresslevel=9))
manifest={}
def archive(p,target):
 raw=p.read_bytes();target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(gzip.compress(raw,compresslevel=9));manifest[str(target.relative_to(dest))]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
for p in root.glob('*.log'):archive(p,dest/'logs'/(p.name+'.gz'))
for p in root.glob('*.mjs'):shutil.copyfile(p,dest/p.name)
for p in root.glob('*.py'):shutil.copyfile(p,dest/p.name)
for p in root.glob('cases-*.json.gz'):shutil.copyfile(p,dest/p.name)
for p in root.glob('final-advance-*.state.json.gz'):
 shutil.copyfile(p,dest/p.name)
 raw=gzip.decompress(p.read_bytes());manifest[p.name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
for p in root.glob('*-plan.json'):shutil.copyfile(p,dest/p.name)
for suffix in ['freeze','quality','acceptance']:
 for p in root.glob('*-'+suffix+'.json'):shutil.copyfile(p,dest/p.name)
for candidate in sorted(root.glob('candidate-v*')):
 v=candidate.name.removeprefix('candidate-v')
 if int(v.split('-')[0]) > int(sys.argv[1].split('-')[0] if len(sys.argv)>1 else '51'):continue
 for f in ['src/ai/policies/heuristic.ts','src/ai/policies/heuristic-weights.ts','src/ai/analysis.ts','src/ai/decisions.ts','src/rules/query/model.ts','src/rules/query/projection.ts','src/rules/supply/relocation-impact.ts','src/rules/supply/ration-budget.ts']:
  p=candidate/f
  if p.exists():archive(p,dest/'sources'/f'v{v}-{Path(f).name}.gz')
# Retain lossless raw accepted decisions and saves for the independent 80, not cancelled extra games.
for run in runs:
 if not run['group'].startswith(('meeting-','attack-')):continue
 for p in (root/run['group']).glob('*failure.json'):archive(p,dest/'diagnostics'/run['group']/(p.name+'.gz'))
 for p in (root/run['group']).glob('*pre-identity.json'):archive(p,dest/'diagnostics'/run['group']/(p.name+'.gz'))
 for r in run['summary']['records']:
  for suffix in ['save.json','trace.jsonl']:
   p=root/run['group']/f"match-{r['match']}.{suffix}";archive(p,dest/'matches'/run['group']/(p.name+'.gz'))
baseline=root/'standard-v35-main45e'
if baseline.exists():
 for f in (baseline/'src/ai').rglob('*.ts'):archive(f,dest/'sources'/'baseline-v35-main45e'/f.relative_to(baseline/'src/ai').with_suffix('.ts.gz'))
(dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(result['independentValidations'],indent=2))
