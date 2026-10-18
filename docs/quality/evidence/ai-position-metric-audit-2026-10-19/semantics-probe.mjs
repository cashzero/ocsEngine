import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const repo=process.cwd(), build='/tmp/ocsEngine-latest-metrics-probe';
const load=file=>import(pathToFileURL(resolve(build,file)));
const {createRuleGameStateFixture,setRuleSequenceFixture,ruleActionBase}=await load('testing/rule-fixtures.js');
const {loadEngine,nextTurnMetrics,positionMetrics,eventTotals}=await import(pathToFileURL(resolve(repo,'scripts/ai-position-metrics.mjs')));
const e=await loadEngine(build), {m}=e;
const {withInternalStocks}=e.pieces;
const {requiredRecoveryOutcome}=e.rationBudget;
const {settleDeclaredAttackerSupply}=await load('rules/combat/combat.js');
const {overstackDecision}=await load('rules/lifecycle/lifecycle.js');
const idA='piece:multi-step',idD='piece:ground',P='player:one',Q='player:two';
const dice=Array.from({length:11},(_,i)=>({total:i+2,p:(6-Math.abs(i+2-7))/36}));
const expectation=(odds,steps,held=false,surprise=false)=>{
  let value=0;
  const shifts=surprise?dice.flatMap(({total,p})=>{
    const t=total+odds.drm+(odds.hedgehogLevel>0?-1:0);
    return t>=10||t<=5?Array.from({length:6},(_,i)=>({shift:(i+1)*(t>=10?1:-1),p:p/6})):[{shift:0,p}];
  }):[{shift:0,p:1}];
  for(const shift of shifts)for(const die of dice){
    const col=Math.max(0,Math.min(odds.columns.length-1,odds.columnIndex+shift.shift));
    const r=m.parseCombatResult(m.COMBAT_TABLE_ROWS[m.combatTableRowIndex(die.total+odds.drm-odds.hedgehogLevel)][col]);
    value+=shift.p*die.p*Math.min(steps,r.defender.loss+(held?r.defender.option:0));
  }
  return value;
};
const isolated=(withDump=false)=>{
 let s=createRuleGameStateFixture();
 return {...s,configuration:{...s.configuration,objectives:[]},pieceState:{...s.pieceState,relations:[],pieces:s.pieceState.pieces.map(p=>[idA,idD].includes(p.id)||(withDump&&p.id==='piece:supply-dump')?p:{...p,location:{kind:'ELIMINATED'}})}};
};
let s=isolated();
const oddsNull=e.strength.calculateCombatOdds(s,[idA],[idD],'3,1',[idD],null,null);
const oddsLead=e.strength.calculateCombatOdds(s,[idA],[idD],'3,1',[idD],idA,idD);
const ar={metric:nextTurnMetrics(e,s,{supplyCutFor:[]})[Q].maxSingleStackExpectedLoss,
  nullLeader:{attackerAR:oddsNull.leadAttackerRating,drm:oddsNull.drm,column:oddsNull.columnIndex,expectedWithoutSurprise:expectation(oddsNull,1)},
  chosenLeader:{attackerAR:oddsLead.leadAttackerRating,drm:oddsLead.drm,column:oddsLead.columnIndex,expectedWithoutSurprise:expectation(oddsLead,1),expectedWithSurprise:expectation(oddsLead,1,false,true)}};
