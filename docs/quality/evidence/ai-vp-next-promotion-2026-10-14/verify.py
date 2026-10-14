from pathlib import Path
import json,hashlib,re,collections,statistics,math,sys,subprocess
root=Path('tmp/ai-match/vp-next-2026-10-14');version=sys.argv[1];freeze=json.loads((root/f'v{version}-freeze.json').read_text());evidence=[];pairs=[];eng=collections.Counter();totals=collections.Counter()
deliveryHashes={}
if 'baselineBuildPath' in freeze:
 baseline=Path(freeze['baselineBuildPath']).parent
 for key in ['baselineSourceHashes','baselineBuildHashes']:
  for f,sha in freeze[key].items():assert hashlib.sha256((baseline/f).read_bytes()).hexdigest()==sha
def verifyDelivered(f,sha):
 frozen=(root/f'candidate-v{version}'/f).read_bytes();assert hashlib.sha256(frozen).hexdigest()==sha
 if '--frozen-only' in sys.argv:return
 delivered=Path(f).read_bytes()
 if version=='58' and f in ['src/ai/policies/heuristic.ts','dist/ai/policies/heuristic.js']:
  old=b"version: options.label === undefined ? '58' : `58+${options.label}`"
  new=b"version: options.label === undefined ? '57' : `57+${options.label}`"
  assert frozen.count(old)==1 and delivered==frozen.replace(old,new), 'Only the version label may differ'
 else:assert delivered==frozen
 deliveryHashes[f]=hashlib.sha256(delivered).hexdigest()
for g,styles in [('meeting',[('temperate',freeze['seedRanges']['meetingTemperate'][0]),('eastern',freeze['seedRanges']['meetingEastern'][0])]),('attack',[('temperate',freeze['seedRanges']['attackTemperate'][0]),('eastern',freeze['seedRanges']['attackEastern'][0])])]:
 for label,start in styles:
  p=root/f'{g}-v{version}-{label}';d=json.loads((p/'summary.json').read_text());rows=d['records'];assert len(rows)==20 and sorted(r['match'] for r in rows)==list(range(start,start+20))
  byPair=collections.defaultdict(list);pairInputs=collections.defaultdict(list);owners={}
  for r in rows:
   assert r['stopReason']=='FINISHED' and not r['errors'] and r['replay']['ok'] and r['rejected']==0 and r['reached']=={'gameTurn':8,'phase':'COMPLETE'}
   assert r['summary']['mapStyle']=={'temperate':'TEMPERATE_INLAND','eastern':'EASTERN_EUROPE'}[label]
   assert r['summary']['engagement']=={'meeting':'MEETING','attack':'AXIS_ATTACKS'}[g]
   assert r['summary']['turnLimit']==8
   candidateSide=next(k for k,s in r['sides'].items() if s['policy']=='heuristic');owners[r['match']]='player:'+candidateSide
   pairInputs[r['match']//2].append((candidateSide,{k:r['seeds'][k] for k in ['map','oob','deployment','rules']}))
   c=r['sides'][candidateSide];b=next(s for s in r['sides'].values() if s['policy']!='heuristic');delta=c['vp']-b['vp'];byPair[r['match']//2].append(delta);eng[g]+=delta;totals['candidateVP']+=c['vp'];totals['baselineVP']+=b['vp'];totals['candidateStepLosses']+=c['stepsLost'];totals['baselineStepLosses']+=b['stepsLost']
  for key,values in byPair.items():
   assert len(values)==2;pairs.append(sum(values)/2)
   seats=pairInputs[key];assert seats[0][0]!=seats[1][0] and seats[0][1]==seats[1][1], 'Pair must swap candidate side on identical generator/rule seeds'
  supply=json.loads((p/'supply-attribution.json').read_text());advances=json.loads((p/'advance-supply.json').read_text());assert len(supply)==len(advances)==20
  for row in supply:
   assert not row['previewMismatches'];assert not row['otherUnitTraceBreaks'];assert not row['relocationTraceBreaks'];assert not row['feedBreaks']
   assert all(a['preserved'] for a in row['rationSpending'])
  for row in advances:
   if 'strategyVersion' in freeze:
    assert row.get('candidateActions',0)>0 and row.get('candidateOwner')==owners[row['match']], 'Candidate identity must be audited'
    assert all(a['candidate']==(a['action']['actorId']==owners[row['match']]) for a in row['advances']+row['overruns']), 'Audit candidate flags must match actual actor'
   assert not row.get('previewViolations',[])
   for a in row['advances']:
    if a['candidate']:totals['candidateAdvances']+=1;totals['candidateFundedAdvances']+=int(a['funded']);totals['candidateUntracedAdvances']+=int(not a['moverTraced'])
   for a in row['overruns']:
    if a['candidate']:totals['candidateSuccessfulOverruns']+=1;totals['candidateActuallyFundedOverruns']+=int(a['actualFunded'])
  evidence.append({'group':p.name,'games':20,'allLegalComplete':True,'allReplayHashesMatch':True,'supplyGuardViolations':0,'advanceConservativeBoundViolations':0})
if 'strategyVersion' in freeze:assert totals['candidateAdvances']>0, 'Batch has advances: candidate audit cannot be empty'
for f,sha in freeze['hashes'].items():
 verifyDelivered(f,sha)
if '--frozen-only' not in sys.argv:assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==freeze['sourceCommitBase']
for key in ['sourceTreeHashes','buildTreeHashes']:
 for f,sha in freeze.get(key,{}).items():
  verifyDelivered(f,sha)
quality=json.loads((root/f'v{version}-quality.json').read_text());qa=(root/quality['checks']['tests'].get('log',f'tests-v{version}-frozen.log')).read_text();passed=re.search(r'Tests\s+(\d+) passed \| (\d+) skipped',qa);assert passed and ' failed ' not in qa; assert int(passed[1])>=662;assert 'error TS' not in (root/f'typecheck-v{version}-frozen.log').read_text();assert all(c['exitCode']==0 for c in quality['checks'].values());assert all(hashlib.sha256((root/name).read_bytes()).hexdigest()==sha for name,sha in quality['logs'].items())
mean=statistics.mean(pairs);se=statistics.stdev(pairs)/math.sqrt(len(pairs));ci=[mean-2.1*se,mean+2.1*se];gate=all(eng[g]>0 for g in ['meeting','attack']) and ci[0]>0
result={'candidate':version,'baseline':'35','games':80,'pairs':40,'totals':dict(totals),'engagementVpDelta':dict(eng),'meanVpGain':mean,'standardError':se,'interval':ci,'vpGate':gate,'groups':evidence,'quality':{'typecheck':True,'buildHashesMatch':True,'testsPassed':int(passed[1]),'testsSkipped':int(passed[2]),'smoke':True}}
result.update({'sourceCommitBase':freeze['sourceCommitBase'],'verificationScope':'frozen-only' if '--frozen-only' in sys.argv else 'frozen-and-delivered'})
if 'strategyVersion' in freeze:result.update({'strategyVersion':freeze['strategyVersion'],'artifactBatchId':freeze['artifactBatchId'],'baselineSourceCommit':freeze['baselineSourceCommit']})
if version=='58':result.update({'strategyVersion':'57','artifactBatchId':'58','deliveryHashes':deliveryHashes,'versionLabelOnlyDifference':True})
(root/f'v{version}-acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
