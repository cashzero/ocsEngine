from pathlib import Path
from collections import Counter
import json,sys

root=Path('tmp/ai-match/vp-next-2026-10-14');batch=sys.argv[1]
losses=Counter();mechanisms={'candidate':Counter(),'baseline':Counter()};unique={'candidate':set(),'baseline':set()};groups=[]
for engagement in ['meeting','attack']:
 for style in ['temperate','eastern']:
  folder=root/f'{engagement}-v{batch}-{style}'
  matches=json.loads((folder/'summary.json').read_text())['records']
  supply=json.loads((folder/'supply-attribution.json').read_text())
  advance=json.loads((folder/'advance-supply.json').read_text())
  assert len(matches)==len(supply)==len(advance)==20
  for match in matches:
   owner='player:'+next(side for side,policy in match['sides'].items() if policy['policy']=='heuristic')
   entry=next(row for row in supply if row['match']==match['match'])
   for loss in entry['attrition']:losses['candidate' if loss['owner']==owner else 'baseline']+=1
   audit=next(row for row in advance if row['match']==match['match'])
   for cause in audit['causes']:
    side='candidate' if cause['owner']==owner else 'baseline'
    mechanisms[side][cause['mechanism']]+=1
    unique[side].add((match['match'],cause['lossIndex']))
  groups.append(folder.name)
freeze=json.loads((root/f'v{batch}-freeze.json').read_text())
result={'strategyVersion':freeze.get('strategyVersion', '57' if batch=='58' else batch),'artifactBatchId':batch,'games':80,'groups':groups,
 'attritionEvents':dict(losses),'eventsWithRecordedTriggers':{side:len(rows) for side,rows in unique.items()},
 'triggerMechanisms':{side:dict(counts) for side,counts in mechanisms.items()},
 'interpretation':'Mechanism counts are trigger records, not unique attrition events or proof of bot mistakes. An event can have both trace and ration triggers. Enemy-initiated mechanisms identify adversarial actions; friendly resource use, entries and combat reactions require case inspection before calling them avoidable mistakes.'}
(root/f'v{batch}-causal-summary-plan.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
