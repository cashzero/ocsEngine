from pathlib import Path
from collections import Counter, defaultdict
import json, gzip, hashlib, statistics, math

root=Path('tmp/ai-match/vp-promotion-2026-10-13')
out=Path('docs/quality/evidence/ai-vp-promotion-2026-10-13')
out.mkdir(parents=True,exist_ok=True)
groups={'development':'21','development-v22':'22','development-v23':'23','development-v24':'24',
        'development-v25':'25','development-v26':'26','development-v27':'27','development-v28':'28','development-v29':'29','development-v30':'30','development-v32':'32','development-v33':'33','development-v34':'34','development-v35':'35',
        'validation-meeting':'24','validation-attack':'24',
        'validation-v26-meeting':'26','validation-v26-attack':'26',
        'validation-v27-meeting':'27','validation-v27-attack':'27','validation-v30-meeting':'30','validation-v30-attack':'30','validation-v31-meeting':'31','validation-v31-attack':'31','validation-v33-meeting':'33','validation-v33-attack':'33','validation-v35-meeting':'35','validation-v35-attack':'35','replication-v35-meeting':'35','replication-v35-attack':'35'}
weight_names=[p.stem for p in sorted((root/'weight-search').glob('*.json'))]
for name in weight_names:groups['weight-'+name]='29+'+name
archive=[];tables={};runs=[];pair_data={}
for group,version in groups.items():
    totals=defaultdict(Counter);pairs=defaultdict(list);local_runs=[];local_archive=[]
    for style in ['temperate','eastern']:
        d=root/'weight-search'/(group.removeprefix('weight-')+'-'+style) if group.startswith('weight-') else root/(group+'-'+style)
        if not (d/'summary.json').exists() or not (d/'supply-attribution.json').exists():break
        summary=json.load(open(d/'summary.json'));audit=json.load(open(d/'supply-attribution.json'))
        assert len(summary['records'])==len(audit)==(64 if group.startswith('replication') else 16 if group.startswith('validation') else 8)
        local=defaultdict(Counter)
        for r in audit:
            original=next(x for x in summary['records'] if x['match']==r['match'])
            assert original['stopReason']=='FINISHED' and original['replay']['ok'] and not original['errors'] and original['rejected']==0
            assert not r['previewMismatches'] and r['finalStateHash']==original['finalStateHash']
            for side,info in r['sides'].items():
                label='19' if info['policy'].startswith('heuristic@') else version
                owner='player:'+side;other=r['sides']['axis' if side=='allied' else 'allied']
                for t in [totals[label],local[label]]:
                    t.update(games=1,vp=info['vp'],kills=info['stepsKilled'],losses=info['stepsLost'])
                    t['draws' if r['winner']=='draw' else 'wins' if r['winner']==side else 'defeats']+=1
                    t['attritionSteps']+=sum(a['owner']==owner for a in r['attrition'])
                    t['traceBreaks']+=sum(b['action']['actorId']==owner for b in r['relocationTraceBreaks'])
                    t['feedBreaks']+=sum(b['action']['actorId']==owner for b in r['feedBreaks'])
                    t['spendingViolations']+=sum(b['action']['actorId']==owner and not b['preserved'] for b in r['rationSpending'])
                pairs[(label,style,original['seeds']['map'])].append(info['vp']-other['vp'])
        local_runs.append(dict(group=group,style=style,policies=dict(local)))
        extra=json.load(open(d/'advance-supply.json')) if (d/'advance-supply.json').exists() else None
        if int(version.split('+')[0])>=32:
            if extra is None:break
            assert len(extra)==len(summary['records']) and all(not e['previewMismatches'] and not e['reinforcementViolations'] for e in extra)
        for e in extra or []:
            original=next(x for x in summary['records'] if x['match']==e['match'])
            for a in e['advances']:
                info=original['sides'][a['actor'].split(':')[-1]]
                label='19' if info['policy'].startswith('heuristic@') else version
                for t in [totals[label],local[label]]:
                    t['advancePreviewsChecked']+=1
                    t['reinforcements']+=int(a['reinforcement'])
                    if a['reinforcement']:
                        t['reinforcementTraceBreaks']+=a['traceLost'];t['reinforcementFeedBreaks']+=a['feedLost']
        local_archive.append(dict(group=group,style=style,summary=summary,supply=audit,advanceSupply=extra))
    else:
        pair_data[group]=[statistics.mean(p) for (v,s,seed),p in pairs.items() if v==version]
        for label,t in totals.items():
            ps=[statistics.mean(p) for (v,s,seed),p in pairs.items() if v==label]
            assert all(len(p)==2 for p in pairs.values())
            t['meanVp']=t['vp']/t['games'];t['pairedVpMargin']=statistics.mean(ps)
            t['pairedSE']=statistics.stdev(ps)/math.sqrt(len(ps));t['pairs']=len(ps)
        tables[group]=dict(totals);runs+=local_runs;archive+=local_archive

validation={}
for v,prefix in [('24','validation'),('26','validation-v26'),('27','validation-v27'),('30','validation-v30'),('31','validation-v31'),('33','validation-v33'),('35','validation-v35'),('35-replication','replication-v35')]:
    names=[prefix+'-meeting',prefix+'-attack']
    if not all(n in pair_data for n in names):continue
    ps=sum([pair_data[n] for n in names],[]);n=len(ps);assert n==(128 if prefix.startswith('replication') else 32)
    policy_version=v.split('-')[0]
    mean=statistics.mean(ps);se=statistics.stdev(ps)/math.sqrt(n)
    positive_types=all(tables[n][policy_version]['vp']>tables[n]['19']['vp'] for n in names)
    validation[v]=dict(pairs=n,mean=mean,se=se,interval=[mean-2.1*se,mean+2.1*se],
                       bothEngagementsPositive=positive_types,statisticalCriterionMet=positive_types and mean-2.1*se>0)

sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
result=dict(baseCommit='0e4c9c3',baseline='heuristic@19',eligibleTheaters=['TEMPERATE_INLAND','EASTERN_EUROPE'],
            retiredTheater='MEDITERRANEAN_COAST: historical runs excluded from promotion; no later runs',
            tables=tables,runs=runs,independentValidation=validation,
            candidateSourceSha256={v:sha(root/('candidate-v'+v)/'src/ai/policies/heuristic.ts') for v in ['21','22','23','24','25','26','27','28','29','30','31','32','33','34','35']},
            candidateBuildSha256={v:sha(root/('candidate-v'+v)/'dist/ai/policies/heuristic.js') for v in ['21','22','23','24','25','26','27','28','29','30','31','32','33','34','35']},
            candidateAnalysisSha256={v:sha(root/('candidate-v'+v)/'src/ai/analysis.ts') for v in ['28','29']},
            baselineBuildSha256=sha(root.parent/'v19-vp-2026-10-13/engine-checkout/dist/ai/policies/heuristic.js'),
            caveats=['Existing guard counts cover move/mode trace and individual food access plus optional fuel/hedgehog commitments, not all logistics decisions.',
                     'Headless battles do not promote UI operation rows.',
                     'The preregistered interval is an approximate conservative range, not proof of superiority in every position.',
                     'A statistical criterion alone does not complete promotion; source checks, real continuations and delivery remain required.'])
result['weightConfigurations']={name:json.load(open(root/'weight-search'/(name+'.json'))) for name in weight_names}
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
with gzip.GzipFile(str(out/'runs.json.gz'),'wb',mtime=0) as f:f.write(json.dumps(archive,separators=(',',':')).encode())
for p in [*root.glob('cases*.json.gz'),*root.glob('weight-cases*.json.gz'),*root.glob('first-player*-inputs.json.gz'),*root.glob('v35-replication-own-action*.json.gz'),*root.glob('v35-retreat-cause*.json.gz')]:(out/p.name).write_bytes(p.read_bytes())
for name in ['batch.py','cases.mjs','summarize.py','audit-trace-gain.mjs','audit-placement.mjs','extract-placement.mjs','audit-defence.mjs','audit-pawn.mjs','weight-search.py','weight-cases.mjs','weight-audits.py','audit-garrison.mjs','audit-advance.mjs','audit-advance-supply.mjs','extract-first-player.mjs']:
    (out/name).write_bytes((root/name).read_bytes())
for p in [*root.glob('*test*.log'),*root.glob('*cases*.log')]:
    with gzip.GzipFile(str(out/(p.name+'.gz')),'wb',mtime=0) as f:f.write(p.read_bytes())
for p in [*root.glob('full-suite*.log'),*root.glob('*-typecheck.log'),*root.glob('*-build.log'),*root.glob('*-smoke.log')]:
    with gzip.GzipFile(str(out/(p.name+'.gz')),'wb',mtime=0) as f:f.write(p.read_bytes())
for p in [*root.glob('*-freeze.json'),*root.glob('*-quality.json'),*root.glob('*-attribution.json'),*root.glob('*-acceptance.json')]:(out/p.name).write_bytes(p.read_bytes())
sources=out/'sources';sources.mkdir(exist_ok=True)
for version in ['21','22','23','24','25','26','27','28','29','30','31','32','33','34','35']:
    for file,label in [('src/ai/policies/heuristic.ts','policy'),('src/ai/analysis.ts','analysis'),('src/ai/policies/heuristic-weights.ts','weights')]:
        with gzip.GzipFile(str(sources/(f'v{version}-{label}.ts.gz')),'wb',mtime=0) as f:f.write((root/('candidate-v'+version)/file).read_bytes())
for version in ['32','33','34','35']:
    for file,label in [('src/ai/decisions.ts','decisions'),('src/rules/supply/relocation-impact.ts','relocation-impact')]:
        with gzip.GzipFile(str(sources/(f'v{version}-{label}.ts.gz')),'wb',mtime=0) as f:f.write((root/('candidate-v'+version)/file).read_bytes())
for name in ['trace-gain-TEMPERATE_INLAND.json','placement-TEMPERATE_INLAND.json','placement-EASTERN_EUROPE.json']:
    with gzip.GzipFile(str(out/(name+'.gz')),'wb',mtime=0) as f:f.write((root/name).read_bytes())
for p in root.glob('defence-*.json'):
    with gzip.GzipFile(str(out/(p.name+'.gz')),'wb',mtime=0) as f:f.write(p.read_bytes())
for p in [*root.glob('pawn-*.json'),*root.glob('garrison-*.json'),*root.glob('advance-*.json')]:
    with gzip.GzipFile(str(out/(p.name+'.gz')),'wb',mtime=0) as f:f.write(p.read_bytes())
print(json.dumps({'completedEligibleMatches':sum(t[next(v for v in t if v!='19')]['games'] for t in tables.values()),'independentValidation':validation},indent=2))