s=isolated(true);
s={...s,configuration:{...s.configuration,objectives:[{hexId:'3,1',points:5}]},mapState:{...s.mapState,hexControl:[{hexId:'3,1',controllerId:Q}]},pieceState:{...s.pieceState,pieces:s.pieceState.pieces.map(p=>p.id===idA?withInternalStocks(p,'EXHAUSTED'):p.id===idD?{...p,mode:'DG'}:p.id==='piece:supply-dump'?{...p,location:{kind:'ON_MAP',hexId:'2,1'},resourceQuantity:4}:p)}};
const pre=nextTurnMetrics(e,s,{supplyCutFor:[]})[P], recovery=requiredRecoveryOutcome(s,P);
const supplyState=setRuleSequenceFixture(s,'SUPPLY','NONE',P);
const recoveredAction=m.ruleEngine.applyAction(supplyState,{...ruleActionBase(supplyState,P,'metrics-recovery-probe'),kind:'RECOVER_INTERNALS',pieceId:idA,sourcePieceIds:['piece:supply-dump']});
let after=recoveredAction.state;
const recoveryWitness={metrics:{raw:pre.objectivesInReach,payable:pre.payableObjectivesInReach,surplus:positionMetrics(e,s)[P].surplusCombatSp},recoveredStocks:Object.fromEntries(recovery.levels),recoveryActionViolations:recoveredAction.violations??[],actualStocksAfterRecovery:e.pieces.internalStocksOf(after.pieceState.pieces.find(p=>p.id===idA)),dumpRemaining:after.pieceState.pieces.find(p=>p.id==='piece:supply-dump').resourceQuantity,supplySettlementAfterRecovery:settleDeclaredAttackerSupply(after,P,[idA],[{pieceId:idA,method:'INTERNAL',dumpIds:[]}]),afterRecoveryMetrics:nextTurnMetrics(e,after,{supplyCutFor:[]})[P].payableObjectivesInReach};
s=isolated();
s=setRuleSequenceFixture({...s,configuration:{...s.configuration,stackingLimitReTicks:1}},'MOVEMENT','MOVEMENT',P);
const decision=overstackDecision(s);
const pending={...s,pendingDecision:decision};
const action={...ruleActionBase(pending,P,'metrics-overstack-probe'),kind:'RESPOND_DECISION',decisionId:decision.id,choiceId:`eliminate:${idA}`};
const applied=m.ruleEngine.applyAction(pending,action);
const isAttritionStep=pending.pendingDecision?.kind==='ATTRITION_LOSS'||applied.events.some(e=>e.kind==='ATTRITION_ROLLED');
const overstack={decisionKind:decision.kind,accepted:applied.accepted,violations:applied.violations,stepsBefore:s.pieceState.pieces.find(p=>p.id===idA).remainingSteps,locationAfter:applied.state.pieceState.pieces.find(p=>p.id===idA).location,stepEvents:applied.events.filter(e=>e.kind==='STEP_LOST'),rowClassification:isAttritionStep?'attritionStepsLost':'combatStepsLost',totals:eventTotals([{action,events:applied.events}],id=>s.pieceState.pieces.find(p=>p.id===id)?.ownerId,[P,Q])};
s=isolated();
s={...s,scenario:{...s.scenario,pieceCatalog:{...s.scenario.pieceCatalog,definitions:s.scenario.pieceCatalog.definitions.map(d=>d.id===s.pieceState.pieces.find(p=>p.id===idA).definitionId?{...d,faces:d.faces.map(f=>({...f,steps:f.steps.map(t=>({...t,movementPointTicks:4}))}))}:d)}},configuration:{...s.configuration,objectives:[{hexId:'1,2',points:5},{hexId:'3,2',points:5}]},pieceState:{...s.pieceState,pieces:s.pieceState.pieces.map(p=>p.id===idA?{...p,location:{kind:'ON_MAP',hexId:'2,2'}}:{...p,location:{kind:'ELIMINATED'}})}};
const emptyMetrics=nextTurnMetrics(e,s,{supplyCutFor:[]})[P];
const undefended={objectives:['1,2','3,2'],start:'2,2',movementPointTicks:4,minimumTicksToVisitBoth:12,metrics:{unitsWithReach:emptyMetrics.unitsWithReach,objectivesInReach:emptyMetrics.objectivesInReach,payableObjectivesInReach:emptyMetrics.payableObjectivesInReach}};
const files=['scripts/ai-position-metrics.mjs','scripts/ai-position-record.mjs','src/rules/combat/strength.ts','src/rules/combat/combat.ts','src/rules/kernel/reducer.ts','src/rules/supply/ration-budget.ts'];
const output={commit:'df5a0cbdda8a1b3dac64aca127ae32b878a3bdc0',buildCommand:'node_modules/.bin/tsc -p tsconfig.build.json --outDir /tmp/ocsEngine-latest-metrics-probe --declaration false --declarationMap false --sourceMap false',runCommand:'node artifacts/ai-latest-metrics-study/semantics-probe.mjs',sourceSha256:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(resolve(repo,f))).digest('hex')])),ar,recoveryWitness,undefended,overstack};
writeFileSync(resolve(repo,'artifacts/ai-latest-metrics-study/semantics-probe.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
