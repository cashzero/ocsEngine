// Real built-UI acceptance for SES-01/07, ACT-06 and SUP-B01–08.
// Uses visible controls and native file chooser/download events. No fixtures or controller calls.
// Usage: node scripts/product-acceptance/run-helpers.mjs [artifactDir]
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { click, has, open, record, selectUnit, where, newGame, gotoHex, tab, placeArrivals } from '../air-acceptance/harness.mjs';
import { playUntil, moveSelectedTo } from './lib.mjs';
const evidenceDir=process.argv[2]??'artifacts/operations/final-helpers';
await mkdir(evidenceDir,{recursive:true});
const h=await open({evidenceDir});const {page}=h;const state={files:0};
const rawClick=page.click.bind(page);
page.click=async(selector,...args)=>{
 const t=Date.now();const result=await rawClick(selector,...args);
 if(selector==='button[form="new-game-form"]')await page.waitForSelector('#start-previewed-game:not([disabled])');
 else if(selector==='#start-previewed-game')await page.waitForSelector('#new-game-form',{state:'hidden'});
 else await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
 h.timings.push({label:selector,elapsed:Date.now()-t,budget:['button[form="new-game-form"]','#start-previewed-game'].includes(selector)?3000:1500});return result;
};
const locatorPrototype=Object.getPrototypeOf(page.locator('body')),locatorClick=locatorPrototype.click;
locatorPrototype.click=async function(...args){
 const label=String(this),started=Date.now();const value=await locatorClick.apply(this,args);
 await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
 h.timings.push({label,elapsed:Date.now()-started,budget:/confirm|pay-fuel|feed|data-unit-action|data-mode|end-phase|data-choice/.test(label)?1500:1000});
 return value;
};
try {
// Operation group 2
await (async()=>{
state.download=async(selector)=>{const [d]=await Promise.all([page.waitForEvent('download'),click(h,selector)]);const path=join(evidenceDir,`${String(++state.files).padStart(3,'0')}-${d.suggestedFilename()}`);await d.saveAs(path);const {readFile}=await import('node:fs/promises');return {path,content:JSON.parse(await readFile(path,'utf8'))};};
state.save=async()=>{await click(h,'#open-menu');const d=await state.download('#save-game');await click(h,'#close-utility');return d;};
state.load=async(button,path)=>{await click(h,'#open-menu');const [chooser]=await Promise.all([page.waitForEvent('filechooser'),click(h,button)]);await chooser.setFiles(path);await page.waitForTimeout(800);};
const before=await state.save();
await click(h,'#open-menu');await click(h,'#pause-game');
const paused=await where(h);await h.shot('paused');
// A real key attempt on the disabled phase control must not act.
const disabled=await page.locator('#end-phase').boundingBox();await page.mouse.click(disabled.x+disabled.width/2,disabled.y+disabled.height/2);
const held=await state.save();
record(h,'SES-01','Pause refuses game actions and preserves the rule state',JSON.stringify({paused,hash:held.content.finalStateHash,before:before.content.finalStateHash}),paused.endDisabled&&held.content.lifecycle==='PAUSED'&&held.content.finalStateHash===before.content.finalStateHash&&held.content.acceptedActions.length===before.content.acceptedActions.length);
await click(h,'#resume-game');
const resumed=await where(h);await h.shot('resumed');
record(h,'SES-01','Resume restores action availability with no state loss',JSON.stringify(resumed),!resumed.endDisabled&&resumed.phase===paused.phase);
return {paused,resumed};

})();
// Operation group 3
await (async()=>{
await newGame(h,{width:16,height:12,scale:'COMPACT',divisions:1,armored:0,air:'NONE',turnLimit:2,seeds:{map:23111,oob:23112,deployment:23113,rules:23114},onPreview:async()=>{h.note('Package A:16x12 Compact,1 division,0 armor,seeds23111–23114,2 turns');await h.shot('package-a-preview');}});
await h.shot('package-a-mounted');
await newGame(h,{width:18,height:12,scale:'STANDARD',divisions:2,armored:1,air:'NONE',turnLimit:1,seeds:{map:7101,oob:7102,deployment:7103,rules:7104},onPreview:async()=>{h.note('Package B:18x12 Standard,2 divisions,1 armor,seeds7101–7104,1 turn');await h.shot('package-b-preview');}});
await playUntil(h,async()=>await page.locator('.game-end-dialog').isVisible().catch(()=>false),{placeArrivals});
state.endText=await page.locator('.game-end-dialog').innerText();await h.shot('final-result');
state.finalSave=await state.download('#download-final-save');state.finalReplay=await state.download('#download-replay');
await click(h,'#close-game-end');
await state.load('#load-game',state.finalSave.path);
const loadedSave=await page.locator('.game-end-dialog').innerText();await h.shot('save-restored');await click(h,'#close-game-end');
await state.load('#load-replay',state.finalReplay.path);
const loadedReplay=await page.locator('.game-end-dialog').innerText();await h.shot('replay-restored');
record(h,'SES-07','Downloaded final save and replay both reproduce the final result through file selection',JSON.stringify({before:state.endText,loadedSave,loadedReplay,saveHash:state.finalSave.content.finalStateHash,replayHash:state.finalReplay.content.finalStateHash}),state.endText===loadedSave&&state.endText===loadedReplay&&state.finalSave.content.finalStateHash===state.finalReplay.content.finalStateHash);
return {before:state.endText,loadedSave,loadedReplay,where:await where(h)};

})();
// Operation group 4
await (async()=>{
await click(h,'#close-game-end');
await newGame(h,{width:24,height:18,scale:'STANDARD',divisions:3,armored:1,air:'NONE',turnLimit:3,seeds:{map:23101,oob:23102,deployment:23103,rules:23104},onPreview:async()=>{h.note('Helper package:24x18 Standard,3 divisions,1 armor,seeds23101–23104,3 turns');await h.shot('helper-package-preview');}});
await tab(h,'Logistics');await h.shot('helper-initial');
state.helperBefore=await state.save();
await page.fill('#helper-destination','0606');await page.fill('#helper-tokens','8');await click(h,'#helper-preview');
state.planText=await page.locator('#helper-plan').innerText();await h.shot('eight-token-plan');
return {text:state.planText,where:await where(h)};

})();
// Operation group 5
await (async()=>{
const previewSave=await state.save();
record(h,'SUP-B01','8T preview lists a legal route, MP and destination stock without mutating the game',state.planText,previewSave.content.finalStateHash===state.helperBefore.content.finalStateHash&&state.planText.includes('Deliver 8T / 8T')&&state.planText.includes('20T')&&state.planText.includes('MP'));
await click(h,'#helper-cancel');
const canceled=await state.save();
record(h,'SUP-B01','Cancel leaves authoritative stock and revision unchanged',canceled.content.finalStateHash,canceled.content.finalStateHash===state.helperBefore.content.finalStateHash);
await click(h,'#helper-preview');await click(h,'#helper-confirm',{settle:400});
state.helperAfter=await state.save();await h.shot('transport-completed');
record(h,'SUP-B02','Confirmed transport delivers 8T and agrees with the preflight',JSON.stringify({where:await where(h),hash:state.helperAfter.content.finalStateHash,actions:state.helperAfter.content.acceptedActions}),JSON.parse(state.helperAfter.content.currentSnapshot).pieceState.pieces.some(p=>p.location.kind==='ON_MAP'&&p.location.hexId==='3,5'&&p.resourceQuantity===20)&&(await where(h)).notice.includes('matches'));
await state.load('#load-game',state.helperBefore.path);
await selectUnit(h,'Truck');
return {deck:await page.locator('.command-rail').innerText(),where:await where(h)};

})();
// Operation group 6
await (async()=>{

state.download=async(selector)=>{const [d]=await Promise.all([page.waitForEvent('download'),click(h,selector)]);const path=join(evidenceDir,`${String(++state.files).padStart(3,'0')}-${d.suggestedFilename()}`);await d.saveAs(path);const {readFile}=await import('node:fs/promises');return {path,content:JSON.parse(await readFile(path,'utf8'))};};
state.helperBefore.path=join(evidenceDir,'helper-baseline.json');await writeFile(state.helperBefore.path,JSON.stringify(state.helperBefore.content));
await state.load('#load-game',state.helperBefore.path);await selectUnit(h,'Truck');
const moved=await moveSelectedTo(h,'0711',gotoHex);
const load=page.locator('.transfer-row').filter({has:page.locator('[data-transfer="LOAD"]')});await load.locator('input').fill('8');await click(h,'[data-transfer="LOAD"]');
const moved2=await moveSelectedTo(h,'0606',gotoHex);
const unload=page.locator('.transfer-row').filter({has:page.locator('[data-transfer="UNLOAD"]')});await unload.locator('input').fill('8');await click(h,'[data-transfer="UNLOAD"]');
await click(h,'#finish-move');
const manual=await state.save();await h.shot('manual-transport-equivalent');
record(h,'SUP-B02','The same manual move/load/move/unload/finish has exactly the helper final state',JSON.stringify({moved,moved2,manual:manual.content.finalStateHash,helper:state.helperAfter.content.finalStateHash}),manual.content.finalStateHash===state.helperAfter.content.finalStateHash);
await state.load('#load-game',state.helperBefore.path);await tab(h,'Logistics');
await page.fill('#helper-destination','2418');await page.fill('#helper-tokens','8');await click(h,'#helper-preview');
const invalid=await page.locator('#helper-plan').innerText();await h.shot('invalid-unload');
record(h,'SUP-B04','Invalid unload destination names 13.2f and offers legal alternatives',invalid,invalid.includes('13.2f')&&await page.locator('[data-helper-alternative]').count()>0);
await page.fill('#helper-destination','0606');await page.fill('#helper-tokens','100');await click(h,'#helper-preview');
const shortage=await page.locator('#helper-plan').innerText();await h.shot('shortfall');
record(h,'SUP-B03','Oversized task reports deliverable stock, shortfall and alternatives',shortage,/short 88T/.test(shortage)&&shortage.includes('Send available 12T'));
return {manualMatches:manual.content.finalStateHash===state.helperAfter.content.finalStateHash,invalid,shortage};

})();
// Operation group 7
await (async()=>{
await click(h,'#helper-cancel');await selectUnit(h,'Truck');
await moveSelectedTo(h,'0711',gotoHex);
for(let i=0;i<5;i++){const out=await moveSelectedTo(h,'0606',gotoHex);const back=await moveSelectedTo(h,'0711',gotoHex);if(!out.moved||!back.moved) throw new Error('MP exhaustion route unexpectedly illegal');}
await tab(h,'Logistics');await page.fill('#helper-destination','0606');await page.fill('#helper-tokens','8');await click(h,'#helper-preview');
const poor=await page.locator('#helper-plan').innerText();await h.shot('mp-shortfall');
record(h,'SUP-B03','A task exceeding remaining truck MP reports no delivery with the MP reason and legal alternatives',poor,poor.includes('short 8T')&&/remaining MP|remaining MP|finished moving/.test(poor)&&await page.locator('[data-helper-alternative]').count()>0);
await state.load('#load-game',state.helperBefore.path);await tab(h,'Logistics');
return {poor,where:await where(h),fuelUnits:await page.locator('[data-helper-fuel-unit]').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.helperFuelUnit,label:n.parentElement.innerText})))};

})();
// Operation group 8
await (async()=>{
await page.locator('details').filter({has:page.locator('[data-helper-fuel-unit]')}).locator('summary').click();
for(const id of ['f1-combat-1','f1-combat-2','f1-combat-3','f1-recon','f1-artillery-1']) await page.locator(`[data-helper-fuel-unit*="allied:${id}:"]`).check();
const fuelBefore=await state.save();
const estimate=await page.locator('[aria-label="Fuel estimate"]').innerText();
await page.locator('details').filter({hasText:'Compare single-unit'}).locator('summary').click();await h.shot('fuel-comparison');
await click(h,'#helper-pay-fuel');
const fuelAfter=await state.save();await h.shot('fuel-paid');
const beforeState=JSON.parse(fuelBefore.content.currentSnapshot),afterState=JSON.parse(fuelAfter.content.currentSnapshot);
const stock=s=>s.pieceState.pieces.filter(p=>p.ownerId==='player:allied'&&p.resourceQuantity!==null).reduce((sum,p)=>sum+p.resourceQuantity,0);
record(h,'SUP-B05','Five selected formation units compare 1T single-unit with 4T formation and pay the recommended 4T',JSON.stringify({estimate,before:stock(beforeState),after:stock(afterState),notice:(await where(h)).notice}),estimate.includes('Recommended payment 4T')&&stock(beforeState)-stock(afterState)===4&&(await where(h)).notice.includes('matches'));
return {estimate,notice:(await where(h)).notice};

})();
// Operation group 9
await (async()=>{
await state.load('#load-game',state.helperBefore.path);await tab(h,'Logistics');
// Stop with a complete 8T helper plan applied, so this exact package continues into its whole-turn gate.
await page.fill('#helper-destination','0606');await page.fill('#helper-tokens','8');await click(h,'#helper-preview');await click(h,'#helper-confirm');
await playUntil(h,async(s)=>/Turn 2/.test(s.turn),{placeArrivals});
state.turn2=await state.save();
await click(h,'#open-menu');state.turn2Replay=await state.download('#export-replay');await click(h,'#close-utility').catch(()=>{});
return {where:await where(h),turn2:state.turn2.content.finalStateHash};

})();
// Operation group 10
await (async()=>{
await state.load('#load-game',state.turn2.path);
const again=await state.save();record(h,'SUP-B08','Whole helper turn survives downloaded save and file load',JSON.stringify({before:state.turn2.content.finalStateHash,after:again.content.finalStateHash,where:await where(h)}),state.turn2.content.finalStateHash===again.content.finalStateHash);
await playUntil(h,async()=>await page.locator('.game-end-dialog').isVisible().catch(()=>false),{placeArrivals});
const finalText=await page.locator('.game-end-dialog').innerText();state.helperReplay=await state.download('#download-replay');await h.shot('helper-game-end');await click(h,'#close-game-end');
await state.load('#load-replay',state.helperReplay.path);
record(h,'SUP-B08','The helper game completes through legal arrivals, decisions and handoffs, and the downloaded replay reproduces Game End',JSON.stringify({finalText,replayed:await page.locator('.game-end-dialog').innerText(),hash:state.helperReplay.content.finalStateHash}),finalText===await page.locator('.game-end-dialog').innerText());
await h.shot('helper-replayed-end');return {finalText,errors:h.errors};

})();
// Operation group 11
await (async()=>{
await click(h,'#close-game-end');
await newGame(h,{width:48,height:36,scale:'COMPACT',divisions:2,armored:1,air:'NONE',turnLimit:2,seeds:{map:24113,oob:24114,deployment:24115,rules:24116},onPreview:async()=>{h.note('Natural fuel-shortfall package:48x36 Compact,2 divisions,1 armor,seeds24113–24116,2 turns');await h.shot('shortfall-package-preview');}});
await tab(h,'Logistics');
await page.locator('details').filter({has:page.locator('[data-helper-fuel-unit]')}).locator('summary').click();
await page.locator('[data-helper-fuel-unit*="allied:f1-combat-1:"]').check();
const estimate=await page.locator('[aria-label="Fuel estimate"]').innerText();await h.shot('natural-fuel-shortfall');
await click(h,'[data-helper-shortfall="2027"]');
const input={destination:await page.inputValue('#helper-destination'),quantity:await page.inputValue('#helper-tokens')};
await page.selectOption('#helper-source',{index:0});await click(h,'#helper-preview');
const plan=await page.locator('#helper-plan').innerText();await h.shot('shortfall-prefilled-plan');
record(h,'SUP-B06','A natural missing-fuel estimate prefills the transport destination and quantity and builds a legal plan',JSON.stringify({estimate,input,plan}),estimate.includes('1 selected units cannot be fueled')&&input.destination==='2027'&&input.quantity==='1'&&plan.includes('Deliver 1T / 1T'));
return {estimate,input,plan};

})();
// Operation group 13
await (async()=>{
await click(h,'#helper-confirm');
const delivered=await state.save();h.note(`Natural shortfall resolved through 1T helper delivery; final hash ${delivered.content.finalStateHash}`);
await newGame(h,{width:48,height:36,scale:'COMPACT',divisions:2,armored:1,air:'NONE',turnLimit:2,seeds:{map:24109,oob:24110,deployment:24111,rules:24112},onPreview:async()=>{h.note('Natural Supply package:48x36 Compact,2 divisions,1 armor,seeds24109–24112,2 turns');await h.shot('supply-package-preview');}});
await tab(h,'Logistics');state.supplyPrediction=await page.locator('[aria-label="Supply prediction"]').innerText();await h.shot('natural-supply-prediction');
await playUntil(h,async(s)=>/Supply/.test(s.phase)&&/Allied player turn/.test(s.player),{placeArrivals});
state.supplyBefore=await state.save();
await tab(h,'Supply');state.supplyUI=await page.locator('.command-rail').innerText();await h.shot('explicit-supply-need');
await click(h,'[data-feed*="allied:garrison:objective-13"]');
state.manualSupply=await state.save();await tab(h,'Log');const log=await page.locator('.deck-body').innerText();
record(h,'ACT-06','Natural generated garrison draws 1T during Supply; payment and history update',JSON.stringify({supplyUI:state.supplyUI,log,notice:(await where(h)).notice}),state.manualSupply.content.acceptedActions.at(-1).kind==='CHECK_SUPPLY'&&log.includes('supply'));
await state.load('#load-game',state.supplyBefore.path);await tab(h,'Logistics');const livePrediction=await page.locator('[aria-label="Supply prediction"]').innerText();await click(h,'#helper-feed');
state.helperSupply=await state.save();
record(h,'SUP-B07','Prediction of one out-of-trace but feedable unit agrees with actual 1T helper payment and the manual result',JSON.stringify({before:state.supplyPrediction,atSupply:livePrediction,manualHash:state.manualSupply.content.finalStateHash,helperHash:state.helperSupply.content.finalStateHash}),state.supplyPrediction.includes('Out of trace: 1')&&state.supplyPrediction.includes('Out of Supply after these payments: 0')&&state.manualSupply.content.finalStateHash===state.helperSupply.content.finalStateHash);
await playUntil(h,async(s)=>/Turn 2/.test(s.turn),{placeArrivals});state.supplyTurn=await state.save();
return {before:state.supplyPrediction,livePrediction,supplyUI:state.supplyUI,log,where:await where(h),same:state.manualSupply.content.finalStateHash===state.helperSupply.content.finalStateHash};

})();
// Operation group 14
await (async()=>{
await state.load('#load-game',state.supplyBefore.path);
await page.locator('[data-deck-tab="supply"]').click();await click(h,'[data-feed*="allied:garrison:objective-13"]');
await page.locator('[data-deck-tab="log"]').click();const log=await page.locator('.deck-body').innerText();await h.shot('supply-payment-history');
const after=await state.save();
record(h,'ACT-06','Natural Supply payment updates authoritative state and visible history',JSON.stringify({log,before:state.supplyBefore.content.finalStateHash,after:after.content.finalStateHash}),after.content.acceptedActions.at(-1).kind==='CHECK_SUPPLY'&&log.toLowerCase().includes('supply')&&state.supplyBefore.content.finalStateHash!==after.content.finalStateHash);
await state.load('#load-game',state.supplyTurn.path);
await playUntil(h,async()=>await page.locator('.game-end-dialog').isVisible().catch(()=>false),{placeArrivals});
const finalText=await page.locator('.game-end-dialog').innerText();state.supplyReplay=await state.download('#download-replay');await click(h,'#close-game-end');
await state.load('#load-replay',state.supplyReplay.path);
record(h,'SUP-B08','Natural Supply helper game finishes and its file replay reproduces the result',JSON.stringify({finalText,replayed:await page.locator('.game-end-dialog').innerText(),hash:state.supplyReplay.content.finalStateHash}),finalText===await page.locator('.game-end-dialog').innerText());
await h.shot('supply-game-replayed');return {log,finalText};

})();
} catch(error){record(h,'RUN','Complete requested operations',String(error.stack??error),false);await h.shot('failure');}
await h.finish('Built UI: session, logistics helpers and natural Supply');
const failed=h.rows.some(r=>r.status==='FAIL')||h.errors.length;
await h.close();
if(failed)process.exitCode=1;
