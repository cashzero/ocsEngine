// RAIL-05–10/15–16 through actual New Game, moves, combat, decisions, handoffs and file loading.
// Analysis is used to freeze legal destinations; this runner never calls a controller or Rule API.
// Usage: node scripts/product-acceptance/run-rail-operations.mjs [artifactDir]
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { open, click, has, newGame, selectUnit, gotoHex, where, record, placeArrivals, settleLogged } from '../air-acceptance/harness.mjs';
import { moveSelectedTo, playUntil, payFuel } from './lib.mjs';
const evidenceDir=process.argv[2]??'artifacts/operations/rail-accepted';
await mkdir(evidenceDir,{recursive:true});const h=await open({evidenceDir}),{page}=h,state={};
const proto=Object.getPrototypeOf(page.locator('body')),raw=proto.click;
proto.click=async function(...args){const label=String(this),t=Date.now();const value=await raw.apply(this,args);await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));h.timings.push({label,elapsed:Date.now()-t});return value;};
try{
// Rail operation group 2
await(async()=>{
await page.reload();await page.waitForSelector('#open-menu');
state.files=0;state.download=async(selector)=>{const [d]=await Promise.all([page.waitForEvent('download'),click(h,selector)]);const path=join(evidenceDir,`${++state.files}-${d.suggestedFilename()}`);await d.saveAs(path);const {readFile}=await import('node:fs/promises');return {path,content:JSON.parse(await readFile(path,'utf8'))};};
state.save=async()=>{await click(h,'#open-menu');const d=await state.download('#save-game');await click(h,'#close-utility');return d;};
state.load=async(path)=>{await click(h,'#open-menu');const [chooser]=await Promise.all([page.waitForEvent('filechooser'),click(h,'#load-game')]);await chooser.setFiles(path);await page.waitForTimeout(700);};
await newGame(h,{width:48,height:36,scale:'COMPACT',divisions:4,armored:1,air:'NONE',turnLimit:4,seeds:{map:9111,oob:9112,deployment:9113,rules:9114},onPreview:async()=>{h.note('48x36 Compact,4 divisions,1 armor,4 turns,seeds9111–9114; actual New Game package');await h.shot('rail-final-preview');}});
state.baseline=await state.save();
await click(h,'#toggle-trace-coverage');await selectUnit(h,'US HQ 22nd Corps');
const before=await gotoHex(h,'1905');await h.shot('hq-move-source-absent');await click(h,'[data-mode="COMBAT"]');const combat=await gotoHex(h,'1905');await h.shot('hq-combat-source-present');
await click(h,'[data-mode="MOVE"]');const after=await gotoHex(h,'1905');await h.shot('hq-move-source-removed');
record(h,'RAIL-08','Combat HQ on bare railroad creates a RAIL supply source and Move removes it',JSON.stringify({before,combat,after}),combat.includes('RAIL Supply Source')&&!before.includes('RAIL Supply Source')&&!after.includes('RAIL Supply Source'));

})();
// Rail operation group 3
await(async()=>{
await state.load(state.baseline.path);await selectUnit(h,'17.Abn');await click(h,'[data-mode="MOVE"]');
const moved=await moveSelectedTo(h,'1204',gotoHex);if(await has(h,'#finish-move'))await click(h,'#finish-move');await page.locator('#toggle-trace-coverage').check();
const rail=await gotoHex(h,'1204');await h.shot('rail-source-beyond-edge-draw');state.rail05=await state.save();
await playUntil(h,async(s)=>/Axis player turn/.test(s.player)&&/Movement/.test(s.phase),{placeArrivals});
await page.locator('[data-deck-tab="log"]').click();const log=await page.locator('.deck-body').innerText();
record(h,'RAIL-05','Move to a friendly rail station beyond direct edge draw; Supply passes in trace',JSON.stringify({moved,rail,log}),moved.moved&&rail.includes('RAIL Supply Source')&&rail.includes('trace supply reaches')&&log.includes('Supply'));
return {rail,log,where:await where(h)};

})();
// Rail operation group 4
await(async()=>{
await state.load(state.baseline.path);await selectUnit(h,'US HQ 22nd Corps');await click(h,'[data-mode="COMBAT"]');await gotoHex(h,'1905',{enter:true});
const supply=page.locator('.stack-picker:not(.stack-peek) .stack-pick').filter({hasText:'Supply dump'});await supply.click();await click(h,'#open-rail');
const panel=await page.locator('.rail-panel').innerText();
return {panel,options:await page.locator('#rail-destination option').evaluateAll(ns=>ns.map(n=>({value:n.value,text:n.innerText}))),inputs:await page.locator('[data-rail-dump]').evaluateAll(ns=>ns.map(n=>({id:n.dataset.railDump,value:n.value,max:n.max}))),where:await where(h)};

})();
// Rail operation group 5
await(async()=>{
await page.locator('[data-rail-dump]').fill('16');await page.locator('[data-rail-dump]').press('Tab');await page.selectOption('#rail-destination','14,6');
const over=await page.locator('.rail-panel').innerText();await h.shot('rail-cap-refusal');const overDisabled=await page.locator('#confirm-rail').isDisabled();
await page.locator('[data-rail-dump]').fill('1');await page.locator('[data-rail-dump]').press('Tab');await page.fill('#rail-check-hex','3234');await page.press('#rail-check-hex','Tab');
const zoc=await page.locator('.rail-panel').innerText();await h.shot('rail-enemy-zoc-refusal');const zocDisabled=await page.locator('#confirm-rail').isDisabled();
record(h,'RAIL-16','Excess Rail Cap and detraining next to an enemy both show the rule and disable confirmation',JSON.stringify({over,zoc}),overDisabled&&zocDisabled&&over.includes('13.3a')&&zoc.includes('enemy ZOC')&&zoc.includes('13.3e'));
await state.load(state.baseline.path);await selectUnit(h,'Truck');const first=await moveSelectedTo(h,'3334',gotoHex);if(!first.moved)throw new Error('Truck cannot reach woodland rail entrance');
const wood=await gotoHex(h,'3433',{enter:true});const preview=await page.locator('.move-popup').innerText();await h.shot('woodland-rail-one-mp-preview');await click(h,'#confirm-move');
record(h,'RAIL-10','Truck crosses a railroad into woods for 1 MP in the actual move preview',JSON.stringify({first,wood,preview}),wood.includes('woods')&&preview.includes('1 MP'));
await h.shot('woodland-rail-move-completed');return {over,zoc,wood,preview};

})();
// Rail operation group 6
await(async()=>{
await state.load(state.baseline.path);await page.locator('#toggle-trace-coverage').check();
const enemyStation=await gotoHex(h,'3329');await h.shot('enemy-isolated-station-before');
await selectUnit(h,'22 Arm Regt / 11.A');await click(h,'[data-mode="MOVE"]');await payFuel(h);
const attackMove=await moveSelectedTo(h,'3329',gotoHex);if(!attackMove.moved)throw new Error('Could not capture station');if(await has(h,'#finish-move'))await click(h,'#finish-move');
const isolated=await gotoHex(h,'3329');await h.shot('station-captured-disconnected');
await selectUnit(h,'Truck');const truckMove=await moveSelectedTo(h,'3229',gotoHex);if(!truckMove.moved)throw new Error('Truck cannot reach the separate rail section');
const extender=page.locator('[data-unit-action]').filter({hasText:/[Ee]xtender/});await extender.first().click();await page.waitForTimeout(300);
const ext=await gotoHex(h,'3229'),linked=await gotoHex(h,'3329');await h.shot('linked-extender-and-station');state.extender=await state.save();
record(h,'RAIL-09','Form a five-point Extender beside a disconnected rail section; EXT and its station RAIL appear',JSON.stringify({enemyStation,isolated,truckMove,ext,linked}),!isolated.includes('RAIL Supply Source')&&ext.includes('EXT Supply Source')&&linked.includes('RAIL Supply Source'));
record(h,'RAIL-07','Enter an enemy station with a combat unit; once its path is linked, it becomes the mover supply source',JSON.stringify({enemyStation,attackMove,isolated,linked}),enemyStation.includes('enemy rail supply path')&&attackMove.moved&&linked.includes('friendly rail supply path')&&linked.includes('RAIL Supply Source'));
return {enemyStation,isolated,ext,linked,where:await where(h)};

})();
// Rail operation group 7
await(async()=>{
await state.load(state.baseline.path);await page.locator('#toggle-trace-coverage').check();
await selectUnit(h,'US HQ 22nd Corps');await payFuel(h);await moveSelectedTo(h,'2611',gotoHex);if(await has(h,'#finish-move'))await click(h,'#finish-move');
const before=await gotoHex(h,'2604');await h.shot('axis-rail-source-before-cut');
for(const name of ['22 Arm Regt / 11.A','White TF / 11.A']){await selectUnit(h,name);await click(h,'[data-mode="MOVE"]');await payFuel(h);const moved=await moveSelectedTo(h,'3505',gotoHex);if(!moved.moved)throw new Error(`Forward movement failed: ${name}`);if(await has(h,'#finish-move'))await click(h,'#finish-move');}
await selectUnit(h,'Truck');const tm=await moveSelectedTo(h,'3505',gotoHex);if(!tm.moved)throw new Error('Forward Extender route failed');await page.locator('[data-unit-action]').filter({hasText:/[Ee]xtender/}).first().click();await page.waitForTimeout(250);
await h.shot('rail-cut-forward-extender');state.cut=await state.save();
await playUntil(h,async(s)=>/Axis player turn/.test(s.player)&&/Supply/.test(s.phase),{placeArrivals});
await page.locator('#toggle-trace-coverage').check();const cut=await gotoHex(h,'2604');await page.locator('[data-deck-tab="supply"]').click();const needs=await page.locator('.command-rail').innerText();await h.shot('axis-rail-cut-supply-list');
record(h,'RAIL-06','Enemy combat occupation cuts the rail source and dependent units appear out of trace in Supply',JSON.stringify({before,cut,needs}),before.includes('enemy rail supply path')&&!cut.includes('RAIL Supply Source')&&needs.includes('out of trace')&&(needs.includes('246.VG')||needs.includes('2.FJ')));
await page.locator('[data-deck-tab="logistics"]').click();await click(h,'#helper-feed');
await playUntil(h,async(s)=>/Turn 2/.test(s.turn)&&/Allied player turn/.test(s.player)&&s.phase==='Movement',{placeArrivals});
state.forward=await state.save();await writeFile(join(evidenceDir,'forward-turn2.json'),JSON.stringify(state.forward.content));await h.shot('allied-forward-turn2');
return {before,cut,needs,where:await where(h),save:state.forward.path};

})();
// Rail operation group 8
await(async()=>{
await state.load(state.extender.path);await click(h,'#open-menu');await click(h,'#begin-handoff');await click(h,'#complete-handoff');await page.locator('#toggle-trace-coverage').check();
const axisView=await gotoHex(h,'3329');await h.shot('captured-station-axis-no-source');
record(h,'RAIL-07','After valid handoff the former owner no longer has the captured station as a rail supply source',JSON.stringify({axisView,where:await where(h)}),!axisView.includes('RAIL Supply Source')&&axisView.includes('enemy rail supply path'));
await state.load(state.forward.path);return {axisView,where:await where(h)};

})();
// Rail operation group 9
await(async()=>{
await state.load(state.forward.path);await page.locator('#toggle-trace-coverage').check();await selectUnit(h,'US HQ 22nd Corps');await click(h,'[data-mode="COMBAT"]');
for(const name of ['22 Arm Regt / 11.A','White TF / 11.A']){await selectUnit(h,name);await payFuel(h);}
const before=await gotoHex(h,'3502');await h.shot('front-station-before');state.frontBefore=await state.save();state.frontBeforeHover=before;
await selectUnit(h,'White TF / 11.A');await click(h,'[data-mode="COMBAT"]');await moveSelectedTo(h,'3603',gotoHex);
await selectUnit(h,'22 Arm Regt / 11.A');await click(h,'[data-mode="COMBAT"]');await moveSelectedTo(h,'3404',gotoHex);await gotoHex(h,'3403',{enter:true});
const draft=await page.locator('.combat-draft').innerText();await h.shot('front-clearance-overrun');return {before,draft,disabled:await page.locator('#declare-draft').isDisabled(),where:await where(h)};

})();
// Rail operation group 10
await(async()=>{
await click(h,'#declare-draft');const decisions=await settleLogged(h);if(await has(h,'#dismiss-result'))await click(h,'#dismiss-result');await selectUnit(h,'22 Arm Regt / 11.A');
const moves=[];for(const hex of ['3402','3501']){const moved=await moveSelectedTo(h,hex,gotoHex);if(!moved.moved)throw new Error(`Could not continue victorious overrun to ${hex}`);moves.push(moved);}
const preEnd=await state.save();await h.shot('front-station-encircled-before-phase-end');
await click(h,'#end-phase');if((await page.locator('#end-phase').innerText()).includes('Finish anyway'))await click(h,'#end-phase');
await page.locator('#toggle-trace-coverage').check();const afterHover=await gotoHex(h,'3502');await h.shot('front-station-control-after-phase-end');state.frontAfter=await state.save();
const controller=file=>JSON.parse(file.content.currentSnapshot).mapState.hexControl.find(c=>c.hexId==='34,1')?.controllerId;
const newActions=state.frontAfter.content.acceptedActions.slice(state.frontBefore.content.acceptedActions.length),entered=newActions.some(a=>a.kind==='MOVE_PIECE'&&a.path.includes('34,1'));
record(h,'RAIL-15','Advance past an enemy station without entering it; ending the phase changes it to friendly rail control',JSON.stringify({before:controller(state.frontBefore),preEnd:controller(preEnd),after:controller(state.frontAfter),entered,decisions,moves,beforeHover:state.frontBeforeHover,afterHover}),controller(preEnd)==='player:axis'&&controller(state.frontAfter)==='player:allied'&&!entered&&afterHover.includes('RAIL Supply Source')&&afterHover.includes('friendly rail supply path'));
await playUntil(h,async(s)=>/Turn 3/.test(s.turn),{placeArrivals});state.finalRail=await state.save();await h.shot('rail-whole-turns-complete');
return {decisions,afterHover,before:controller(state.frontBefore),after:controller(state.frontAfter),entered,where:await where(h),finalHash:state.finalRail.content.finalStateHash,revision:JSON.parse(state.finalRail.content.currentSnapshot).revision};

})();
}catch(error){record(h,'RUN','Complete every rail operation',String(error.stack??error),false);await h.shot('failure');}
await h.finish('RAIL-05–10/15–16: natural generated product operations');
const failed=h.rows.some(row=>row.status!=='PASS')||h.errors.length||['RAIL-05','RAIL-06','RAIL-07','RAIL-08','RAIL-09','RAIL-10','RAIL-15','RAIL-16'].some(id=>!h.rows.some(row=>row.id===id&&row.status==='PASS'));
await h.close();if(failed)process.exitCode=1;
